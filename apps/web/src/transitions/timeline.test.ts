import { describe, expect, it } from 'vitest'
import {
  SEGMENT_MS,
  TIMING,
  createCrossfade,
  createTimeline,
  ease,
  flyProgress,
  morphStage,
  planTransition,
  tallyStage,
} from './timeline'

/** Fake clock: fixed 16 ms frames. */
function run(tl: ReturnType<typeof createTimeline>, ms: number, frame = 16): number {
  let t = 0
  while (t < ms && tl.busy) {
    tl.advance(frame)
    t += frame
  }
  return t
}

describe('stages', () => {
  it('ease is 0 at 0, 1 at 1, symmetric', () => {
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    expect(ease(0.5)).toBeCloseTo(0.5, 9)
  })
  it('morph: map labels out first, shapes move, seat labels in last', () => {
    const s0 = morphStage(0)
    expect(s0).toMatchObject({ e: 0, mapLabels: 1, seatLabels: 0 })
    const s1 = morphStage(1)
    expect(s1).toMatchObject({ e: 1, mapLabels: 0, seatLabels: 1 })
    // Shapes have not started when labels are half out; labels are fully out when they start.
    const early = morphStage((TIMING.labelsOutMs / 2) / SEGMENT_MS[0])
    expect(early.e).toBe(0)
    expect(early.mapLabels).toBeGreaterThan(0)
    expect(early.mapLabels).toBeLessThan(1)
    const afterOut = morphStage((TIMING.labelsOutMs + 100) / SEGMENT_MS[0])
    expect(afterOut.mapLabels).toBe(0)
    expect(afterOut.e).toBeGreaterThan(0)
    expect(afterOut.seatLabels).toBe(0)
  })
  it('tally: chips shrink first, then fly, then settle', () => {
    expect(tallyStage(0)).toMatchObject({ shrink: 0, settle: 0 })
    expect(tallyStage(1)).toMatchObject({ shrink: 1, settle: 1 })
    const mid = tallyStage((TIMING.chipMs + 300) / SEGMENT_MS[1])
    expect(mid.shrink).toBe(1)
    expect(mid.settle).toBe(0)
  })
  it('fly: later ranks start later but all arrive by the end of the fly window', () => {
    const t = TIMING.chipMs + 100
    expect(flyProgress(t, 0)).toBeGreaterThan(flyProgress(t, 30))
    const end = TIMING.chipMs + TIMING.staggerMaxMs + TIMING.flyMs
    expect(flyProgress(end, 1000)).toBe(1)
    expect(flyProgress(0, 0)).toBe(0)
  })
  it('segments add up to the researched timings', () => {
    expect(SEGMENT_MS[0]).toBe(1550)
    expect(SEGMENT_MS[1]).toBe(1820)
  })
})

describe('timeline', () => {
  it('goes Map to Seats in about one segment and lands exactly on the target', () => {
    const tl = createTimeline(0)
    tl.setTarget(1)
    const ms = run(tl, 5000)
    expect(tl.pos).toBe(1)
    expect(tl.velocity).toBe(0)
    expect(ms).toBeGreaterThan(SEGMENT_MS[0])
    expect(ms).toBeLessThan(SEGMENT_MS[0] + 200)
  })
  it('chains Map to Tally faster than two segments back to back', () => {
    const tl = createTimeline(0)
    tl.setTarget(2)
    const ms = run(tl, 10000)
    expect(tl.pos).toBe(2)
    expect(ms).toBeLessThan(SEGMENT_MS[0] + SEGMENT_MS[1])
  })
  it('reverses mid-flight without a jump in position or velocity', () => {
    const tl = createTimeline(0)
    tl.setTarget(1)
    run(tl, 600)
    const p = tl.pos
    const v = tl.velocity
    expect(p).toBeGreaterThan(0.1)
    expect(p).toBeLessThan(0.9)
    tl.setTarget(0)
    expect(tl.pos).toBe(p)
    expect(tl.velocity).toBe(v)
    tl.advance(16)
    // One frame later: still moving forward a hair (momentum), and the step is no bigger than a normal frame.
    expect(Math.abs(tl.pos - p)).toBeLessThan((16 / SEGMENT_MS[0]) * 1.5)
    expect(Math.abs(tl.velocity - v)).toBeLessThan(2 * (16 / SEGMENT_MS[0] / TIMING.rampMs) * 16)
    run(tl, 5000)
    expect(tl.pos).toBe(0)
  })
  it('never overshoots the target', () => {
    const tl = createTimeline(0)
    tl.setTarget(1)
    let max = 0
    for (let i = 0; i < 300; i++) {
      tl.advance(16)
      max = Math.max(max, tl.pos)
    }
    expect(max).toBeLessThanOrEqual(1)
  })
  it('caps a stalled frame so it cannot teleport', () => {
    const tl = createTimeline(0)
    tl.setTarget(1)
    tl.advance(10_000)
    expect(tl.pos).toBeLessThan(0.1)
  })
  it('jumpTo sets position and clears velocity', () => {
    const tl = createTimeline(0)
    tl.setTarget(2)
    run(tl, 400)
    tl.jumpTo(1)
    expect(tl.pos).toBe(1)
    expect(tl.target).toBe(1)
    expect(tl.busy).toBe(false)
  })
})

describe('reduced motion', () => {
  it('reduced motion (the Animations switch off) yields a cross-fade plan of about 450 ms', () => {
    const plan = planTransition('map', 'seats', 'reduced')
    expect(plan).toEqual({ kind: 'crossfade', from: 'map', to: 'seats', durationMs: 450 })
  })
  it('full motion plans a chain; same mode plans nothing', () => {
    expect(planTransition('map', 'seats', 'full').kind).toBe('chain')
    expect(planTransition('map', 'seats', 'full').durationMs).toBe(SEGMENT_MS[0])
    expect(planTransition('map', 'tally', 'full').durationMs).toBeLessThan(SEGMENT_MS[0] + SEGMENT_MS[1])
    expect(planTransition('seats', 'seats', 'full').kind).toBe('none')
  })
  it('cross-fade runs 0 to 1 over its duration', () => {
    const cf = createCrossfade()
    expect(cf.progress).toBe(0)
    cf.advance(225)
    expect(cf.progress).toBeCloseTo(0.5, 9)
    expect(cf.done).toBe(false)
    cf.advance(300)
    expect(cf.progress).toBe(1)
    expect(cf.done).toBe(true)
  })
})
