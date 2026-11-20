import { useEffect, useState } from 'react'
import { loadProfileData } from '../../../data/profileSource'
import { TRAIT_MEASURES, type TraitTable } from '../../../derive/sharedTraits'
import { loadPartyAsset } from '../one-nation/partyStore'
import { loadSeifa } from '../../profile/seifa'

/**
 * VE-213: the six Census and SEIFA measures for all 88 seats, joined by district id. Nothing new is fetched: the profile
 * tables come through the app's one cached loader (the seat panel's), and the other two are static assets. A source that
 * will not load leaves its measures empty, so those measures simply never count as shared (hold last good). Loaded once.
 */
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

let cached: Promise<TraitTable> | null = null

export function loadTraitTable(ids: ReadonlySet<number>): Promise<TraitTable> {
  cached ??= Promise.all([
    loadProfileData().then((d) => d.demos as unknown as Record<string, unknown>[], () => []),
    loadPartyAsset(ids).then((a) => (a?.districts ?? []) as unknown as Record<string, unknown>[]),
    loadSeifa(ids).then((a) => (a?.districts ?? []) as unknown as Record<string, unknown>[]),
  ]).then((sources) => {
    const out = new Map<number, Record<string, number | null>>()
    for (const rows of sources) {
      for (const r of rows) {
        const id = num(r['district_id'])
        if (id === null) continue
        const row = out.get(id) ?? Object.fromEntries(TRAIT_MEASURES.map((m) => [m.key, null as number | null]))
        for (const m of TRAIT_MEASURES) row[m.key] = num(r[m.key]) ?? row[m.key] ?? null
        out.set(id, row)
      }
    }
    return out
  })
  return cached
}

/** null while loading. */
export function useTraitTable(ids: ReadonlySet<number>): TraitTable | null {
  const [t, setT] = useState<TraitTable | null>(null)
  const size = ids.size
  useEffect(() => {
    let alive = true
    void loadTraitTable(ids).then((x) => alive && setT(x))
    return () => {
      alive = false
    }
    // The ids are the 88 district ids, fixed for the session; the size is the only thing that can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])
  return t
}
