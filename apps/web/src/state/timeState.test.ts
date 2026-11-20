import { describe, expect, it } from 'vitest'
import { PAUSE_AFTER_MS, clockFor, pillWords, timeState } from './timeState'

const T = Date.UTC(2026, 10, 28, 9, 0, 0)
const min = (n: number) => n * 60_000
const base = { latestAt: T, now: T + min(2), declared: 10, total: 88, viewing: false }

describe('timeState', () => {
  it('is live while the latest snapshot is recent and the count is open', () => {
    expect(timeState(base)).toEqual({ state: 'live', base: 'live' })
  })

  it('is still live just under 45 minutes, paused from 45', () => {
    expect(timeState({ ...base, now: T + PAUSE_AFTER_MS - 1 }).state).toBe('live')
    expect(timeState({ ...base, now: T + PAUSE_AFTER_MS }).state).toBe('paused')
    expect(timeState({ ...base, now: T + min(120) })).toEqual({ state: 'paused', base: 'paused' })
  })

  it('is final once every seat is declared, whatever the age of the last update', () => {
    expect(timeState({ ...base, declared: 88 })).toEqual({ state: 'final', base: 'final' })
    expect(timeState({ ...base, declared: 88, now: T + min(60 * 24 * 5) }).state).toBe('final')
  })

  it('is rewinding when the viewer is behind the latest tick, and remembers what Back to now returns to', () => {
    expect(timeState({ ...base, viewing: true })).toEqual({ state: 'rewinding', base: 'live' })
    expect(timeState({ ...base, viewing: true, now: T + min(90) })).toEqual({ state: 'rewinding', base: 'paused' })
    expect(timeState({ ...base, viewing: true, declared: 88 })).toEqual({ state: 'rewinding', base: 'final' })
  })

  it('treats a clock slightly behind the snapshot (skew) as live, and no results as live', () => {
    expect(timeState({ ...base, now: T - min(5) }).state).toBe('live')
    expect(timeState({ ...base, latestAt: null, declared: 0 }).state).toBe('live')
  })

  it('is paused whenever the operator has held updates, even with a fresh snapshot', () => {
    expect(timeState({ ...base, held: true })).toEqual({ state: 'paused', base: 'paused' })
    expect(timeState({ ...base, held: true, declared: 88 }).state).toBe('final')
  })

  it('does not call 88 declared final when there are fewer seats than expected', () => {
    expect(timeState({ ...base, declared: 87 }).state).toBe('live')
  })
})

describe('clockFor', () => {
  it('uses the wall clock for the real feed', () => {
    expect(clockFor({ labelled: false, latestAt: T, wall: T + min(60) })).toBe(T + min(60))
  })
  it('uses the replay clock (the head tick) for replay and trial data, so they are never paused', () => {
    expect(clockFor({ labelled: true, latestAt: T, wall: T + min(600) })).toBe(T)
    expect(clockFor({ labelled: true, latestAt: null, wall: 5 })).toBe(5)
  })
})

describe('pillWords', () => {
  it('uses the ADR 0024 wording, with a shorter phone form', () => {
    expect(pillWords('live', false)).toEqual({ long: 'Live · ', short: 'Live · ' })
    expect(pillWords('rewinding', false)).toEqual({ long: 'Rewinding · ', short: 'Rewinding · ' })
    expect(pillWords('final', false)).toEqual({ long: 'Final · count complete ', short: 'Final · ' })
    expect(pillWords('paused', false)).toEqual({ long: 'Counting paused · last update ', short: 'Paused · ' })
  })
  it('never says Live for replay or trial data (the badge names it)', () => {
    expect(pillWords('live', true)).toEqual({ long: '', short: '' })
  })
})
