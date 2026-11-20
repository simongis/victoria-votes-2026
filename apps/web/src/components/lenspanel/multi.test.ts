import { describe, expect, it } from 'vitest'
import type { Seat } from '../../derive/seats'
import { CLOSE_PTS, leaderMargin, multiReady, multiRows, multiSentence, multiSummary, swingCount, tileState } from './multi'

const seat = (id: number, name: string, over: Partial<Seat> = {}): Seat =>
  ({ id, name, leader: 'ALP', state: 'leading', tcp: { a: 'ALP', b: 'LIB', pctA: 52 }, fp: [], base: 'ALP', ...over }) as unknown as Seat

describe('leaderMargin', () => {
  it('is the two-candidate lead in points (twice the distance from 50%)', () => {
    expect(leaderMargin(seat(1, 'A'))).toBeCloseTo(4)
  })
  it('falls back to the first-preference lead when there is no two-candidate figure', () => {
    const s = seat(1, 'A', { tcp: null, fp: [{ party: 'ALP', votes: 1, pct: 40 }, { party: 'LIB', votes: 1, pct: 31 }] })
    expect(leaderMargin(s)).toBeCloseTo(9)
  })
  it('is null with nothing counted', () => {
    expect(leaderMargin(seat(1, 'A', { tcp: null, leader: null }))).toBeNull()
  })
})

describe('tileState', () => {
  it('mutes won and firm seats, however close', () => {
    expect(tileState(seat(1, 'A', { state: 'won' }), 1)).toBe('settled')
    expect(tileState(seat(1, 'A', { state: 'firm' }), 1)).toBe('settled')
  })
  it('calls a leading seat inside the close band close, and outside it open', () => {
    expect(tileState(seat(1, 'A'), CLOSE_PTS - 0.1)).toBe('close')
    expect(tileState(seat(1, 'A'), CLOSE_PTS)).toBe('open')
  })
  it('has no state without a leader', () => {
    expect(tileState(seat(1, 'A', { state: 'none', leader: null }), null)).toBe('none')
  })
})

describe('swingCount', () => {
  it('counts crossings of the zero line, skipping gaps', () => {
    expect(swingCount([5, 3, null, -2, -4, 1])).toBe(2)
    expect(swingCount([5, 4, 3])).toBe(0)
    expect(swingCount([null, null])).toBe(0)
  })
  it('does not count touching zero as a change of hands', () => {
    expect(swingCount([3, 0, 2])).toBe(0)
  })
})

describe('multiRows', () => {
  const seats = new Map([
    [1, seat(1, 'Far', { tcp: { a: 'ALP', b: 'LIB', pctA: 70 } })],
    [2, seat(2, 'Tight', { tcp: { a: 'LIB', b: 'ALP', pctA: 50.5 }, leader: 'LIB' })],
    [3, seat(3, 'Zero', { tcp: null, leader: null, state: 'none' })],
    [4, seat(4, 'Done', { state: 'won', tcp: { a: 'ALP', b: 'LIB', pctA: 51 } })],
  ])
  const series = new Map<number, (number | null)[]>([
    [1, [10, 20, 40, 40]],
    [2, [-3, 1, -1, -1]],
    [4, [2, 2, 2, 2]],
  ])
  it('ranks the closest race first, with seats that have no figure last', () => {
    expect(multiRows(seats, series, 3).map((r) => r.name)).toEqual(['Tight', 'Done', 'Far', 'Zero'])
  })
  it('cuts each line at the viewed tick (Rewind)', () => {
    const rows = multiRows(seats, series, 1)
    expect(rows.find((r) => r.id === 2)!.line).toEqual([-3, 1])
    expect(rows.find((r) => r.id === 2)!.swings).toBe(1)
  })
  it('gives every seat a row, with its state', () => {
    const rows = multiRows(seats, series, 3)
    expect(rows).toHaveLength(4)
    expect(Object.fromEntries(rows.map((r) => [r.name, r.state]))).toEqual({ Tight: 'close', Done: 'settled', Far: 'open', Zero: 'none' })
  })
})

describe('multiSummary and multiSentence', () => {
  const seats = new Map([
    [1, seat(1, 'Tight', { tcp: { a: 'ALP', b: 'LIB', pctA: 50.5 } })],
    [2, seat(2, 'Far', { tcp: { a: 'ALP', b: 'LIB', pctA: 70 } })],
  ])
  const rows = multiRows(seats, new Map([[1, [-2, 1]], [2, [20, 40]]]), 1)
  it('says how many are close and how many had a lead change, in one line (VE-167: not "changed hands", which Gains uses)', () => {
    expect(multiSummary(rows)).toBe('1 race is within 10 points. The lead changed in 1 tonight. Outlined: within 10 points.')
    expect(multiSummary(rows)).not.toMatch(/changed hands/)
  })
  it('at Final speaks in the past, from final margins, and never says tonight', () => {
    const done = new Map([
      [1, seat(1, 'Tight', { state: 'won', tcp: { a: 'ALP', b: 'LIB', pctA: 50.5 } })],
      [2, seat(2, 'Far', { state: 'won', tcp: { a: 'ALP', b: 'LIB', pctA: 70 } })],
    ])
    const fin = multiRows(done, new Map([[1, [-2, 1]], [2, [20, 40]]]), 1, true)
    expect(multiSummary(fin, true)).toBe('1 race was within 10 points. The lead changed in 1 on the night. Outlined: within 10 points.')
    expect(multiSummary(fin, true)).not.toMatch(/tonight/)
    // Declared seats keep their colour at Final: closeness, not "settled", sets the tile.
    expect(Object.fromEntries(fin.map((r) => [r.name, r.state]))).toEqual({ Tight: 'close', Far: 'open' })
    // Before Final the same seats are settled and so not counted close.
    expect(multiRows(done, new Map(), 1).every((r) => r.state === 'settled')).toBe(true)
  })
  it('says nothing is in yet when no seat has a figure', () => {
    expect(multiSummary(multiRows(new Map([[1, seat(1, 'A', { tcp: null, leader: null, state: 'none' })]]), new Map(), 0))).toBe('No race has a result yet.')
  })
  it('explains the outline only while an outlined (close) hex is on screen (VE-168, finding 24)', () => {
    const far = multiRows(new Map([[2, seat(2, 'Far', { tcp: { a: 'ALP', b: 'LIB', pctA: 70 } })]]), new Map(), 0)
    expect(multiSummary(far)).toBe('0 races are within 10 points. The lead changed in 0 tonight.')
    expect(multiSummary(rows)).toMatch(/Outlined: within 10 points\.$/)
  })
  it('reads a row aloud', () => {
    expect(multiSentence(rows[0]!)).toBe('Tight: Labor ahead by 1 point, within 10 points, lead changed.')
  })
})

describe('multiReady (hide until ready, FB-148)', () => {
  const lines = (n: number, len: number) => new Map(Array.from({ length: n }, (_, i) => [i, Array<number | null>(len).fill(1)]))
  it('waits for 20 seats with at least 3 figures', () => {
    expect(multiReady(lines(20, 3), 2)).toBe(true)
    expect(multiReady(lines(19, 3), 2)).toBe(false)
    expect(multiReady(lines(30, 2), 1)).toBe(false)
  })
  it('counts only figures up to the viewed tick', () => {
    expect(multiReady(lines(30, 10), 1)).toBe(false)
  })
})
