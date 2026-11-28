import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgolBoothSource, createReplayBoothSource, timestampLiteral } from './boothSource'

const URL_ = 'https://example.test/FeatureServer'
/** The status row's snapshot_at: history beyond it is not confirmed (VE-163). */
const CONFIRMED = Date.UTC(2026, 10, 28, 12, 0, 0)

afterEach(() => vi.useRealTimers())

function stub(handler: (layer: string, params: URLSearchParams) => unknown) {
  const seen: string[] = []
  const fetchJson = async <T,>(url: string): Promise<T> => {
    seen.push(url)
    const u = new URL(url)
    const layer = u.pathname.split('/').slice(-2)[0]!
    return handler(layer, u.searchParams) as T
  }
  return { fetchJson, seen }
}

const hist = (at: number, booth: number, o: Record<string, unknown> = {}) => ({
  attributes: { snapshot_at: at, booth_id: booth, district_id: 1, fp_ALP: 10, fp_LIB: 5, tcp_party_a: 'ALP', tcp_pct_a: 60, ...o },
})

describe('timestampLiteral', () => {
  it('writes a UTC SQL timestamp the hosted service accepts', () => {
    expect(timestampLiteral(Date.UTC(2026, 10, 28, 9, 5, 0))).toBe("TIMESTAMP '2026-11-28 09:05:00'")
  })
})

describe('AGOL booth source: statics', () => {
  it('asks the booths layer for the static fields and their points only, and returns the parser shape', async () => {
    const { fetchJson, seen } = stub(() => ({
      features: [{ attributes: { booth_id: 7, booth_name: 'Town Hall', district_id: 3, booth_type: 'election_day' }, geometry: { x: 144.96, y: -37.81 } }],
    }))
    const s = await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson }).statics()
    expect(s.features).toEqual([
      { properties: { booth_id: 7, booth_name: 'Town Hall', district_id: 3, booth_type: 'election_day' }, geometry: { type: 'Point', coordinates: [144.96, -37.81] } },
    ])
    const u = new URL(seen[0]!)
    expect(u.pathname).toContain('/2/query')
    expect(u.searchParams.get('outFields')).toBe('booth_id,booth_name,district_id,booth_type,base_match,base_tcp_party_a,base_tcp_party_b,base_tcp_pct_a') // the last four: the panel's swing (VE-208), all on the existing booths layer
    expect(u.searchParams.get('returnGeometry')).toBe('true')
    expect(u.searchParams.get('outSR')).toBe('4326')
  })

  it('keeps a booth with no location as a feature without geometry (the parser counts it as skipped)', async () => {
    const { fetchJson } = stub(() => ({ features: [{ attributes: { booth_id: 8, district_id: 3, booth_type: 'evc' } }] }))
    const s = await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson }).statics()
    expect(s.features[0]!.geometry).toBeNull()
  })

  it('pages until the service stops saying it exceeded the transfer limit', async () => {
    const page = (ids: number[], more: boolean) => ({
      features: ids.map((i) => ({ attributes: { booth_id: i, district_id: 1, booth_type: 'election_day' }, geometry: { x: 145, y: -37 } })),
      exceededTransferLimit: more,
    })
    const { fetchJson, seen } = stub((_l, p) => (p.get('resultOffset') === '0' ? page([1, 2], true) : page([3], false)))
    const s = await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson }).statics()
    expect(s.features.map((f) => f.properties.booth_id)).toEqual([1, 2, 3])
    expect(seen).toHaveLength(2)
    // VE-316: the next page starts after the rows the server sent (it may cap a page below the asked size), not at 2000.
    expect(new URL(seen[1]!).searchParams.get('resultOffset')).toBe('2')
  })

  it('reads every row when the server caps a page below the asked size (VE-316: the live view returns 1000 at most)', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i + 1)
    const { fetchJson } = stub((_l, p) => {
      const off = Number(p.get('resultOffset'))
      const ids = all.slice(off, off + 1000)
      return { features: ids.map((i) => ({ attributes: { booth_id: i, district_id: 1, booth_type: 'election_day' }, geometry: { x: 145, y: -37 } })), exceededTransferLimit: off + 1000 < all.length }
    })
    const s = await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson }).statics()
    expect(s.features.map((f) => f.properties.booth_id)).toEqual(all)
  })

  it('returns an empty file for an empty layer', async () => {
    const { fetchJson } = stub(() => ({ features: [] }))
    expect((await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson }).statics()).features).toEqual([])
  })
})

describe('AGOL booth source: history', () => {
  it('reads the history layer as columns, oldest first, with only the fields the views use', async () => {
    const { fetchJson, seen } = stub(() => ({ features: [hist(1000, 7), hist(2000, 7, { fp_ALP: 20 })] }))
    const src = createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson })
    const cols = await src.history(null)
    expect(cols.fields).toContain('snapshot_at')
    expect(cols.fields).toContain('fp_ONP')
    expect(cols.fields).toContain('fp_total') // the panel's votes counted and informal (VE-208)
    expect(cols.fields).not.toContain('snapshot_id')
    expect(cols.rows).toHaveLength(2)
    const at = cols.fields.indexOf('snapshot_at')
    const alp = cols.fields.indexOf('fp_ALP')
    expect(cols.rows.map((r) => [r[at], r[alp]])).toEqual([[1000, 10], [2000, 20]])
    const u = new URL(seen[0]!)
    expect(u.pathname).toContain('/6/query')
    expect(u.searchParams.get('returnGeometry')).toBe('false')
    expect(u.searchParams.get('orderByFields')).toBe('snapshot_at,booth_id')
    expect(u.searchParams.get('where')).toBe("snapshot_at <= TIMESTAMP '2026-11-28 12:00:00'")
  })

  it('on a later poll asks only for rows after the last one it has', async () => {
    const { fetchJson, seen } = stub(() => ({ features: [] }))
    const src = createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson })
    await src.history(Date.UTC(2026, 10, 28, 9, 5, 0))
    expect(new URL(seen[0]!).searchParams.get('where')).toBe("snapshot_at > TIMESTAMP '2026-11-28 09:05:00' AND snapshot_at <= TIMESTAMP '2026-11-28 12:00:00'")
  })

  it('ignores rows beyond the confirmed snapshot even if the service returns them (VE-163)', async () => {
    const { fetchJson } = stub(() => ({ features: [hist(CONFIRMED - 1000, 7), hist(CONFIRMED, 7), hist(CONFIRMED + 1000, 7)] }))
    const cols = await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson }).history(null)
    const at = cols.fields.indexOf('snapshot_at')
    expect(cols.rows.map((r) => r[at])).toEqual([CONFIRMED - 1000, CONFIRMED])
  })

  it('rounds the ceiling up to the next whole second so a millisecond stamp is not cut off', async () => {
    const { fetchJson, seen } = stub(() => ({ features: [] }))
    await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED + 400, fetchJson }).history(null)
    expect(new URL(seen[0]!).searchParams.get('where')).toBe("snapshot_at <= TIMESTAMP '2026-11-28 12:00:01'")
  })

  it('reads nothing while no snapshot is confirmed', async () => {
    const { fetchJson, seen } = stub(() => ({ features: [hist(1000, 7)] }))
    const cols = await createAgolBoothSource({ url: URL_, confirmedAt: () => null, fetchJson }).history(null)
    expect(cols.rows).toEqual([])
    expect(seen).toEqual([])
  })

  it('pages the history', async () => {
    const { fetchJson, seen } = stub((_l, p) =>
      p.get('resultOffset') === '0' ? { features: [hist(1, 1), hist(1, 2)], exceededTransferLimit: true } : { features: [hist(2, 1)] },
    )
    const cols = await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson }).history(null)
    expect(cols.rows).toHaveLength(3)
    expect(seen).toHaveLength(2)
  })

  it('rejects with the service message on an error response', async () => {
    const { fetchJson } = stub(() => ({ error: { code: 400, message: 'Invalid layer' } }))
    await expect(createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson }).history(null)).rejects.toThrow(/Invalid layer/)
  })

  it('gives up on a hung request so the view shows a plain line, not a spinner for ever', async () => {
    vi.useFakeTimers()
    const fetchJson = (() => new Promise(() => undefined)) as never
    const p = createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson, timeoutMs: 5000 }).history(null)
    const caught = p.catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(5001)
    expect(await caught).toMatch(/timed out/)
  })
})

describe('AGOL booth source: available', () => {
  it('is true when the booths layer has rows, and costs one count-only request', async () => {
    const { fetchJson, seen } = stub(() => ({ count: 1800 }))
    expect(await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson }).available()).toBe(true)
    expect(new URL(seen[0]!).searchParams.get('returnCountOnly')).toBe('true')
    expect(seen).toHaveLength(1)
  })

  it('is false for an empty layer, and false (not an error) when the layer is missing or the request fails', async () => {
    expect(await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson: stub(() => ({ count: 0 })).fetchJson }).available()).toBe(false)
    expect(await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson: stub(() => ({ error: { code: 400, message: 'x' } })).fetchJson }).available()).toBe(false)
    const boom = (async () => {
      throw new Error('HTTP 500')
    }) as never
    expect(await createAgolBoothSource({ url: URL_, confirmedAt: () => CONFIRMED, fetchJson: boom }).available()).toBe(false)
  })
})

describe('replay booth source', () => {
  it('reads the two replay files once each and ignores the since time (the file holds the whole night)', async () => {
    const seen: string[] = []
    const fetchJson = async <T,>(url: string): Promise<T> => {
      seen.push(url)
      return (url.endsWith('.geojson') ? { features: [] } : { fields: ['snapshot_at'], rows: [[1]] }) as T
    }
    const src = createReplayBoothSource('/replay5/', fetchJson)
    expect(src.incremental).toBe(false)
    await src.statics()
    await src.history(null)
    expect(seen).toEqual(['/replay5/static/booths.geojson', '/replay5/history/booth_history.columns.json'])
    expect(await src.available()).toBe(true)
  })
})
