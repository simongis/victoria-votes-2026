import { createContext, useContext, useEffect, useState } from 'react'
import { fetchJsonTimed, FETCH_TIMEOUT_MS, type BoothColumns, type BoothSource } from '../../data/boothSource'
import { groupEvcs, hasEvcResults, type EvcGroup } from './evc'
import { parseBoothHistory, parseBoothStatics, type ParsedHistory, type ParsedStatics } from './model'

export { fetchJsonTimed, FETCH_TIMEOUT_MS }

/** Everything the dots need: where each booth is and how its count has grown. */
export interface BoothData extends ParsedStatics, ParsedHistory {
  /** Early voting centres, one per physical centre. Empty unless the source has results for them (none on the 2022 replay). */
  evcGroups: EvcGroup[]
  /** The history as read (all rows so far), for views that parse it their own way (Other votes). */
  columns: BoothColumns
}

export interface BoothStore {
  /** The booth data as at `at` (epoch ms, the viewed tick). A live source is topped up when `at` moves past the last read. */
  load(at: number): Promise<BoothData>
}

/** The booth source for the current results source, shared by the places chip and the lenses that read booth history. Null where there is none. */
export const BoothSourceContext = createContext<BoothSource | null>(null)
export const useBoothSource = (): BoothSource | null => useContext(BoothSourceContext)

const stores = new WeakMap<BoothSource, BoothStore>()

/**
 * One store per booth source. Statics are read once and history on first use, so the first paint does not grow
 * (ADR 0020). A live source then reads only the rows after the last one it has (booth_history is append-only), once
 * per new tick, so a poll costs one request in the usual case. A failed top-up keeps the last good data (hard rule 5's
 * spirit on the client); a failed first read rejects and is tried again on the next call.
 */
export function boothStore(src: BoothSource): BoothStore {
  let store = stores.get(src)
  if (!store) {
    store = createBoothStore(src)
    stores.set(src, store)
  }
  return store
}

export function createBoothStore(src: BoothSource): BoothStore {
  let statics: Promise<ParsedStatics> | null = null
  let fields: string[] | null = null
  let rows: unknown[][] = []
  let lastRowAt: number | null = null
  let fetchedFor = -Infinity
  let data: BoothData | null = null
  // Calls run one after another so two ticks arriving together never read the same rows twice.
  let chain: Promise<unknown> = Promise.resolve()

  async function step(at: number): Promise<BoothData> {
    statics ??= src.statics().then(parseBoothStatics)
    statics.catch(() => (statics = null))
    const s = await statics
    if (data && !(src.incremental && at > fetchedFor)) return data
    try {
      const cols = await src.history(src.incremental ? lastRowAt : null)
      if (src.incremental && fields) rows = rows.concat(cols.rows)
      else rows = cols.rows
      fields = cols.fields
      const atCol = fields.indexOf('snapshot_at')
      for (const r of cols.rows) {
        const t = Number(r[atCol])
        if (Number.isFinite(t) && (lastRowAt === null || t > lastRowAt)) lastRowAt = t
      }
      fetchedFor = at
      const h = parseBoothHistory({ fields, rows })
      data = { ...s, ...h, evcGroups: hasEvcResults(s.evc, h.byBooth) ? groupEvcs(s.evc) : [], columns: { fields, rows } }
      return data
    } catch (e) {
      if (data) return data
      throw e
    }
  }

  return {
    load(at) {
      const p = chain.then(() => step(at))
      chain = p.catch(() => undefined)
      return p
    },
  }
}

export type BoothLoad = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: BoothData }

/** Loads the booth data once `enabled` turns true (the chip or the Other votes view is picked), and tops it up as `at` moves. */
export function useBoothData(enabled: boolean, source: BoothSource | null, at: number): BoothLoad {
  const [state, setState] = useState<{ source: BoothSource | null; load: BoothLoad }>({ source, load: { status: 'idle' } })
  useEffect(() => {
    if (!enabled || !source) return
    let alive = true
    boothStore(source).load(at).then(
      // The same data object comes back when nothing new was read, so a replay tick does not re-render the dots for nothing.
      (data) => alive && setState((s) => (s.source === source && s.load.status === 'ready' && s.load.data === data ? s : { source, load: { status: 'ready', data } })),
      () => alive && setState((s) => (s.source === source && s.load.status === 'ready' ? s : { source, load: { status: 'error' } })),
    )
    return () => {
      alive = false
    }
  }, [enabled, source, at])
  if (!enabled || !source) return { status: 'idle' }
  return state.source === source && state.load.status !== 'idle' ? state.load : { status: 'loading' }
}

/** Whether the source has booths at all, asked once per source and only when the source says it can (the live layer). Replay answers at once. */
export function useBoothsAvailable(source: BoothSource | null): boolean {
  const [found, setFound] = useState<{ source: BoothSource; ok: boolean } | null>(null)
  useEffect(() => {
    if (!source) return
    let alive = true
    source.available().then((ok) => alive && setFound({ source, ok }), () => alive && setFound({ source, ok: false }))
    return () => {
      alive = false
    }
  }, [source])
  return source !== null && found?.source === source && found.ok
}
