import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBoothStore, fetchJsonTimed } from './data'
import type { BoothSource } from '../../data/boothSource'

afterEach(() => vi.useRealTimers())

describe('fetchJsonTimed', () => {
  it('gives up on a hung request so the view can say it failed instead of loading forever', async () => {
    vi.useFakeTimers()
    const hung = ((_u: string, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as typeof fetch
    const p = fetchJsonTimed('x', 15_000, hung)
    const caught = p.catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(15_001)
    expect(await caught).toMatch(/aborted|timed out/)
  })

  it('returns the body when the request is quick', async () => {
    const ok = (async () => ({ ok: true, json: async () => ({ a: 1 }) })) as unknown as typeof fetch
    expect(await fetchJsonTimed('x', 15_000, ok)).toEqual({ a: 1 })
  })
})

describe('booth store', () => {
  const FIELDS = ['snapshot_at', 'booth_id', 'district_id', 'fp_ALP', 'fp_LIB', 'fp_NAT', 'fp_GRN', 'fp_ONP', 'fp_IND', 'fp_OTH', 'tcp_party_a', 'tcp_pct_a']
  const row = (at: number, booth: number, alp: number) => [at, booth, 1, alp, 0, 0, 0, 0, 0, 0, 'ALP', 50]
  const statics = { features: [{ properties: { booth_id: 1, booth_name: 'A', district_id: 1, booth_type: 'election_day' }, geometry: { type: 'Point' as const, coordinates: [144.96, -37.81] as [number, number] } }] }

  function fake(incremental: boolean, batches: unknown[][][]) {
    const sinces: (number | null)[] = []
    const src: BoothSource = {
      incremental,
      available: async () => true,
      statics: async () => statics,
      history: async (since) => {
        sinces.push(since)
        const next = batches.shift()
        if (!next) throw new Error('down')
        return { fields: FIELDS, rows: next }
      },
    }
    return { src, sinces }
  }

  it('tops a live source up with only the rows after the last one, once per new tick', async () => {
    const { src, sinces } = fake(true, [[row(100, 1, 10)], [row(200, 1, 30)]])
    const store = createBoothStore(src)
    const a = await store.load(100)
    expect(a.byBooth.get(1)).toHaveLength(1)
    expect((await store.load(100)).byBooth.get(1)).toHaveLength(1) // same tick: no request
    const b = await store.load(200)
    expect(b.byBooth.get(1)!.map((r) => r.fp.ALP)).toEqual([10, 30])
    expect(sinces).toEqual([null, 100])
    expect(b.columns.rows).toHaveLength(2)
  })

  it('reads a replay once and does not top it up', async () => {
    const { src, sinces } = fake(false, [[row(100, 1, 10), row(200, 1, 30)]])
    const store = createBoothStore(src)
    await store.load(100)
    await store.load(900)
    expect(sinces).toEqual([null])
  })

  it('keeps the last good data when a top-up fails, and rejects (then retries) when the first read fails', async () => {
    const { src } = fake(true, [[row(100, 1, 10)]])
    const store = createBoothStore(src)
    await store.load(100)
    expect((await store.load(200)).byBooth.get(1)).toHaveLength(1)

    const failing = fake(true, [])
    const s2 = createBoothStore(failing.src)
    await expect(s2.load(100)).rejects.toThrow()
    failing.src.history = async () => ({ fields: FIELDS, rows: [row(100, 1, 5)] })
    expect((await s2.load(100)).byBooth.get(1)).toHaveLength(1)
  })

  it('shows an empty layer as no booths with history, not an error', async () => {
    const { src } = fake(true, [[]])
    const d = await createBoothStore(src).load(100)
    expect(d.byBooth.size).toBe(0)
    expect(d.booths).toHaveLength(1)
  })
})
