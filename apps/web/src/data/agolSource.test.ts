import { describe, expect, it } from 'vitest'
import { statusView } from '../derive/status'
import { createAgolSource, CROSS_CHECK_MS } from './agolSource'

const URL_ = 'https://example.test/FeatureServer'

function stub(responses: Record<string, unknown>) {
  const seen: string[] = []
  const fetchJson = async <T,>(url: string): Promise<T> => {
    seen.push(url)
    const layer = url.slice(URL_.length + 1).split('/')[0]!
    if (!(layer in responses)) throw new Error('HTTP 400')
    return responses[layer] as T
  }
  return { fetchJson, seen }
}

describe('AGOL source', () => {
  it('reads the one status row from the status layer by its schema id', async () => {
    const { fetchJson, seen } = stub({ '7': { features: [{ attributes: { state: 'paused', data_mode: 'live', snapshot_id: null } }] } })
    const s = (await createAgolSource({ url: URL_, fetchJson }).status())!
    expect(s.state).toBe('paused')
    expect(seen[0]).toContain('/7/query?')
    expect(seen[0]).toContain('f=json')
  })

  it('resolves status to null when the table is empty: before the first live publish there is no row yet (VE-233)', async () => {
    const { fetchJson } = stub({ '7': { features: [] } })
    await expect(createAgolSource({ url: URL_, fetchJson }).status()).resolves.toBeNull()
  })

  it('still fails status when the status read itself fails', async () => {
    const { fetchJson } = stub({ '7': { error: { code: 500, message: 'boom' } } })
    await expect(createAgolSource({ url: URL_, fetchJson }).status()).rejects.toThrow(/boom/)
  })

  it('picks up the first row once it appears after an empty read', async () => {
    const responses: Record<string, unknown> = { '7': { features: [] } }
    const { fetchJson } = stub(responses)
    const src = createAgolSource({ url: URL_, fetchJson })
    expect(await src.status()).toBeNull()
    responses['7'] = { features: [{ attributes: { state: 'live', data_mode: 'live', snapshot_id: 's1' } }] }
    expect((await src.status())?.snapshot_id).toBe('s1')
  })

  it('degrades to an empty timeline when district history is missing or errors', async () => {
    const { fetchJson } = stub({ '5': { error: { code: 400, message: 'Invalid layer' } } })
    const t = await createAgolSource({ url: URL_, fetchJson }).timeline()
    expect(t.ticks).toEqual([])
  })

  it('groups history rows into ticks in time order', async () => {
    const r = (id: string, at: number, d: number) => ({ attributes: { snapshot_id: id, snapshot_at: at, district_id: d, fp_total: 100 } })
    const { fetchJson } = stub({
      '7': { features: [{ attributes: { state: 'live', data_mode: 'live', snapshot_id: 'b', snapshot_at: 2 } }] },
      '5': { features: [r('b', 2, 1), r('a', 1, 1), r('a', 1, 2)] },
      '0': { type: 'FeatureCollection', features: [{ properties: { district_id: 1, enrolment: 1000 } }, { properties: { district_id: 2, enrolment: 1000 } }] },
      '1': { type: 'FeatureCollection', features: [] },
    })
    const t = await createAgolSource({ url: URL_, fetchJson }).timeline()
    expect(t.ticks.map((x) => x.snapshotId)).toEqual(['a', 'b'])
    expect(t.rows[0]).toHaveLength(2)
    expect(t.ticks[0]!.countedPct).toBe(10)
  })

  it('ADR 0036: the current tick takes a declared winner from the districts layer, past ticks do not', async () => {
    const r = (id: string, at: number) => ({ attributes: { snapshot_id: id, snapshot_at: at, district_id: 1, fp_total: 100, status: 'declared', elected_party: null } })
    const fetchJson = async <T,>(url: string): Promise<T> => {
      const layer = url.slice(URL_.length + 1).split('/')[0]
      const json = url.includes('f=json')
      const res: Record<string, unknown> = {
        '7': { features: [{ attributes: { state: 'live', data_mode: 'live', snapshot_id: 'b', snapshot_at: 2 } }] },
        '5': { features: [r('a', 1), r('b', 2)] },
        '0': json
          ? { features: [{ attributes: { district_id: 1, elected_party: 'ALP' } }] }
          : { type: 'FeatureCollection', features: [{ properties: { district_id: 1, enrolment: 1000 } }] },
        '1': { type: 'FeatureCollection', features: [] },
      }
      return res[layer!] as T
    }
    const t = await createAgolSource({ url: URL_, fetchJson }).timeline()
    expect(t.rows[0]![0]!.elected_party).toBeNull()
    expect(t.rows[1]![0]!.elected_party).toBe('ALP')
  })

  describe('history is read only up to the status row (VE-163)', () => {
    const r = (id: string, at: number, d: number) => ({ attributes: { snapshot_id: id, snapshot_at: at, district_id: d, fp_total: 100 } })
    const T1 = Date.UTC(2026, 10, 28, 9, 0, 0)
    const T2 = T1 + 60_000
    const statics = {
      '0': { type: 'FeatureCollection', features: [{ properties: { district_id: 1, enrolment: 1000 } }] },
      '1': { type: 'FeatureCollection', features: [] },
    }
    const status = (id: string | null, at: number | null) => ({ features: [{ attributes: { state: 'live', data_mode: 'live', snapshot_id: id, snapshot_at: at } }] })

    it('ignores a tick the status row has not confirmed, and asks the service not to send it', async () => {
      // A publish that failed after the history layers: the history holds T2, status still says T1.
      const { fetchJson, seen } = stub({ ...statics, '7': status('a', T1), '5': { features: [r('a', T1, 1), r('b', T2, 1)] } })
      const src = createAgolSource({ url: URL_, fetchJson })
      await src.status()
      const t = await src.timeline()
      expect(t.ticks.map((x) => x.snapshotId)).toEqual(['a'])
      expect(t.rows).toHaveLength(1)
      const q = new URL(seen.find((u) => u.includes('/5/query'))!)
      expect(q.searchParams.get('where')).toBe("snapshot_at <= TIMESTAMP '2026-11-28 09:00:00'")
    })

    it('shows the newer tick once the next good publish confirms it', async () => {
      let st = status('a', T1)
      const { fetchJson } = stub({ ...statics, '7': undefined, '5': { features: [r('a', T1, 1), r('b', T2, 1)] } })
      const wrapped = async <T,>(url: string): Promise<T> => (url.includes('/7/query') ? (st as T) : fetchJson<T>(url))
      const src = createAgolSource({ url: URL_, fetchJson: wrapped })
      await src.status()
      expect((await src.timeline()).ticks).toHaveLength(1)
      st = status('b', T2)
      await src.status()
      expect((await src.timeline()).ticks.map((x) => x.snapshotId)).toEqual(['a', 'b'])
    })

    it('keeps the waiting state while the status row has no snapshot yet', async () => {
      const { fetchJson, seen } = stub({ ...statics, '7': status(null, null), '5': { features: [r('a', T1, 1)] } })
      const src = createAgolSource({ url: URL_, fetchJson })
      await src.status()
      expect((await src.timeline()).ticks).toEqual([])
      expect(seen.some((u) => u.includes('/5/query'))).toBe(false)
    })

    it('fetches the status itself when booth history is asked for before any status poll, then follows later polls', async () => {
      let st = status('a', T1)
      const { fetchJson, seen } = stub({ ...statics, '7': undefined, '6': { features: [] } })
      const wrapped = async <T,>(url: string): Promise<T> => (url.includes('/7/query') ? (st as T) : fetchJson<T>(url))
      const src = createAgolSource({ url: URL_, fetchJson: wrapped })
      await src.booths!.history(null)
      const wheres = () => seen.filter((u) => u.includes('/6/query')).map((u) => new URL(u).searchParams.get('where'))
      expect(wheres()).toEqual(["snapshot_at <= TIMESTAMP '2026-11-28 09:00:00'"])
      st = status('b', T2)
      await src.status()
      await src.booths!.history(T1)
      expect(wheres()[1]).toBe("snapshot_at > TIMESTAMP '2026-11-28 09:00:00' AND snapshot_at <= TIMESTAMP '2026-11-28 09:01:00'")
    })

    it('bounds the booth history by the same status row', async () => {
      const { fetchJson, seen } = stub({ ...statics, '7': status('a', T1), '6': { features: [] } })
      const src = createAgolSource({ url: URL_, fetchJson })
      await src.status()
      await src.booths!.history(null)
      expect(new URL(seen.find((u) => u.includes('/6/query'))!).searchParams.get('where')).toBe("snapshot_at <= TIMESTAMP '2026-11-28 09:00:00'")
    })
  })
})

describe('AGOL source with the latest.json pointer (ADR 0016)', () => {
  const PTR = 'https://cdn.test/latest.json'
  const row = (o: Record<string, unknown> = {}) => ({
    features: [{ attributes: { state: 'live', data_mode: 'live', snapshot_id: 's1', snapshot_at: 1, ingested_at: 1, ...o } }],
  })
  const ptr = (o: Record<string, unknown> = {}) => ({
    snapshot_id: 's1', snapshot_at: 1, snapshot_url: 'x', state: 'live', data_mode: 'live', written_at: new Date(1_000_000).toISOString(), ...o,
  })
  function setup(pointer: () => unknown, now: { t: number }) {
    const seen: string[] = []
    const fetchJson = async <T,>(url: string): Promise<T> => {
      seen.push(url)
      if (url === PTR) return pointer() as T
      return row() as T
    }
    const agol = () => seen.filter((u) => u !== PTR).length
    return { src: createAgolSource({ url: URL_, fetchJson, latestUrl: PTR, now: () => now.t }), seen, agol }
  }

  it('does not touch AGOL while the pointer shows nothing new', async () => {
    const now = { t: 1_000_000 }
    const { src, agol } = setup(() => ptr(), now)
    await src.status()
    now.t += 40_000
    await src.status()
    now.t += 40_000
    await src.status()
    expect(agol()).toBe(1)
  })

  it('reads the AGOL status row when the pointer shows a new snapshot or a new state', async () => {
    const now = { t: 1_000_000 }
    let p = ptr()
    const { src, agol } = setup(() => p, now)
    await src.status()
    p = ptr({ snapshot_id: 's2' })
    await src.status()
    p = ptr({ snapshot_id: 's2', state: 'paused' })
    await src.status()
    expect(agol()).toBe(3)
  })

  it('cross-checks AGOL now and then, since the operator can edit the status row without touching the pointer', async () => {
    const now = { t: 1_000_000 }
    const { src, agol } = setup(() => ptr({ written_at: new Date(now.t).toISOString() }), now)
    await src.status()
    now.t += 4 * 60_000
    await src.status()
    expect(agol()).toBe(1)
    now.t += 2 * 60_000
    await src.status()
    expect(agol()).toBe(2)
  })

  it('falls back to AGOL when the pointer fails or is stale, and says so', async () => {
    const now = { t: 1_000_000 }
    let fail = true
    const { src, agol } = setup(() => {
      if (fail) throw new Error('HTTP 503')
      return ptr()
    }, now)
    await src.status()
    expect(src.fallback?.()).toBe(true)
    fail = false
    now.t += 60 * 60_000 // pointer written an hour ago: stale
    await src.status()
    expect(src.fallback?.()).toBe(true)
    expect(agol()).toBe(2)
    now.t = 1_000_000 + 5_000
    await src.status() // fresh again, unchanged, but the last AGOL read was long ago in this fake clock
    expect(src.fallback?.()).toBe(false)
    void agol
  })

  describe('the kill switch reaches the screen (VE-159)', () => {
    /** A browser already holding a live row, with the row and pointer both settable. */
    function held(now: { t: number }) {
      const s = { row: row(), pointer: ptr() }
      const fetchJson = async <T,>(url: string): Promise<T> => (url === PTR ? s.pointer : s.row) as T
      return { s, src: createAgolSource({ url: URL_, fetchJson, latestUrl: PTR, now: () => now.t }) }
    }
    const pausedRow = row({ state: 'paused', message: 'Checking a figure' })

    it('shows the held state and message on the first poll after ingest puts it in the pointer', async () => {
      const now = { t: 1_000_000 }
      const { s, src } = held(now)
      expect(statusView(await src.status()).mode).toBe('results')
      s.row = pausedRow
      s.pointer = ptr({ state: 'paused' })
      now.t += 40_000
      const v = statusView(await src.status())
      expect(v.mode).toBe('held')
      expect(v.banner).toBe('Checking a figure')
    })

    it('still sees a held row at the cross-check when ingest never updates the pointer', async () => {
      const now = { t: 1_000_000 }
      const { s, src } = held(now)
      await src.status()
      s.row = pausedRow
      now.t += CROSS_CHECK_MS - 1
      expect(statusView(await src.status()).mode).toBe('results')
      now.t += 1
      expect(statusView(await src.status()).mode).toBe('held')
    })

    it('keeps showing held while the row and pointer agree, and goes live again when both are released', async () => {
      const now = { t: 1_000_000 }
      const { s, src } = held(now)
      s.row = pausedRow
      s.pointer = ptr({ state: 'paused' })
      expect(statusView(await src.status()).mode).toBe('held')
      now.t += 40_000
      expect(statusView(await src.status()).mode).toBe('held')
      s.row = row()
      s.pointer = ptr()
      now.t += 40_000
      expect(statusView(await src.status()).mode).toBe('results')
    })
  })

  it('goes straight to AGOL with no pointer URL set', async () => {
    const { fetchJson, seen } = stub({ '7': row() })
    const src = createAgolSource({ url: URL_, fetchJson })
    await src.status()
    await src.status()
    expect(seen).toHaveLength(2)
    expect(src.fallback?.()).toBe(false)
  })
})

// Hard rule 2 (VE-162, ADR 0030): the not-live marker follows the row's own data_mode, on either view, so a replay or
// trial row can never read as real whichever service the page was pointed at.
describe('the not-live marker follows the data row, on either view', () => {
  const VIEWS = {
    'dev view': 'https://example.test/arcgis/rest/services/vic26election_view/FeatureServer',
    'live view': 'https://example.test/arcgis/rest/services/vic26election_live_view/FeatureServer',
  }
  async function labelFor(viewUrl: string, dataMode: string | null) {
    const fetchJson = async <T,>(): Promise<T> =>
      ({ features: [{ attributes: { state: 'live', data_mode: dataMode, snapshot_id: 's1', snapshot_at: 1, ingested_at: 1 } }] }) as T
    const row = await createAgolSource({ url: viewUrl, fetchJson }).status()
    return statusView(row, 'agol').dataLabel
  }

  for (const [name, url] of Object.entries(VIEWS)) {
    it(`${name}: replay reads Replay, trial reads Trial, live is unmarked`, async () => {
      expect(await labelFor(url, 'replay')).toBe('Replay')
      expect(await labelFor(url, 'trial')).toBe('Trial')
      expect(await labelFor(url, 'live')).toBeNull()
    })

    it(`${name}: a missing or unrecognised mode is marked, never passed off as live`, async () => {
      expect(await labelFor(url, null)).toBe('Not live')
      expect(await labelFor(url, 'LIVE ')).toBe('Not live')
    })
  }
})
