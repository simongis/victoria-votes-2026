import { describe, expect, it } from 'vitest'
import { BASE_MS, FEED_MS, nextDelay, shouldCatchUp, type PollInput } from './pollPlan'

const T0 = Date.UTC(2026, 10, 28, 9, 0, 0)
const input = (o: Partial<PollInput> = {}): PollInput => ({
  now: T0,
  snapshotAt: null,
  visible: true,
  errors: 0,
  state: 'live',
  rand: () => 0,
  ...o,
})

describe('nextDelay', () => {
  it('is 30 s plus 0-15 s of jitter in the quiet case', () => {
    expect(nextDelay(input({ rand: () => 0 }))).toBe(30_000)
    expect(nextDelay(input({ rand: () => 0.5 }))).toBe(37_500)
    expect(nextDelay(input({ rand: () => 0.999 }))).toBeLessThan(45_000)
  })

  it('waits 5 minutes in a hidden tab', () => {
    expect(nextDelay(input({ visible: false }))).toBe(5 * 60_000)
  })

  it('backs off 2x per error up to 5 minutes, and resets at zero errors', () => {
    expect(nextDelay(input({ errors: 1 }))).toBe(60_000)
    expect(nextDelay(input({ errors: 2 }))).toBe(120_000)
    expect(nextDelay(input({ errors: 3 }))).toBe(240_000)
    expect(nextDelay(input({ errors: 4 }))).toBe(300_000)
    expect(nextDelay(input({ errors: 40 }))).toBe(300_000)
    expect(nextDelay(input({ errors: 0 }))).toBe(BASE_MS)
  })

  it('slows to 2 minutes when paused or offline (ADR 0009)', () => {
    expect(nextDelay(input({ state: 'paused' }))).toBe(120_000)
    expect(nextDelay(input({ state: 'offline' }))).toBe(120_000)
  })

  it('tightens to 15 s for one minute after the expected VEC update', () => {
    const snapshotAt = T0 - FEED_MS // the next update is due right now
    expect(nextDelay(input({ snapshotAt }))).toBe(15_000)
    expect(nextDelay(input({ snapshotAt, now: T0 + 59_000 }))).toBe(15_000)
    // a minute and more past due: back to normal
    expect(nextDelay(input({ snapshotAt, now: T0 + 61_000 }))).toBe(BASE_MS)
  })

  it('shortens a wait that would overshoot the expected update, so the poll lands just after it', () => {
    const snapshotAt = T0 - FEED_MS + 10_000 // due in 10 s
    expect(nextDelay(input({ snapshotAt }))).toBe(10_000)
    // jitter on top (0-5 s) so browsers do not all arrive on the same second
    expect(nextDelay(input({ snapshotAt, rand: () => 0.5 }))).toBe(12_500)
  })

  it('does not tighten when hidden, paused or backing off', () => {
    const snapshotAt = T0 - FEED_MS
    expect(nextDelay(input({ snapshotAt, visible: false }))).toBe(300_000)
    expect(nextDelay(input({ snapshotAt, state: 'paused' }))).toBe(120_000)
    expect(nextDelay(input({ snapshotAt, errors: 2 }))).toBe(120_000)
  })

  it('combines hidden and backoff by taking the longer', () => {
    expect(nextDelay(input({ visible: false, errors: 1 }))).toBe(300_000)
  })
})

describe('shouldCatchUp', () => {
  it('polls straight away on becoming visible when the last check is over 30 s old', () => {
    expect(shouldCatchUp({ now: T0, lastCheckAt: T0 - 31_000, visible: true })).toBe(true)
    expect(shouldCatchUp({ now: T0, lastCheckAt: T0 - 29_000, visible: true })).toBe(false)
    expect(shouldCatchUp({ now: T0, lastCheckAt: null, visible: true })).toBe(true)
  })
  it('never catches up while hidden', () => {
    expect(shouldCatchUp({ now: T0, lastCheckAt: T0 - 999_000, visible: false })).toBe(false)
  })
})
