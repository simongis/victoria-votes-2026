import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReplaySource, fetchJsonOverHttp } from './replaySource'

// A two-district, three-tick replay in the folder layout VE-13a writes.
const FIELDS = ['snapshot_id', 'snapshot_at', 'district_id', 'pct_counted', 'fp_total', 'lead_party', 'tcp_party_a', 'tcp_party_b', 'tcp_pct_a', 'tcp_withheld', 'status']
const row = (id: string, at: number, d: number, fp: number, lead: string | null, pct: number | null, status = 'counting') =>
  [id, at, d, fp / 100, fp, lead, pct === null ? null : lead, pct === null ? null : 'LIB', pct, false, status]

const files: Record<string, unknown> = {
  '/r/manifest.json': {
    name: 'test',
    dataMode: 'replay',
    source: 'test',
    snapshots: [
      { snapshotId: '20221126_180000', snapshotAt: 1_000, file: 'snapshots/a.json' },
      { snapshotId: '20221126_180500', snapshotAt: 2_000, file: 'snapshots/b.json' },
      { snapshotId: '20221126_181000', snapshotAt: 3_000, file: 'snapshots/c.json' },
    ],
    held: [],
    synthetic: ['20221126_180500'],
  },
  '/r/static/districts.geojson': {
    type: 'FeatureCollection',
    features: [1, 2].map((d) => ({
      type: 'Feature',
      geometry: null,
      properties: { district_id: d, district_name: `D${d} District`, enrolment: 10_000, base_source: 'SE2022', base_winner_party: 'LIB' },
    })),
  },
  '/r/static/seat-hexes.geojson': { type: 'FeatureCollection', features: [] },
  '/r/history/district_history.columns.json': {
    fields: FIELDS,
    rows: [
      row('20221126_180000', 1_000, 1, 0, null, null, 'no_results'),
      row('20221126_180000', 1_000, 2, 0, null, null, 'no_results'),
      row('20221126_180500', 2_000, 1, 1_000, 'ALP', 60),
      row('20221126_180500', 2_000, 2, 0, null, null, 'no_results'),
      row('20221126_181000', 3_000, 1, 2_000, 'ALP', 60),
      row('20221126_181000', 3_000, 2, 1_000, 'LIB', 51),
    ],
  },
  '/r/snapshots/b.json': {
    candidates: [
      { district_id: 1, candidate_name: 'SMITH, Jo', party: 'ALP' },
      { district_id: 2, candidate_name: 'JONES, Al', party: 'LIB' },
    ],
  },
}

const fetchJson = async <T,>(url: string): Promise<T> => {
  if (!(url in files)) throw new Error(`${url}: HTTP 404`)
  return files[url] as T
}

function make(clockMs: number, opts: { state?: string | null; message?: string | null } = {}) {
  let clock = clockMs
  const src = createReplaySource({ base: '/r/', fetchJson, clock: () => clock, ...opts })
  return { src, setClock: (ms: number) => (clock = ms) }
}

describe('replay source', () => {
  it('reports the tick at or before the demo clock as the status snapshot, marked replay', async () => {
    const { src } = make(2_500)
    const s = (await src.status())!
    expect(s.snapshot_id).toBe('20221126_180500')
    expect(s.snapshot_at).toBe(2_000)
    expect(s.data_mode).toBe('replay')
    expect(s.state).toBe('live')
  })

  it('derives the status seats and counted share from history', async () => {
    const { src } = make(3_000)
    const s = (await src.status())!
    expect(s.seats_ALP).toBe(1)
    expect(s.seats_LIB).toBe(1)
    expect(s.seats_in_doubt).toBe(1)
    expect(s.votes_counted_pct).toBeCloseTo(15)
  })

  it('advances with the clock', async () => {
    const { src, setClock } = make(1_500)
    expect((await src.status())!.snapshot_id).toBe('20221126_180000')
    setClock(9_000)
    expect((await src.status())!.snapshot_id).toBe('20221126_181000')
  })

  it('serves the timeline only up to now', async () => {
    const { src } = make(2_000)
    const t = await src.timeline()
    expect(t.ticks.map((x) => x.snapshotId)).toEqual(['20221126_180000', '20221126_180500'])
    expect(t.ticks[1]!.synthetic).toBe(true)
    expect(t.rows[1]!.find((r) => r.district_id === 1)!.tcp_pct_a).toBe(60)
  })

  it('has no snapshot and an empty timeline before the first tick', async () => {
    const { src } = make(500)
    expect((await src.status())!.snapshot_id).toBeNull()
    expect((await src.timeline()).ticks).toEqual([])
  })

  it('honours a kill-switch override for testing the shell', async () => {
    const { src } = make(2_000, { state: 'paused', message: 'Checking' })
    const s = (await src.status())!
    expect(s.state).toBe('paused')
    expect(s.message).toBe('Checking')
    const { src: bad } = make(2_000, { state: 'nonsense' })
    expect((await bad.status())!.state).toBe('live')
  })

  it('fetches candidates for one district from the snapshot file on demand', async () => {
    const { src } = make(3_000)
    const c = await src.candidates('20221126_180500', 1)
    expect(c?.map((x) => x.candidate_name)).toEqual(['SMITH, Jo'])
  })

  it('loads the static layers', async () => {
    const { src } = make(3_000)
    const st = await src.statics()
    expect(st.districtById.get(2)?.district_name).toBe('D2 District')
  })
})

describe('fetchJsonOverHttp (VE-149)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('gives the request a deadline and reports a timeout as a plain error', async () => {
    let signal: AbortSignal | null | undefined
    vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => {
      signal = init?.signal
      throw new DOMException('The operation timed out', 'TimeoutError')
    })
    await expect(fetchJsonOverHttp('/x.json')).rejects.toThrow(/timed out/)
    expect(signal).toBeInstanceOf(AbortSignal)
  })
})
