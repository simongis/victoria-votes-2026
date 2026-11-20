import { describe, expect, it } from 'vitest'
import type { DistrictStatic, PartyBucket } from '@vic26/schema'
import { pairInDoubt, swingShown } from './colour'
import { swingGapLine } from './swingNote'
import type { FpShare, Seat } from './seats'

// VE-224: the pair check and the words for a seat with no swing. Seats are fixtures; 2022 has no One Nation second place.
const st = (over: Partial<DistrictStatic> = {}) => ({ base_tcp_party_a: 'ALP', base_tcp_party_b: 'LIB', base_tcp_pct_a: 55, ...over }) as DistrictStatic
const fp = (shares: Partial<Record<PartyBucket, number>>): FpShare[] =>
  Object.entries(shares).map(([party, pct]) => ({ party: party as PartyBucket, votes: pct! * 100, pct: pct! })).sort((a, b) => b.pct - a.pct)
const seat = (over: Partial<Seat> = {}): Seat =>
  ({ name: 'X', leader: 'ALP', state: 'leading', tcp: { a: 'ALP', b: 'LIB', pctA: 58 }, tcpWithheld: false, pct: 60, baseNote: '2022', fp: fp({ ALP: 45, LIB: 35, GRN: 12, OTH: 8 }), ...over }) as Seat

// Melton, 2022 pattern: the VEC counted Labor v Liberal while One Nation was second on first preferences.
// The real Melton gap at midnight was 7.4 points (Liberal 24.3 ahead of the independent in the VEC's pair at 16.9).
const melton = seat({ fp: fp({ ALP: 38, ONP: 26, LIB: 18.6, GRN: 9.4, OTH: 8 }) })

describe('pairInDoubt: a party outside the VEC pair has more first preferences than one of the pair (VE-224)', () => {
  it('flags the Melton case past the swing threshold', () => {
    expect(pairInDoubt(melton)).toBe(true)
  })
  it('needs the outsider more than 6 points of first preferences ahead of the weaker of the pair (VE-226 tuning)', () => {
    // Kew and Hawthorn 2022: Labor up to 2.1 points ahead of the independent, who then overtook it on preferences. Right pairs.
    expect(pairInDoubt(seat({ leader: 'LIB', tcp: { a: 'LIB', b: 'IND', pctA: 53.7 }, fp: fp({ LIB: 44.3, ALP: 22.7, IND: 21.8, OTH: 11.2 }) }))).toBe(false)
    expect(pairInDoubt(seat({ leader: 'LIB', tcp: { a: 'LIB', b: 'IND', pctA: 51.5 }, fp: fp({ LIB: 42.3, ALP: 22.1, IND: 20.0, OTH: 15.6 }) }))).toBe(false)
    // The boundary: 6 points is not enough, a little more is.
    expect(pairInDoubt(seat({ fp: fp({ ALP: 40, ONP: 26, LIB: 20, OTH: 14 }) }))).toBe(false)
    expect(pairInDoubt(seat({ fp: fp({ ALP: 40, ONP: 26.2, LIB: 20, OTH: 13.8 }) }))).toBe(true)
  })
  it('does not flag a clean Labor v Liberal count', () => {
    expect(pairInDoubt(seat())).toBe(false)
  })
  it('does not flag a withheld count (it has its own words) or a seat with no pair yet', () => {
    expect(pairInDoubt(seat({ tcp: null, tcpWithheld: true, fp: melton.fp }))).toBe(false)
    expect(pairInDoubt(seat({ tcp: null, fp: melton.fp }))).toBe(false)
  })
  it('does not flag below the swing threshold, where early booths mislead', () => {
    expect(pairInDoubt({ ...melton, pct: 40 })).toBe(false)
  })
  it('ignores the catch-all Other bucket, which lumps unrelated parties', () => {
    expect(pairInDoubt(seat({ fp: fp({ ALP: 40, LIB: 22, OTH: 25, GRN: 13 }) }))).toBe(false)
  })
  it('treats a flagged seat as not comparable: no swing', () => {
    expect(swingShown(seat(), st())).toBeCloseTo(3)
    expect(swingShown(melton, st())).toBeNull()
  })
})

describe('swingGapLine: why a seat has no swing (VE-224)', () => {
  it('names a new contest against the old one', () => {
    const s = seat({ tcp: { a: 'ALP', b: 'ONP', pctA: 54 }, fp: fp({ ALP: 38, ONP: 30, LIB: 20, GRN: 12 }) })
    expect(swingGapLine(s, st())).toBe('New contest: Labor v One Nation (2022: Labor v Liberal). No like-for-like swing.')
    expect(swingGapLine({ ...s, baseNote: '2025 by-election' }, st())).toBe('New contest: Labor v One Nation (2025 by-election: Labor v Liberal). No like-for-like swing.')
  })
  it('says the count may be on the wrong two', () => {
    expect(swingGapLine(melton, st())).toBe('The count may be on the wrong two candidates.')
  })
  it('says nothing while too early, for a like-for-like seat, or with no pair yet', () => {
    expect(swingGapLine(seat({ pct: 30, tcp: { a: 'ALP', b: 'ONP', pctA: 54 } }), st())).toBeNull()
    expect(swingGapLine(seat(), st())).toBeNull()
    expect(swingGapLine(seat({ tcp: null }), st())).toBeNull()
    expect(swingGapLine(seat({ tcp: { a: 'ALP', b: 'ONP', pctA: 54 }, fp: fp({ ALP: 38, ONP: 30, LIB: 20 }) }), st({ base_tcp_party_a: null, base_tcp_party_b: null }))).toBeNull()
  })
})
