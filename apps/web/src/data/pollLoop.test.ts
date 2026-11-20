import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startPolling } from './pollLoop'

function fakeDoc() {
  let handler: (() => void) | null = null
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_: string, h: () => void) => void (handler = h),
    removeEventListener: () => void (handler = null),
  }
  return { doc, fire: (v: DocumentVisibilityState) => { doc.visibilityState = v; handler?.() } }
}

describe('startPolling', () => {
  beforeEach(() => vi.useFakeTimers({ now: Date.UTC(2026, 10, 28) }))
  afterEach(() => vi.useRealTimers())

  const ok = { snapshotAt: null, state: 'live' as const }

  it('checks at once, then every 30 s (seeded jitter of zero)', async () => {
    const check = vi.fn(async () => ok)
    const { doc } = fakeDoc()
    const stop = startPolling({ check, rand: () => 0, doc })
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(2)
    stop()
  })

  it('never has two checks in flight, even when the tab becomes visible mid-check', async () => {
    let inFlight = 0
    let peak = 0
    const check = vi.fn(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5_000))
      inFlight--
      return ok
    })
    const { doc, fire } = fakeDoc()
    const stop = startPolling({ check, rand: () => 0, doc })
    await vi.advanceTimersByTimeAsync(1_000)
    fire('hidden')
    fire('visible')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(peak).toBe(1)
    stop()
  })

  it('slows to 5 minutes when hidden and catches up straight away when shown after 30 s', async () => {
    const check = vi.fn(async () => ok)
    const { doc, fire } = fakeDoc()
    const stop = startPolling({ check, rand: () => 0, doc })
    await vi.advanceTimersByTimeAsync(0)
    fire('hidden')
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(check).toHaveBeenCalledTimes(1) // hidden: the pending 30 s wait became 5 minutes
    fire('visible') // last check is over 30 s old
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(2)
    stop()
  })

  it('does not catch up when the last check was under 30 s ago', async () => {
    const check = vi.fn(async () => ok)
    const { doc, fire } = fakeDoc()
    const stop = startPolling({ check, rand: () => 0, doc })
    await vi.advanceTimersByTimeAsync(0)
    fire('hidden')
    await vi.advanceTimersByTimeAsync(5_000)
    fire('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(1)
    stop()
  })

  it('backs off after errors and resets on success', async () => {
    let fail = true
    const check = vi.fn(async () => {
      if (fail) throw new Error('boom')
      return ok
    })
    const cycles: number[] = []
    const { doc } = fakeDoc()
    const stop = startPolling({ check, rand: () => 0, doc, onCycle: (e) => cycles.push(e) })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000) // 1 error: 60 s
    expect(check).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(119_999) // 2 errors: 120 s
    expect(check).toHaveBeenCalledTimes(2)
    fail = false
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(30_000) // success: back to 30 s
    expect(check).toHaveBeenCalledTimes(4)
    expect(cycles).toEqual([1, 2, 0, 0])
    stop()
  })

  it('uses a fixed interval when asked (replay)', async () => {
    const check = vi.fn(async () => ok)
    const { doc, fire } = fakeDoc()
    const stop = startPolling({ check, fixedMs: 5_000, doc })
    await vi.advanceTimersByTimeAsync(0)
    fire('hidden')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(check).toHaveBeenCalledTimes(2)
    stop()
  })

  it('stops cleanly', async () => {
    const check = vi.fn(async () => ok)
    const { doc } = fakeDoc()
    const stop = startPolling({ check, doc })
    await vi.advanceTimersByTimeAsync(0)
    stop()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(check).toHaveBeenCalledTimes(1)
  })
})
