import { describe, expect, it } from 'vitest'
import type { DistrictStatic } from '@vic26/schema'
import type { Seat } from './seats'
import { arrowGeometry, arrowLength, captionCounts, captionOf, classifySeat, markSentence, rankedArrows, MAX_PTS } from './arrows'

const st = (over: Partial<DistrictStatic> = {}) => ({ base_tcp_party_a: 'ALP', base_tcp_party_b: 'LIB', base_tcp_pct_a: 55, ...over }) as DistrictStatic
const seat = (over: Partial<Seat> = {}): Seat =>
  ({ id: 1, name: 'Albert Park', leader: 'ALP', state: 'firm', tcp: { a: 'ALP', b: 'LIB', pctA: 60 }, pct: 75, baseNote: '2022', ...over }) as Seat

describe('classifySeat', () => {
  it('draws an arrow toward Labor when Labor v Coalition and the swing is to Labor', () => {
    const m = classifySeat(seat(), st())
    expect(m.kind).toBe('arrow')
    if (m.kind === 'arrow') {
      expect(m.toward).toBe('ALP')
      expect(m.pts).toBeCloseTo(5)
    }
  })
  it('points toward the Coalition when the swing is against Labor, including the Nationals', () => {
    const m = classifySeat(seat({ leader: 'NAT', tcp: { a: 'NAT', b: 'ALP', pctA: 52 } }), st({ base_tcp_party_a: 'NAT', base_tcp_party_b: 'ALP', base_tcp_pct_a: 50 }))
    expect(m.kind).toBe('arrow')
    if (m.kind === 'arrow') expect(m.toward).toBe('COA')
  })
  it('is flat, not an arrow, when the swing is within the flat edge of nil', () => {
    expect(classifySeat(seat({ tcp: { a: 'ALP', b: 'LIB', pctA: 55 } }), st()).kind).toBe('flat')
    expect(classifySeat(seat({ tcp: { a: 'ALP', b: 'LIB', pctA: 55.7 } }), st()).kind).toBe('flat')
    expect(classifySeat(seat({ tcp: { a: 'ALP', b: 'LIB', pctA: 56 } }), st()).kind).toBe('arrow')
    expect(markSentence(classifySeat(seat({ tcp: { a: 'ALP', b: 'LIB', pctA: 55 } }), st()))).toContain('Little change')
  })
  it('is a ring below the swing threshold, not an arrow', () => {
    expect(classifySeat(seat({ pct: 30 }), st()).kind).toBe('early')
  })
  it('is a dot for another pairing', () => {
    expect(classifySeat(seat({ leader: 'GRN', tcp: { a: 'GRN', b: 'ALP', pctA: 55 } }), st()).kind).toBe('other')
  })
  it('VE-285: Labor v Coalition now but a different pair in 2022 is its own kind, not "not Labor v Coalition"', () => {
    // Bendigo East: Labor v Nationals now, Labor v Liberal in 2022.
    const m = classifySeat(seat({ leader: 'ALP', tcp: { a: 'ALP', b: 'NAT', pctA: 55 } }), st())
    expect(m.kind).toBe('changed')
    expect(markSentence(m)).toContain('Different contest from 2022')
    expect(markSentence(m)).not.toContain('not a Labor v Coalition')
    expect(classifySeat(seat(), st({ base_tcp_party_b: 'GRN' })).kind).toBe('changed')
    // Still too early: the ring, as before.
    expect(classifySeat(seat({ pct: 30, tcp: { a: 'ALP', b: 'NAT', pctA: 55 } }), st()).kind).toBe('early')
  })
  it('captionCounts leaves a changed contest out of the Labor v Coalition seats ready to compare', () => {
    expect(captionCounts([classifySeat(seat({ tcp: { a: 'ALP', b: 'NAT', pctA: 55 } }), st()), classifySeat(seat(), st())])).toEqual({ ready: 1, all: 1 })
  })
  it('has no mark before a two-candidate count', () => {
    expect(classifySeat(seat({ tcp: null }), st()).kind).toBe('notin')
    expect(classifySeat(seat({ tcp: { a: 'ALP', b: null, pctA: 50 } }), st()).kind).toBe('notin')
  })
})

describe('arrow geometry', () => {
  it('caps the length at MAX_PTS and keeps a visible minimum', () => {
    expect(arrowLength(50, 10)).toBe(MAX_PTS * 10)
    expect(arrowLength(-0.1, 10)).toBe(4)
    expect(arrowLength(-3, 10)).toBe(30)
  })
  it('points left and up for Labor (dir -1, angled) and right for the Coalition', () => {
    const l = arrowGeometry(20, -1, true)
    expect(l.tip[0]).toBeLessThan(0)
    expect(l.tip[1]).toBeLessThan(0)
    const r = arrowGeometry(20, 1, true)
    expect(r.tip[0]).toBeGreaterThan(0)
    expect(Math.hypot(...r.tip)).toBeCloseTo(20)
  })
  it('stays level when not angled (the strip)', () => {
    const g = arrowGeometry(20, 1, false)
    expect(g.tip[1]).toBeCloseTo(0)
    expect(g.tip[0]).toBeCloseTo(20)
  })
})

describe('words and ranking', () => {
  it('says toward Labor and toward the Coalition, never left or right', () => {
    const a = markSentence(classifySeat(seat(), st()))
    expect(a).toContain('toward Labor')
    expect(a).toContain('since 2022')
    expect(a).not.toMatch(/left|right/)
    const c = markSentence(classifySeat(seat({ tcp: { a: 'ALP', b: 'LIB', pctA: 50 } }), st({ base_tcp_pct_a: 55 })))
    expect(c).toContain('toward the Coalition')
  })
  it('names the threshold for a seat that is too early', () => {
    expect(markSentence(classifySeat(seat({ pct: 20 }), st()))).toContain('50%')
  })
  it('ranks arrows from most toward Labor to most toward the Coalition', () => {
    const marks = [
      classifySeat(seat({ id: 1, tcp: { a: 'ALP', b: 'LIB', pctA: 58 } }), st()),
      classifySeat(seat({ id: 2, tcp: { a: 'ALP', b: 'LIB', pctA: 50 } }), st()),
      classifySeat(seat({ id: 3, tcp: { a: 'ALP', b: 'LIB', pctA: 70 } }), st()),
      classifySeat(seat({ id: 4, pct: 10 }), st()),
    ]
    expect(rankedArrows(marks).map((m) => m.seat.id)).toEqual([3, 1, 2])
  })
  it('counts how many Labor v Coalition seats are far enough on', () => {
    const marks = [classifySeat(seat(), st()), classifySeat(seat({ pct: 10 }), st()), classifySeat(seat({ tcp: null }), st())]
    expect(captionOf(marks)).toBe('1 of 2 seats ready to compare')
    expect(captionOf([])).toBe('No seat ready to compare yet')
    expect(captionCounts(marks)).toEqual({ ready: 1, all: 2 })
  })
  it('at Final never says "ready" (VE-167): the count is over, so seats are compared', () => {
    const marks = [classifySeat(seat(), st()), classifySeat(seat({ pct: 10 }), st())]
    expect(captionOf(marks, true)).toBe('1 of 2 seats compared')
    expect(captionOf([], true)).toBe('No seat to compare')
  })
})
