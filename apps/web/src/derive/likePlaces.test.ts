import { describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import { changeWords, likePlacesHeadline, likePlaceRow } from './likePlaces'
import type { Seat } from './seats'

const mk = (id: number, name: string, leader: PartyBucket | null, base: PartyBucket | null, state: Seat['state'] = leader ? 'leading' : 'none', pctA: number | null = leader ? 60 : null): Seat =>
  // Likely as ADR 0033 has it: 40% counted and 57% or more after preferences (preferences coverage unknown here).
  ({ id, name, leader, base, state, changing: leader !== null && base !== null && leader !== base, pct: leader ? 40 : null, likely: state === 'leading' && pctA !== null && pctA >= 57, tcp: leader && pctA !== null ? { a: leader, b: 'LIB', pctA } : null, fp: [] }) as unknown as Seat

const map = (...s: Seat[]) => new Map(s.map((x) => [x.id, x]))
const FIVE = [2, 3, 4, 5, 6]

describe('likePlacesHeadline: no results anywhere', () => {
  it('names the largest 2022 group', () => {
    const seats = map(mk(1, 'Ripon', null, 'ALP'), mk(2, 'A', null, 'NAT'), mk(3, 'B', null, 'NAT'), mk(4, 'C', null, 'NAT'), mk(5, 'D', null, 'NAT'), mk(6, 'E', null, 'ALP'))
    expect(likePlacesHeadline(1, FIVE, seats, false)).toEqual({
      headline: 'In 2022, 4 of the 5 seats most like Ripon were won by the Nationals.',
      picked: null,
    })
  })
  it('says both when it is a tie', () => {
    const seats = map(mk(1, 'Ripon', null, 'ALP'), mk(2, 'A', null, 'NAT'), mk(3, 'B', null, 'NAT'), mk(4, 'C', null, 'ALP'), mk(5, 'D', null, 'ALP'), mk(6, 'E', null, 'GRN'))
    expect(likePlacesHeadline(1, FIVE, seats, false).headline).toBe('In 2022, 2 of the 5 seats most like Ripon were won by Labor and 2 by the Nationals.')
  })
  it('copes with a seat that has no 2022 holder', () => {
    const seats = map(mk(1, 'Ripon', null, 'ALP'), mk(2, 'A', null, 'NAT'), mk(3, 'B', null, 'NAT'), mk(4, 'C', null, null), mk(5, 'D', null, 'ALP'), mk(6, 'E', null, 'NAT'))
    expect(likePlacesHeadline(1, FIVE, seats, false).headline).toBe('In 2022, 3 of the 5 seats most like Ripon were won by the Nationals.')
  })
  it('says so when no place has a 2022 holder', () => {
    const seats = map(mk(1, 'Ripon', null, null), ...FIVE.map((i) => mk(i, `P${i}`, null, null)))
    expect(likePlacesHeadline(1, FIVE, seats, false).headline).toBe('No 2022 result to show for the seats most like Ripon.')
  })
})

describe('likePlacesHeadline: some counted', () => {
  it('counts leaders only and says how many are not counted', () => {
    const seats = map(mk(1, 'Ripon', 'ALP', 'ALP'), mk(2, 'A', 'NAT', 'NAT'), mk(3, 'B', 'NAT', 'NAT'), mk(4, 'C', 'NAT', 'ALP'), mk(5, 'D', null, 'ALP'), mk(6, 'E', null, 'ALP'))
    expect(likePlacesHeadline(1, FIVE, seats, false)).toEqual({
      headline: 'The Nationals lead in 3 of the 5 seats most like Ripon, 2 not counted yet. One would change hands.',
      picked: 'Ripon: Labor leading',
    })
  })
  it('shows the picked seat as not counted when it has no leader', () => {
    const seats = map(mk(1, 'Ripon', null, 'ALP'), mk(2, 'A', 'NAT', 'NAT'), mk(3, 'B', null, 'NAT'), mk(4, 'C', null, 'ALP'), mk(5, 'D', null, 'ALP'), mk(6, 'E', null, 'ALP'))
    const r = likePlacesHeadline(1, FIVE, seats, false)
    expect(r.headline).toBe('The Nationals lead in 1 of the 5 seats most like Ripon, 4 not counted yet.')
    expect(r.picked).toBe('Ripon: not counted yet')
  })
  it('names an Independent lead and a tie', () => {
    const seats = map(mk(1, 'Ripon', null, 'ALP'), mk(2, 'A', 'IND', 'LIB'), mk(3, 'B', 'IND', 'LIB'), mk(4, 'C', 'ALP', 'ALP'), mk(5, 'D', 'ALP', 'ALP'), mk(6, 'E', 'GRN', 'ALP'))
    expect(likePlacesHeadline(1, FIVE, seats, false).headline).toBe('Labor and Independents each lead in 2 of the 5 seats most like Ripon. 3 would change hands.')
    const one = map(mk(1, 'Ripon', null, 'ALP'), mk(2, 'A', 'IND', 'LIB'), ...[3, 4, 5, 6].map((i) => mk(i, `P${i}`, 'ALP', 'ALP')))
    expect(likePlacesHeadline(1, FIVE, one, false).headline).toBe('Labor lead in 4 of the 5 seats most like Ripon. One would change hands.')
  })
  it('all five leading drops the not counted note', () => {
    const seats = map(mk(1, 'Ripon', 'ALP', 'ALP'), ...FIVE.map((i) => mk(i, `P${i}`, 'LIB', 'LIB')))
    expect(likePlacesHeadline(1, FIVE, seats, false).headline).toBe('The Liberals lead in 5 of the 5 seats most like Ripon.')
  })
  it('calls a declared picked seat won', () => {
    const seats = map(mk(1, 'Ripon', 'ALP', 'ALP', 'won'), ...FIVE.map((i) => mk(i, `P${i}`, 'LIB', 'LIB')))
    expect(likePlacesHeadline(1, FIVE, seats, false).picked).toBe('Ripon: Labor won')
  })
})

describe('likePlacesHeadline: final', () => {
  it('says won, then where the picked seat went', () => {
    const seats = map(mk(1, 'Ripon', 'ALP', 'ALP', 'won'), mk(2, 'A', 'NAT', 'NAT', 'won'), mk(3, 'B', 'NAT', 'NAT', 'won'), mk(4, 'C', 'NAT', 'NAT', 'won'), mk(5, 'D', 'NAT', 'ALP', 'won'), mk(6, 'E', 'ALP', 'ALP', 'won'))
    expect(likePlacesHeadline(1, FIVE, seats, true)).toEqual({
      headline: 'The Nationals won 4 of the 5 seats most like Ripon. Ripon went to Labor. One changed hands.',
      picked: null,
    })
  })
  it('handles a tie and a picked seat with no winner', () => {
    const seats = map(mk(1, 'Ripon', null, 'ALP'), mk(2, 'A', 'NAT', 'NAT', 'won'), mk(3, 'B', 'NAT', 'NAT', 'won'), mk(4, 'C', 'ALP', 'ALP', 'won'), mk(5, 'D', 'ALP', 'ALP', 'won'), mk(6, 'E', 'GRN', 'ALP', 'won'))
    expect(likePlacesHeadline(1, FIVE, seats, true).headline).toBe('Labor and the Nationals each won 2 of the 5 seats most like Ripon. One changed hands.')
  })
})

describe('words that never forecast', () => {
  it('uses none of the banned words in any state', () => {
    const all = map(mk(1, 'Ripon', 'ALP', 'ALP'), ...FIVE.map((i) => mk(i, `P${i}`, i % 2 ? 'NAT' : null, 'NAT')))
    for (const final of [false, true]) {
      const r = likePlacesHeadline(1, FIVE, all, final)
      expect(`${r.headline} ${r.picked ?? ''}`).not.toMatch(/predict|forecast|likely to|should/i)
    }
  })
})

describe('likePlaceRow', () => {
  it('gives the leader, the two-candidate share and the dot', () => {
    expect(likePlaceRow(mk(2, 'A', 'NAT', 'NAT', 'leading', 61.6))).toEqual({ party: 'NAT', line: 'Nationals leading, 62%', held: null })
    expect(likePlaceRow(mk(2, 'A', 'NAT', 'ALP', 'won', 70))).toEqual({ party: 'NAT', line: 'Nationals won, 70%', held: null })
  })
  it('falls back to the first preference share, then to no figure', () => {
    const s = { ...mk(2, 'A', 'GRN', 'ALP'), tcp: null, fp: [{ party: 'GRN', votes: 1, pct: 38.4 }] } as Seat
    expect(likePlaceRow(s).line).toBe('Greens leading, 38%')
    expect(likePlaceRow({ ...s, fp: [] } as Seat).line).toBe('Greens leading')
  })
  it('says not counted yet with the 2022 holder in muted text', () => {
    expect(likePlaceRow(mk(2, 'A', null, 'NAT'))).toEqual({ party: null, line: 'Not counted yet', held: 'Held by Nationals' })
    expect(likePlaceRow(mk(2, 'A', null, null))).toEqual({ party: null, line: 'Not counted yet', held: null })
  })
  it('is never NaN', () => {
    const s = mk(2, 'A', 'ALP', 'ALP', 'leading', Number.NaN)
    expect(likePlaceRow(s).line).not.toMatch(/NaN/)
  })
})

// VE-213 (FB-252): from and to, in counts and plain words. A seat is "changing hands" by the app's own rule (gainShown):
// it changed holder and its lead is firm, declared or past the early-lead point (pct 40 in mk is past it).
describe('changeWords: the app\'s retain and gain words on a row', () => {
  it('says keeps it, or wins it from the 2022 holder', () => {
    expect(changeWords(mk(2, 'A', 'NAT', 'NAT'))).toBe('keeps it')
    expect(changeWords(mk(2, 'A', 'NAT', 'ALP'))).toBe('wins it from Labor')
  })
  it('says nothing before a count, with no holder, or while a change is still too early to show', () => {
    expect(changeWords(mk(2, 'A', null, 'NAT'))).toBeNull()
    expect(changeWords(mk(2, 'A', 'NAT', null))).toBeNull()
    expect({ ...mk(2, 'A', 'NAT', 'ALP'), pct: 3 } as Seat).toBeDefined()
    expect(changeWords({ ...mk(2, 'A', 'NAT', 'ALP'), pct: 3, likely: false } as Seat)).toBeNull()
    // ADR 0033: a counted seat that is not Likely is still too early to call a change.
    expect(changeWords({ ...mk(2, 'A', 'NAT', 'ALP'), likely: false } as Seat)).toBeNull()
  })
})

describe('likePlacesHeadline: changing hands', () => {
  const five = (flip: number) => FIVE.map((i) => (i - 2 < flip ? mk(i, `P${i}`, 'NAT', 'ALP') : mk(i, `P${i}`, 'NAT', 'NAT')))
  const run = (flip: number, final = false) => likePlacesHeadline(1, FIVE, map(mk(1, 'Ripon', 'NAT', 'NAT'), ...five(flip)), final).headline
  it('says nothing when none change', () => expect(run(0)).toBe('The Nationals lead in 5 of the 5 seats most like Ripon.'))
  it('one, then two or more', () => {
    expect(run(1)).toBe('The Nationals lead in 5 of the 5 seats most like Ripon. One would change hands.')
    expect(run(2)).toBe('The Nationals lead in 5 of the 5 seats most like Ripon. 2 would change hands.')
  })
  it('at the final it is past tense', () => {
    expect(run(1, true)).toBe('The Nationals won 5 of the 5 seats most like Ripon. Ripon went to the Nationals. One changed hands.')
    expect(run(3, true)).toMatch(/ 3 changed hands\.$/)
  })
})

describe('likePlacesHeadline: swing direction', () => {
  const seats = map(mk(1, 'Ripon', 'ALP', 'ALP'), ...FIVE.map((i) => mk(i, `P${i}`, 'ALP', 'ALP')))
  const swings = (xs: (number | null)[], mine: number | null = null) => (id: number) => (id === 1 ? mine : (xs[id - 2] ?? null))
  const sentence = (xs: (number | null)[], mine: number | null = null, final = false) => {
    const r = likePlacesHeadline(1, FIVE, seats, final, swings(xs, mine))
    return r.headline.replace(/^.*?seats most like Ripon(, \d not counted yet)?\.( Ripon went to Labor\.)?/, '').trim()
  }
  it('names the largest group when at least 3 of 5 are past the threshold and one side leads', () => {
    expect(sentence([-3, -2, -4, -1, -2])).toBe('5 of the 5 have swung away from Labor since 2022.')
    expect(sentence([-3, -2, -4, 2, null])).toBe('3 of the 5 have swung away from Labor since 2022.')
    expect(sentence([3, 2, 4, -1, null])).toBe('3 of the 5 have swung towards Labor since 2022.')
  })
  it('says nothing for 2 of 5, a tie, or fewer than 3 past the threshold', () => {
    expect(sentence([-3, -2, null, null, null])).toBe('')
    expect(sentence([-3, -2, 3, 2, null])).toBe('')
    expect(sentence([null, null, null, null, null])).toBe('')
    expect(sentence([-3, 2, null, null, null])).toBe('')
    // 3 past the threshold but only 2 agree: not a pattern.
    expect(sentence([-3, -2, 2, null, null])).toBe('')
  })
  it('works at the final too, and never gives a percentage', () => {
    expect(sentence([-3, -2, -4, -1, -2], null, true)).toBe('5 of the 5 have swung away from Labor since 2022.')
    expect(sentence([-3, -2, -4, -1, -2])).not.toMatch(/%|\d\.\d/)
  })
  it('ignores a flat swing (rounds to nothing)', () => {
    expect(sentence([-0.01, 0, -3, -2, -1])).toBe('3 of the 5 have swung away from Labor since 2022.')
  })
  it('the picked seat agrees or goes the other way, only when the group sentence exists', () => {
    const f = (mine: number | null, xs: (number | null)[] = [-3, -2, -4, -1, -2]) => likePlacesHeadline(1, FIVE, seats, false, swings(xs, mine)).picked
    expect(f(-2)).toBe('Ripon: Labor leading. It has swung away from Labor too.')
    expect(f(2)).toBe('Ripon: Labor leading. It is moving the other way.')
    expect(f(null)).toBe('Ripon: Labor leading')
    expect(f(-2, [-3, 2, null, null, null])).toBe('Ripon: Labor leading')
  })
})

describe('likePlacesHeadline: the picked seat gaining', () => {
  it('says a gain from the 2022 holder', () => {
    const seats = map(mk(1, 'Ripon', 'ALP', 'LIB'), ...FIVE.map((i) => mk(i, `P${i}`, 'NAT', 'NAT')))
    expect(likePlacesHeadline(1, FIVE, seats, false).picked).toBe('Ripon: Labor leading, wins it from the Liberals')
  })
})
