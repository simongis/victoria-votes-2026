import { describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import type { BoothBase, BoothFp, BoothRow, BoothStatic } from '../components/booths/model'
import { MIN_COMPARE_FORMAL, placePanel, rankWords, swingWords, vsSeatWords, type PlaceInput, type SeatNow } from './boothPanel'

const fp = (o: Partial<BoothFp>): BoothFp => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0, ...o })
const T = (h: number): number => Date.UTC(2022, 10, 26, h) // a stand-in clock: hours after midnight UTC

const place = (id: number, name: string, base?: BoothBase): BoothStatic => ({ id, name, districtId: 1, e: 0, n: 0, ...(base ? { base } : {}) })
const row = (at: number, f: Partial<BoothFp>, tcp: [PartyBucket, number] | null, informal = 0): BoothRow => {
  const p = fp(f)
  const formal = Object.values(p).reduce((a, b) => a + b, 0)
  return { at, fp: p, total: formal + informal, tcpA: tcp?.[0] ?? null, tcpPctA: tcp?.[1] ?? null }
}

/** A seat that counts Labor against Liberal, with a few thousand formal votes. */
const seat = (over: Partial<SeatNow> = {}): SeatNow => ({
  id: 1,
  name: 'Footscray',
  tcp: { a: 'ALP', b: 'LIB', pctA: 60 },
  fp: [
    { party: 'ALP', votes: 600, pct: 50 },
    { party: 'LIB', votes: 400, pct: 33.3 },
    { party: 'GRN', votes: 200, pct: 16.7 },
  ],
  ...over,
})

const ticks = [T(1), T(2), T(3), T(4)]
const here = place(10, 'Here PS', { match: 'id', a: 'ALP', b: 'LIB', pctA: 55 })
const mate = (id: number, pct: number, at = T(1)) => ({ place: place(id, `Mate ${id}`), rows: [row(at, { ALP: pct, LIB: 100 - pct }, ['ALP', pct])] })

function input(over: Partial<PlaceInput> = {}): PlaceInput {
  return {
    place: here,
    isEvc: false,
    rows: [row(T(2), { ALP: 62, LIB: 30, GRN: 8 }, ['ALP', 66], 4)],
    at: T(3),
    seat: seat(),
    mates: [mate(11, 50), mate(12, 70), mate(13, 40)],
    sameElection: false,
    ticks,
    ...over,
  }
}

describe('state 1: not reported yet', () => {
  it('gives no numbers, and says when the seat first reported', () => {
    const p = placePanel(input({ rows: undefined, at: T(2) }))
    expect(p.state).toBe('waiting')
    expect(p.firstSeatAt).toBe(T(1))
    expect(p.votes).toBeNull()
    expect(p.twoCp).toBeNull()
    expect(p.vsSeat).toBeNull()
    expect(p.series).toEqual([])
  })
  it('says no place in the seat has reported when none have by then', () => {
    const p = placePanel(input({ rows: undefined, at: T(0), mates: [mate(11, 50, T(1))] }))
    expect(p.state).toBe('waiting')
    expect(p.firstSeatAt).toBeNull()
  })
  it('treats a row with no votes as not counted', () => {
    const p = placePanel(input({ rows: [row(T(2), {}, null)] }))
    expect(p.state).toBe('waiting')
  })
  it('state 8: rewinding to before this place reported steps back to waiting, and a spoiler time never shows', () => {
    const r = [row(T(3), { ALP: 62, LIB: 30 }, ['ALP', 67])]
    expect(placePanel(input({ rows: r, at: T(3) })).state).toBe('counted')
    const back = placePanel(input({ rows: r, at: T(2) }))
    expect(back.state).toBe('waiting')
    expect(back.firstReportedAt).toBeNull()
    expect(back.firstSeatAt).toBe(T(1))
  })
})

describe('state 2: first preferences only', () => {
  it('shows first preferences and no final two', () => {
    const p = placePanel(input({ rows: [row(T(2), { ALP: 50, LIB: 30, GRN: 20 }, null)] }))
    expect(p.state).toBe('first-preferences')
    expect(p.twoCp).toBeNull()
    expect(p.vsSeat).toBeNull()
    expect(p.fp.map((f) => f.party)).toEqual(['ALP', 'LIB', 'GRN'])
    expect(p.fp[0]!.pct).toBeCloseTo(50, 5)
    expect(p.votes).toBe(100)
  })
  it('keeps first preferences when the seat final two is not in yet', () => {
    const p = placePanel(input({ seat: seat({ tcp: null }) }))
    expect(p.state).toBe('first-preferences')
  })
  it('does the same when the place counted a different pair from the seat now', () => {
    const p = placePanel(input({ rows: [row(T(2), { GRN: 60, ONP: 40 }, ['GRN', 55])] }))
    expect(p.state).toBe('first-preferences')
    expect(p.twoCp).toBeNull()
  })
})

describe('state 3: both counts', () => {
  const p = placePanel(input())
  it('reports the final two with the seat pair', () => {
    expect(p.state).toBe('counted')
    expect(p.twoCp).toEqual({ a: 'ALP', b: 'LIB', pctA: 66 })
  })
  it('gives votes, informal and first reported', () => {
    expect(p.votes).toBe(100 + 4)
    expect(p.informalPct).toBeCloseTo((100 * 4) / 104, 5)
    expect(p.firstReportedAt).toBe(T(2))
  })
  it('compares with the seat on the same party', () => {
    expect(p.vsSeat).toEqual({ party: 'ALP', here: 66, seat: 60, points: 6 })
  })
  it('flips the share when the place counted the seat pair the other way round', () => {
    const q = placePanel(input({ rows: [row(T(2), { LIB: 70, ALP: 30 }, ['LIB', 60])] }))
    expect(q.twoCp).toEqual({ a: 'ALP', b: 'LIB', pctA: 40 })
    expect(q.vsSeat).toEqual({ party: 'ALP', here: 40, seat: 60, points: -20 })
  })
  it('uses the row at the time, not a later one', () => {
    const r = [row(T(2), { ALP: 10, LIB: 10 }, ['ALP', 50]), row(T(4), { ALP: 40, LIB: 20 }, ['ALP', 70])]
    expect(placePanel(input({ rows: r, at: T(3) })).twoCp!.pctA).toBe(50)
    expect(placePanel(input({ rows: r, at: T(4) })).twoCp!.pctA).toBe(70)
  })
})

describe('state 4: an early voting centre', () => {
  const evc = place(90, 'Albert Park - EVC')
  it('with no result of its own falls back to the seat, worded as a fallback', () => {
    const p = placePanel(input({ place: evc, isEvc: true, rows: undefined, at: T(3) }))
    expect(p.state).toBe('evc-no-result')
    expect(p.seatFallback).toEqual({ a: 'ALP', b: 'LIB', pctA: 60 })
    expect(p.vsSeat).toBeNull()
    expect(p.rank).toBeNull()
  })
  it('has no fallback before the seat has a final two', () => {
    const p = placePanel(input({ place: evc, isEvc: true, rows: undefined, seat: seat({ tcp: null }) }))
    expect(p.state).toBe('evc-no-result')
    expect(p.seatFallback).toBeNull()
  })
  it('reads like any place once it has a result of its own (the 2026 feed)', () => {
    const p = placePanel(input({ place: evc, isEvc: true }))
    expect(p.state).toBe('counted')
  })
})

describe('states 5 and 6: swing', () => {
  const counted = (base: BoothBase | undefined, same = false) => placePanel(input({ place: place(10, 'X', base), sameElection: same }))
  it('is the change in the share against the same pair, toward the seat leader', () => {
    expect(counted({ match: 'id', a: 'ALP', b: 'LIB', pctA: 55 }).swing).toEqual({ kind: 'moved', party: 'ALP', points: 11 })
  })
  it('measures from the other side when the baseline listed the pair the other way round', () => {
    expect(counted({ match: 'id', a: 'LIB', b: 'ALP', pctA: 45 }).swing).toEqual({ kind: 'moved', party: 'ALP', points: 11 })
  })
  it('has no line when 2022 had no match (no fake zero)', () => {
    expect(counted({ match: 'none', a: null, b: null, pctA: null }).swing).toEqual({ kind: 'none' })
    expect(counted(undefined).swing).toEqual({ kind: 'none' })
  })
  it('says the pairs differ rather than inventing a swing', () => {
    expect(counted({ match: 'id', a: 'ALP', b: 'GRN', pctA: 55 }).swing).toEqual({ kind: 'different-pair', a: 'ALP', b: 'GRN' })
  })
  it('hides the line when the baseline is the same election (the replay)', () => {
    expect(counted({ match: 'id', a: 'ALP', b: 'LIB', pctA: 66 }, true).swing).toEqual({ kind: 'none' })
    expect(counted({ match: 'id', a: 'ALP', b: 'LIB', pctA: 55 }, true).swing).toEqual({ kind: 'none' })
  })
  it('says no change, never "0.0 pts", when a real swing rounds to nothing', () => {
    const s = counted({ match: 'id', a: 'ALP', b: 'LIB', pctA: 65.97 }).swing
    expect(swingWords(s, (x) => x, '2022')).toBe('No change since 2022')
  })
  it('words a swing with its party and size', () => {
    expect(swingWords({ kind: 'moved', party: 'ALP', points: 2.34 }, (x) => `L${x}`, '2022')).toBe('2.3 points to LALP since 2022')
    expect(swingWords({ kind: 'moved', party: 'ALP', points: -2.34 }, (x) => `L${x}`, '2022')).toBe('2.3 points away from LALP since 2022')
    expect(swingWords({ kind: 'none' }, (x) => x, '2022')).toBeNull()
  })
})

describe('state 7: rank among the places', () => {
  it('hides the strip below three places', () => {
    expect(placePanel(input({ mates: [] })).rank).toBeNull()
    expect(placePanel(input({ mates: [mate(11, 50)] })).rank).toBeNull()
  })
  it('ranks on the seat leader share, best first', () => {
    const r = placePanel(input()).rank!
    expect(r.of).toBe(4)
    expect(r.rank).toBe(2) // 70 beats 66; 50 and 40 do not
    expect(r.dots.filter((d) => d.here)).toHaveLength(1)
    expect(r.dots.map((d) => d.pct).sort((a, b) => a - b)).toEqual([40, 50, 66, 70])
  })
  it('leaves out places that have not reported or have a different pair', () => {
    const odd = { place: place(14, 'Odd'), rows: [row(T(1), { GRN: 5, ONP: 5 }, ['GRN', 50])] }
    const late = { place: place(15, 'Late'), rows: [row(T(4), { ALP: 5, LIB: 5 }, ['ALP', 50])] }
    const r = placePanel(input({ mates: [mate(11, 50), mate(12, 70), odd, late] })).rank!
    expect(r.of).toBe(3)
  })
  it('words the rank plainly', () => {
    expect(rankWords({ rank: 1, of: 5 }, 'Labor', 'Footscray')).toBe('Best place in Footscray for Labor')
    expect(rankWords({ rank: 5, of: 5 }, 'Labor', 'Footscray')).toBe("Labor's weakest place in Footscray")
    expect(rankWords({ rank: 2, of: 5 }, 'Labor', 'Footscray')).toBe('2nd best for Labor of 5 places in Footscray')
    expect(rankWords({ rank: 13, of: 20 }, 'Labor', 'Footscray')).toBe('13th best for Labor of 20 places in Footscray')
  })
  it('words the comparison with the seat', () => {
    expect(vsSeatWords({ party: 'ALP', here: 66, seat: 60, points: 6 }, 'Labor', 'Footscray')).toBe('Labor 6.0 points stronger here than across Footscray')
    expect(vsSeatWords({ party: 'ALP', here: 54, seat: 60, points: -6 }, 'Labor', 'Footscray')).toBe('Labor 6.0 points weaker here than across Footscray')
    expect(vsSeatWords({ party: 'ALP', here: 60, seat: 60, points: 0 }, 'Labor', 'Footscray')).toBe('Labor level with Footscray here')
  })
})

describe('a minimum count before comparing (VE-208c)', () => {
  // A booth with the given formal votes, all on the seat pair, at 66%.
  const small = (formal: number) => [row(T(2), { ALP: Math.round(formal * 0.66), LIB: formal - Math.round(formal * 0.66) }, ['ALP', 66])]
  const mateN = (id: number, pct: number, n: number) => ({ place: place(id, `Mate ${id}`), rows: [row(T(1), { ALP: n, LIB: n }, ['ALP', pct] as [PartyBucket, number])] })
  it('is 50 formal votes', () => {
    expect(MIN_COMPARE_FORMAL).toBe(50)
  })
  it('at 49 formal votes keeps the basics and drops the comparisons', () => {
    const p = placePanel(input({ rows: small(49) }))
    expect(p.state).toBe('counted')
    expect(p.tooFew).toBe(true)
    expect(p.twoCp).not.toBeNull()
    expect(p.votes).toBe(49)
    expect(p.firstReportedAt).toBe(T(2))
    expect(p.vsSeat).toBeNull()
    expect(p.rank).toBeNull()
    expect(p.swing).toEqual({ kind: 'none' })
  })
  it('at 50 formal votes compares as before', () => {
    const p = placePanel(input({ rows: small(50) }))
    expect(p.tooFew).toBe(false)
    expect(p.vsSeat).not.toBeNull()
    expect(p.rank).not.toBeNull()
    expect(p.swing.kind).toBe('moved')
  })
  it('first preferences only at 49 are also marked too few', () => {
    const p = placePanel(input({ rows: [row(T(2), { ALP: 30, LIB: 19 }, null)] }))
    expect(p.state).toBe('first-preferences')
    expect(p.tooFew).toBe(true)
  })
  it('leaves small places out of the strip and the rank', () => {
    const mates = [mateN(11, 50, 40), mateN(12, 70, 40), mateN(13, 40, 40), mateN(14, 95, 10)]
    const r = placePanel(input({ mates })).rank!
    expect(r.of).toBe(4)
    expect(r.dots.some((d) => d.id === 14)).toBe(false)
    expect(r.rank).toBe(2) // the small 95% place does not push this one down
  })
  it('with only two places over the minimum there is no strip', () => {
    const p = placePanel(input({ mates: [mateN(11, 50, 40), mateN(12, 60, 5), mateN(13, 70, 5)] }))
    expect(p.tooFew).toBe(false)
    expect(p.rank).toBeNull()
  })
  it('gives no NaN on a small booth', () => {
    const p = placePanel(input({ rows: small(10) }))
    for (const v of [p.twoCp?.pctA, p.informalPct, p.share?.pctOfSeat, ...p.fp.map((f) => f.pct)]) if (v !== undefined && v !== null) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('share of the seat', () => {
  it('is this place against the seat formal votes, with the rest not cast at a place', () => {
    // places: this 100 formal, mates 100 each = 400 of the 1,200 the seat has
    const s = placePanel(input()).share!
    expect(s.pctOfSeat).toBeCloseTo(100 / 12, 5)
    expect(s.offPlacePct).toBeCloseTo(800 / 12, 5)
  })
  it('compares the leading party at the places with the other votes', () => {
    const s = placePanel(input()).share!
    expect(s.party).toBe('ALP')
    // ALP at places: 62 + 50 + 70 + 40 = 222 of 400; elsewhere 600 - 222 = 378 of 800
    expect(s.placesPct).toBeCloseTo(55.5, 5)
    expect(s.otherPct).toBeCloseTo(47.25, 5)
  })
  it('has no split while nothing outside the places is counted yet (early in the night), rather than a false 0%', () => {
    const s = placePanel(input({ seat: seat({ fp: [{ party: 'ALP', votes: 222, pct: 55.5 }, { party: 'LIB', votes: 178, pct: 44.5 }] }) })).share!
    expect(s.pctOfSeat).toBeCloseTo(25, 5)
    expect(s.offPlacePct).toBeNull()
    expect(s.otherPct).toBeNull()
    expect(s.placesPct).toBeCloseTo(55.5, 5)
  })
  it('has the split once those votes have arrived', () => {
    const s = placePanel(input()).share!
    expect(s.offPlacePct).not.toBeNull()
    expect(s.otherPct).not.toBeNull()
  })
  it('is null when the places add up to more than the seat (bad data, nothing printed)', () => {
    expect(placePanel(input({ seat: seat({ fp: [{ party: 'ALP', votes: 50, pct: 100 }] }) })).share).toBeNull()
  })
  it('is null for a seat with no first preferences yet', () => {
    expect(placePanel(input({ seat: seat({ fp: [] }) })).share).toBeNull()
  })
})

describe('count over the night', () => {
  it('is zero until the first row, then steps, and stops at the time shown', () => {
    const r = [row(T(2), { ALP: 10 }, null), row(T(3), { ALP: 30 }, null)]
    expect(placePanel(input({ rows: r, at: T(3) })).series).toEqual([0, 10, 30])
    expect(placePanel(input({ rows: r, at: T(2) })).series).toEqual([0, 10])
  })
})

describe('sanity', () => {
  it('has no NaN, negative or over-100 share in any state', () => {
    const cases = [input(), input({ rows: undefined }), input({ rows: [row(T(2), { ALP: 5, LIB: 5 }, null)] }), input({ mates: [] })]
    for (const c of cases) {
      const p = placePanel(c)
      const shares = [p.twoCp?.pctA, p.vsSeat?.here, p.share?.pctOfSeat, p.share?.offPlacePct, p.share?.placesPct, p.share?.otherPct, p.informalPct, ...p.fp.map((f) => f.pct), ...(p.rank?.dots.map((d) => d.pct) ?? [])].filter((v): v is number => v !== undefined && v !== null)
      for (const v of shares) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })
})
