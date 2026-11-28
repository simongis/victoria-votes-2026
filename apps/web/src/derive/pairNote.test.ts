import { describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import { pairDoubtNote, pairDoubtText } from './pairNote'
import type { FpShare, Seat } from './seats'

// VE-293: a seat whose VEC pair is in doubt (VE-224's test) says so in the panel and drops what rests on that pair.
const fp = (shares: Partial<Record<PartyBucket, number>>): FpShare[] =>
  Object.entries(shares).map(([party, pct]) => ({ party: party as PartyBucket, votes: pct! * 100, pct: pct! })).sort((a, b) => b.pct - a.pct)
const seat = (over: Partial<Seat> = {}): Seat =>
  ({ name: 'Footscray', leader: 'ALP', state: 'leading', tcp: { a: 'ALP', b: 'LIB', pctA: 62 }, tcpWithheld: false, pct: 60, fp: fp({ GRN: 28.1, ALP: 40, LIB: 17.6, OTH: 14.3 }), ...over }) as Seat

describe('pairDoubtNote (VE-293)', () => {
  it('names the pair and the outsider when the outsider is not the first-preference leader', () => {
    expect(pairDoubtNote(seat())).toEqual({ a: 'ALP', b: 'LIB', outsider: 'GRN', outsiderPct: 28.1, leads: false })
  })
  it('says the outsider leads when it tops the first preferences', () => {
    const n = pairDoubtNote(seat({ fp: fp({ GRN: 41, ALP: 30, LIB: 17.6, OTH: 11.4 }) }))
    expect(n).toMatchObject({ outsider: 'GRN', leads: true })
  })
  it('is null for a sound pair, a withheld count, a declared seat and no count after preferences', () => {
    expect(pairDoubtNote(seat({ fp: fp({ ALP: 45, LIB: 35, GRN: 12, OTH: 8 }) }))).toBeNull()
    expect(pairDoubtNote(seat({ tcpWithheld: true }))).toBeNull()
    expect(pairDoubtNote(seat({ state: 'won' }))).toBeNull()
    expect(pairDoubtNote(seat({ tcp: null }))).toBeNull()
  })
  it('words', () => {
    expect(pairDoubtText(pairDoubtNote(seat())!)).toBe("VEC counting Labor v Liberal. Greens are on 28.1% of first preferences; the final two may differ.")
    expect(pairDoubtText(pairDoubtNote(seat({ fp: fp({ GRN: 41, ALP: 30, LIB: 17.6, OTH: 11.4 }) }))!)).toBe("VEC counting Labor v Liberal. Greens lead on first preferences (41.0%); the final two may differ.")
  })
})

describe('the outsider leading on first preferences counts at any count (VE-293, as the Multiples note does)', () => {
  const early = seat({ pct: 46, fp: fp({ GRN: 28.1, ALP: 22.7, LIB: 17.6, ONP: 16.7, OTH: 14.9 }) })
  it('flags Footscray at 46% counted, where pairInDoubt is silent', () => {
    expect(pairDoubtNote(early)).toMatchObject({ outsider: 'GRN', leads: true })
  })
  it('stays quiet at 46% when the outsider is within the gap of the weaker of the pair', () => {
    expect(pairDoubtNote(seat({ pct: 46, fp: fp({ ALP: 40, GRN: 22, LIB: 17.6, OTH: 20.4 }) }))).toBeNull()
  })
})

describe('the gap test applies at any count (VE-293 follow-up)', () => {
  it('flags a seat at 20% counted when the outsider is over the gap ahead of the weaker of the pair', () => {
    expect(pairDoubtNote(seat({ pct: 20, fp: fp({ ALP: 40, GRN: 28.1, LIB: 17.6, OTH: 14.3 }) }))).toMatchObject({ outsider: 'GRN', leads: false })
  })
  it('stays quiet at 20% within the gap, and with no count after preferences', () => {
    expect(pairDoubtNote(seat({ pct: 20, fp: fp({ ALP: 40, GRN: 22, LIB: 20, OTH: 18 }) }))).toBeNull()
    expect(pairDoubtNote(seat({ pct: 20, tcp: null }))).toBeNull()
  })
})
