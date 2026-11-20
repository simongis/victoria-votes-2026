/**
 * Replay results source: reads the folder ingest's replay writes (contract in packages/ingest/src/replay/replay.ts)
 * over HTTP. Up front it fetches only the manifest, the two static layers and the columnar district history
 * (about 1.7 MB in all for the five-minute replay); full snapshots (about 1 to 2 MB each) are fetched one at a
 * time, only for candidate detail.
 *
 * "Now" is a demo clock: the latest tick at or before it is what status() reports, so the shell polls a replay
 * exactly as it will poll the live status table.
 */
import {
  KILL_SWITCH_STATES,
  PARTY_BUCKETS,
  type CandidateAttributes,
  type DistrictHistoryRow,
  type DistrictStatic,
  type KillSwitchState,
  type StatusAttributes,
} from '@vic26/schema'
import { seatsFromRows, statsOf, tallyOf } from '../derive/seats'
import { createReplayBoothSource } from './boothSource'
import type { ResultsSource } from './source'
import { tickIndexAt } from './ticks'
import type { GeoCollection, SeatHexStatic, Statics, Tick, Timeline } from './types'

interface Manifest {
  name: string
  dataMode: 'replay'
  source: string
  snapshots: { snapshotId: string; snapshotAt: number; file: string }[]
  synthetic?: string[]
}

interface Columns {
  fields: string[]
  rows: unknown[][]
}

export type FetchJson = <T>(url: string) => Promise<T>

/** VE-149: a hung request fails with a plain error instead of leaving the app on "Loading". */
export const REPLAY_FETCH_TIMEOUT_MS = 20_000

export const fetchJsonOverHttp: FetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(REPLAY_FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return (await res.json()) as T
}

export interface ReplayOptions {
  /** URL prefix of the replay folder, ending in a slash. */
  base: string
  /** Demo "now" in epoch ms, read on every call; given the full tick list so a `?now=` can be resolved against it. */
  clock: (ticks: readonly Tick[]) => number
  fetchJson?: FetchJson
  /** Kill-switch override (`?state=`) so the shell's paused and offline handling can be seen on a replay. */
  state?: string | null
  message?: string | null
  pollMs?: number
}

interface Loaded {
  manifest: Manifest
  statics: Statics
  ticks: Tick[]
  rows: DistrictHistoryRow[][]
}

const SNAPSHOT_CACHE = 3

export function createReplaySource(opts: ReplayOptions): ResultsSource {
  const fetchJson = opts.fetchJson ?? fetchJsonOverHttp
  const { base } = opts
  const state: KillSwitchState = (KILL_SWITCH_STATES as readonly string[]).includes(opts.state ?? '')
    ? (opts.state as KillSwitchState)
    : 'live'

  let loading: Promise<Loaded> | null = null
  const load = (): Promise<Loaded> => {
    loading ??= (async () => {
      const [manifest, districts, seatHexes, cols] = await Promise.all([
        fetchJson<Manifest>(`${base}manifest.json`),
        fetchJson<GeoCollection<DistrictStatic>>(`${base}static/districts.geojson`),
        fetchJson<GeoCollection<SeatHexStatic>>(`${base}static/seat-hexes.geojson`),
        fetchJson<Columns>(`${base}history/district_history.columns.json`),
      ])
      const statics: Statics = {
        districts,
        seatHexes,
        districtById: new Map(districts.features.map((f) => [f.properties.district_id, f.properties])),
      }
      const bySnapshot = new Map<string, DistrictHistoryRow[]>()
      for (const r of cols.rows) {
        const row = Object.fromEntries(cols.fields.map((f, i) => [f, r[i]])) as unknown as DistrictHistoryRow
        const list = bySnapshot.get(row.snapshot_id)
        if (list) list.push(row)
        else bySnapshot.set(row.snapshot_id, [row])
      }
      const rows = manifest.snapshots.map((s) => bySnapshot.get(s.snapshotId) ?? [])
      const enrolment = districts.features.reduce((a, f) => a + (f.properties.enrolment ?? 0), 0)
      const synthetic = new Set(manifest.synthetic ?? [])
      const ticks: Tick[] = manifest.snapshots.map((s, i) => ({
        snapshotId: s.snapshotId,
        snapshotAt: s.snapshotAt,
        // Same sum ingest's status uses, so this matches votes_counted_pct.
        countedPct: enrolment > 0 ? (100 * rows[i]!.reduce((a, r) => a + (r.fp_total ?? 0), 0)) / enrolment : 0,
        synthetic: synthetic.has(s.snapshotId),
      }))
      return { manifest, statics, ticks, rows }
    })()
    // A failed load is retried on the next poll rather than cached.
    loading.catch(() => (loading = null))
    return loading
  }

  const nowIndex = (l: Loaded) => tickIndexAt(l.ticks, opts.clock(l.ticks))

  const snapshots = new Map<string, Promise<{ candidates: CandidateAttributes[] }>>()
  const snapshotFile = (l: Loaded, snapshotId: string) => {
    let p = snapshots.get(snapshotId)
    if (!p) {
      const m = l.manifest.snapshots.find((s) => s.snapshotId === snapshotId)
      if (!m) return null
      p = fetchJson<{ candidates: CandidateAttributes[] }>(`${base}${m.file}`)
      p.catch(() => snapshots.delete(snapshotId))
      snapshots.set(snapshotId, p)
      while (snapshots.size > SNAPSHOT_CACHE) snapshots.delete(snapshots.keys().next().value as string)
    }
    return p
  }

  return {
    kind: 'replay',
    pollMs: opts.pollMs ?? 5_000,
    note: 'Replay of the 2022 count, not live results.',
    booths: createReplayBoothSource(base),
    statics: async () => (await load()).statics,

    async status() {
      const l = await load()
      const i = nowIndex(l)
      const tick = l.ticks[i]
      const seats = seatsFromRows(i < 0 ? [] : l.rows[i]!, l.statics.districtById.values())
      const t = tallyOf(seats)
      const stats = statsOf(seats)
      const seatCounts = Object.fromEntries(PARTY_BUCKETS.map((p) => [`seats_${p}`, t.firm[p] + t.leading[p]]))
      return {
        state,
        message: opts.message ?? null,
        snapshot_id: tick?.snapshotId ?? null,
        snapshot_at: tick?.snapshotAt ?? null,
        ingested_at: tick?.snapshotAt ?? null,
        ...(seatCounts as Pick<StatusAttributes, `seats_${(typeof PARTY_BUCKETS)[number]}`>),
        seats_declared: [...seats.values()].filter((s) => s.state === 'won').length,
        seats_in_doubt: stats.inDoubt,
        votes_counted_pct: tick ? Math.round(tick.countedPct * 100) / 100 : null,
        feed_phase: null,
        data_mode: 'replay',
      }
    },

    async timeline(): Promise<Timeline> {
      const l = await load()
      const n = nowIndex(l) + 1
      return { ticks: l.ticks.slice(0, n), rows: l.rows.slice(0, n) }
    },

    async candidates(snapshotId, districtId) {
      const l = await load()
      const p = snapshotFile(l, snapshotId)
      if (!p) return null
      return (await p).candidates.filter((c) => c.district_id === districtId)
    },
  }
}
