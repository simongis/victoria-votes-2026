import { describe, expect, it, vi } from 'vitest'
import { createProfileLoader } from './profileSource'

const page = (rows: object[], more = false) => ({ features: rows.map((attributes) => ({ attributes })), exceededTransferLimit: more })

describe('profile loader', () => {
  it('fetches both static tables once and caches them', async () => {
    const fetchJson = vi.fn(async (url: string) => (url.includes('/8/query') ? page([{ district_id: 1 }]) : page([{ district_id: 1 }, { district_id: 2 }])))
    const load = createProfileLoader({ url: 'https://x/FeatureServer', fetchJson: fetchJson as never })
    const a = await load()
    const b = await load()
    expect(a).toBe(b)
    expect(a.demos).toHaveLength(1)
    expect(a.changes).toHaveLength(2)
    expect(fetchJson).toHaveBeenCalledTimes(2)
    expect(fetchJson.mock.calls.map((c) => c[0]).join(' ')).toMatch(/\/8\/query.*returnGeometry=false/)
  })

  it('forgets a failure so the next open can retry', async () => {
    let fail = true
    const fetchJson = vi.fn(async () => {
      if (fail) throw new Error('offline')
      return page([])
    })
    const load = createProfileLoader({ url: 'https://x', fetchJson: fetchJson as never })
    await expect(load()).rejects.toThrow('offline')
    fail = false
    await expect(load()).resolves.toEqual({ demos: [], changes: [] })
  })
})
