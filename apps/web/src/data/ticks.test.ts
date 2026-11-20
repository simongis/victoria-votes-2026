import { describe, expect, it } from 'vitest'
import { demoClock, resolveNowParam, tickIndexAt } from './ticks'

const ticks = [
  { snapshotId: '20221126_180329', snapshotAt: 1_000 },
  { snapshotId: '20221126_180500', snapshotAt: 2_000 },
  { snapshotId: '20221126_181000', snapshotAt: 3_000 },
  { snapshotId: '20221126_210000', snapshotAt: 4_000 },
]

describe('tickIndexAt', () => {
  it('picks the latest tick at or before the clock', () => {
    expect(tickIndexAt(ticks, 2_000)).toBe(1)
    expect(tickIndexAt(ticks, 2_999)).toBe(1)
    expect(tickIndexAt(ticks, 3_000)).toBe(2)
  })
  it('is -1 before the first tick, so nothing is shown before results exist', () => {
    expect(tickIndexAt(ticks, 999)).toBe(-1)
  })
  it('holds the last tick once the clock passes the end', () => {
    expect(tickIndexAt(ticks, 99_000)).toBe(3)
  })
  it('is -1 with no ticks', () => {
    expect(tickIndexAt([], 5_000)).toBe(-1)
  })
})

describe('resolveNowParam', () => {
  it('reads a snapshot id as the first tick at or after it', () => {
    expect(resolveNowParam(ticks, '20221126_181000')).toBe(3_000)
    expect(resolveNowParam(ticks, '20221126_190000')).toBe(4_000)
  })
  it('reads a snapshot id past the end as the last tick', () => {
    expect(resolveNowParam(ticks, '20221215_180000')).toBe(4_000)
  })
  it('reads "latest" as the last tick', () => {
    expect(resolveNowParam(ticks, 'latest')).toBe(4_000)
  })
  it('reads a small integer as a tick index, clamped', () => {
    expect(resolveNowParam(ticks, '1')).toBe(2_000)
    expect(resolveNowParam(ticks, '40')).toBe(4_000)
  })
  it('reads an ISO time as epoch ms', () => {
    expect(resolveNowParam(ticks, '2022-11-26T10:00:00Z')).toBe(Date.parse('2022-11-26T10:00:00Z'))
  })
  it('returns null for nothing or nonsense', () => {
    expect(resolveNowParam(ticks, null)).toBeNull()
    expect(resolveNowParam(ticks, 'soon')).toBeNull()
  })
})

describe('demoClock', () => {
  it('runs demo time faster than real time by feed interval over cadence', () => {
    // 15 s of real time is one 5-minute feed interval: 20 times faster.
    const clock = demoClock({ startMs: 10_000, realStart: 500, cadenceMs: 15_000, feedMs: 300_000 })
    expect(clock(500)).toBe(10_000)
    expect(clock(15_500)).toBe(310_000)
    expect(clock(8_000)).toBe(160_000)
  })
})
