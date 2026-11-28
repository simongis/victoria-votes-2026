import { describe, expect, it } from 'vitest'
import type { Seat } from '../../derive/seats'
import { CLOSE_PTS, leaderMargin, lineSides, multiReady, multiRows, multiSentence, multiSummary, seatFacts, swingCount, tileState, trendMarks, type MultiRow } from './multi'

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
    expect(multiSummary(rows)).toBe('1 race is within 10 points. The lead changed in 1 tonight. Shaded: within 10 points.')
    expect(multiSummary(rows)).not.toMatch(/changed hands/)
  })
  it('at Final speaks in the past, from final margins, and never says tonight', () => {
    const done = new Map([
      [1, seat(1, 'Tight', { state: 'won', tcp: { a: 'ALP', b: 'LIB', pctA: 50.5 } })],
      [2, seat(2, 'Far', { state: 'won', tcp: { a: 'ALP', b: 'LIB', pctA: 70 } })],
    ])
    const fin = multiRows(done, new Map([[1, [-2, 1]], [2, [20, 40]]]), 1, true)
    expect(multiSummary(fin, true)).toBe('1 race was within 10 points. The lead changed in 1 on the night. Shaded: within 10 points.')
    expect(multiSummary(fin, true)).not.toMatch(/tonight/)
    // Declared seats keep their colour at Final: closeness, not "settled", sets the tile.
    expect(Object.fromEntries(fin.map((r) => [r.name, r.state]))).toEqual({ Tight: 'close', Far: 'open' })
    // Before Final the same seats are settled and so not counted close.
    expect(multiRows(done, new Map(), 1).every((r) => r.state === 'settled')).toBe(true)
  })
  it('says nothing is in yet when no seat has a figure', () => {
    expect(multiSummary(multiRows(new Map([[1, seat(1, 'A', { tcp: null, leader: null, state: 'none' })]]), new Map(), 0))).toBe('No race has a result yet.')
  })
  it('explains the shading only while a shaded (close) hex is on screen (VE-168, finding 24)', () => {
    const far = multiRows(new Map([[2, seat(2, 'Far', { tcp: { a: 'ALP', b: 'LIB', pctA: 70 } })]]), new Map(), 0)
    expect(multiSummary(far)).toBe('0 races are within 10 points. The lead changed in 0 tonight.')
    expect(multiSummary(rows)).toMatch(/Shaded: within 10 points\.$/)
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

describe('seatFacts (VE-276: the picked seat\'s panel)', () => {
  const rowFor = (s: Seat, line: (number | null)[]): MultiRow => multiRows(new Map([[s.id, s]]), new Map([[s.id, line]]), line.length - 1)[0]!
  const bent = (over: Partial<Seat> = {}) => seat(7, 'Bentleigh', { pct: 62.4, tcp: { a: 'ALP', b: 'LIB', pctA: 52 }, ...over })

  it('names the pair and the leader, and the lead in points', () => {
    const f = seatFacts(rowFor(bent(), [3, 4]), false)
    expect(f.pair).toBe('Labor v Liberal')
    expect(f.leaderName).toBe('Labor')
    expect(f.leadLine).toBe('Labor ahead of Liberal by 4 points')
    expect(f.counted).toBe(62)
  })
  it('says the same side led all night when the line never crosses', () => {
    expect(seatFacts(rowFor(bent(), [3, 4, 5]), false).changes).toBe('Labor led all night')
  })
  it('counts lead changes and names who led first when that is not the current leader', () => {
    // holder (ALP) trails first (negative), then leads: the lead changed once and Liberal led first.
    const once = seatFacts(rowFor(bent(), [-3, -1, 4]), false)
    expect(once.changes).toBe('Lead changed once (Liberal led first)')
    expect(once.firstLeader).toBe('LIB')
    // Two changes end where they began: no "led first" aside.
    expect(seatFacts(rowFor(bent(), [3, -1, 4]), false).changes).toBe('Lead changed twice')
    expect(seatFacts(rowFor(bent(), [3, -1, 4, -2, 4]), false).changes).toBe('Lead changed 4 times')
  })
  it('speaks in the past at Final and flags a declared seat', () => {
    const f = seatFacts(rowFor(bent({ state: 'won' }), [-3, 4]), true)
    expect(f.changes).toBe('Lead changed once (Liberal led first)')
    expect(f.declared).toBe(true)
    expect(seatFacts(rowFor(bent(), [3, 4]), true).changes).toBe('Labor led throughout')
  })
  it('has no change line or lead with nothing counted', () => {
    const f = seatFacts(rowFor(seat(8, 'Empty', { tcp: null, leader: null, state: 'none', pct: null }), [null]), false)
    expect(f.leadLine).toBe('Nothing counted yet')
    expect(f.changes).toBeNull()
    expect(f.counted).toBeNull()
  })
  it('reads the line from the other side when the 2022 holder is second in the pair', () => {
    const s = bent({ base: 'LIB', leader: 'ALP', tcp: { a: 'ALP', b: 'LIB', pctA: 52 } })
    // The line is holder-signed: LIB is the holder, so a negative value means ALP (the other) led.
    expect(seatFacts(rowFor(s, [-2, -4]), false).firstLeader).toBe('ALP')
    expect(lineSides(s)).toEqual({ holder: 'LIB', other: 'ALP' })
  })
})

describe('trendMarks (VE-276: hour marks on the night)', () => {
  const at = (h: number, m = 0) => Date.UTC(2026, 10, 28, h, m)
  const hour = (t: number) => `${new Date(t).getUTCHours()}`
  it('marks each whole hour inside the night at its place along the line', () => {
    const times = [at(8, 30), at(9, 0), at(9, 30), at(10, 0), at(10, 30)]
    expect(trendMarks(times, hour)).toEqual([
      { x: 0.25, label: '9' },
      { x: 0.75, label: '10' },
    ])
  })
  it('has no marks for a night of one tick or no times', () => {
    expect(trendMarks([at(8)], hour)).toEqual([])
    expect(trendMarks([], hour)).toEqual([])
  })
  it('thins marks to every second hour when the night runs long', () => {
    const times = Array.from({ length: 13 }, (_, i) => at(8 + i))
    expect(trendMarks(times, hour).map((m) => m.label)).toEqual(['8', '10', '12', '14', '16', '18', '20'])
  })
})

describe('VE-290: a wrong-pair seat says one thing everywhere', () => {
  const rowFor = (s: Seat, line: (number | null)[]): MultiRow => multiRows(new Map([[s.id, s]]), new Map([[s.id, line]]), line.length - 1)[0]!
  // Preston-like: the VEC pair is Labor v Liberal with Labor well ahead, but the Greens lead on first preferences.
  const preston = seat(9, 'Preston', {
    leader: 'GRN',
    pct: 4,
    tcp: { a: 'ALP', b: 'LIB', pctA: 64.5 },
    fp: [{ party: 'GRN', votes: 1, pct: 38 }, { party: 'ALP', votes: 1, pct: 36 }, { party: 'LIB', votes: 1, pct: 15 }],
  } as Partial<Seat>)
  it('takes heading, change line, tooltip and note from the trend line, not the first-preference leader', () => {
    const r = rowFor(preston, [20, 25, 29])
    const f = seatFacts(r, false)
    expect(f.leadLine).toBe('Labor ahead of Liberal by 29 points')
    expect(f.changes).toBe('Labor led all night')
    expect(multiSentence(r)).toMatch(/^Preston: Labor ahead by 29 points/)
    expect(f.wrongPair).toEqual({ a: 'ALP', b: 'LIB', outsider: 'GRN', leads: true })
  })
  it('has no note for an ordinary pair', () => {
    expect(seatFacts(rowFor(seat(1, 'A', { fp: [{ party: 'ALP', votes: 1, pct: 40 }, { party: 'LIB', votes: 1, pct: 30 }] } as Partial<Seat>), [4]), false).wrongPair).toBeNull()
  })
})

describe('VE-290: a declared seat names its declared winner, whatever the line says', () => {
  const rowFor = (s: Seat, line: (number | null)[]): MultiRow => multiRows(new Map([[s.id, s]]), new Map([[s.id, line]]), line.length - 1, true)[0]!
  // Pakenham-like: Elected Labor, but the two-candidate line ends a hair on the Liberal side (below zero for holder Labor).
  const pak = seat(5, 'Pakenham', { state: 'won', leader: 'ALP', base: 'ALP', tcp: { a: 'LIB', b: 'ALP', pctA: 50.1 } } as Partial<Seat>)
  it('uses the winner in the heading, tooltip and facts, and says "under 1 point" for a sliver', () => {
    const r = rowFor(pak, [3, 1, -0.2])
    const f = seatFacts(r, true)
    expect(f.leader).toBe('ALP')
    // A declared seat says who won, not "ahead" (a live-count verb).
    expect(f.leadLine).toBe('Labor won (v Liberal) by under 1 point')
    expect(multiSentence(r)).toMatch(/^Pakenham: Labor ahead by under 1 point/)
    expect(multiSentence(r)).not.toMatch(/ 0 points/)
  })
})
