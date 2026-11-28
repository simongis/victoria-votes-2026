import { describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import type { Tally } from '../derive/seats'
import { cycleIndex, keyParties } from './leaderKeyParties'

const zero = (): Record<PartyBucket, number> => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0 })
const tally = (firm: Partial<Record<PartyBucket, number>>, leading: Partial<Record<PartyBucket, number>> = {}): Tally => ({ firm: { ...zero(), ...firm }, leading: { ...zero(), ...leading } })

describe('keyParties', () => {
  it('orders parties by seats won and leading, biggest first, leaving out parties with none', () => {
    const t = tally({ ALP: 20, LIB: 5 }, { ALP: 5, NAT: 8, GRN: 1 })
    expect(keyParties(t, null, false)).toEqual(['ALP', 'NAT', 'LIB', 'GRN'])
  })
  it('breaks ties in a fixed order so the cycle does not flicker', () => {
    expect(keyParties(tally({ GRN: 2, LIB: 2 }), null, false)).toEqual(['LIB', 'GRN'])
  })
  it('shows one party only, when a party is picked', () => {
    expect(keyParties(tally({ ALP: 20, LIB: 5 }), 'LIB', false)).toEqual(['LIB'])
  })
  it('a part-pick (LIB:strong) shows that party', () => {
    expect(keyParties(tally({ ALP: 20, LIB: 5 }), 'LIB:pale', false)).toEqual(['LIB'])
  })
  it('a Coalition pick shows the bigger partner, and a crossbench pick the biggest of IND and OTH', () => {
    expect(keyParties(tally({ LIB: 3, NAT: 6 }), 'COA', false)).toEqual(['NAT'])
    expect(keyParties(tally({ IND: 1, OTH: 4 }), 'XB', false)).toEqual(['OTH'])
  })
  it('keeps cycling for the seats-in-doubt pick, which is not a party', () => {
    expect(keyParties(tally({ ALP: 3, LIB: 2 }), 'DOUBT', false)).toEqual(['ALP', 'LIB'])
  })
  it('cycles every leading party whenever the app animations are on (the device reduced-motion setting is not an input)', () => {
    expect(keyParties(tally({ ALP: 3, LIB: 2 }), null, false)).toEqual(['ALP', 'LIB'])
  })
  it('shows the leader alone when the Animations switch is off', () => {
    expect(keyParties(tally({ ALP: 3, LIB: 2 }), null, true)).toEqual(['ALP'])
  })
  it('a pick still pins the key when animations are off', () => {
    expect(keyParties(tally({ ALP: 3, LIB: 2 }), 'LIB', true)).toEqual(['LIB'])
  })
  it('animations off with no seat leading falls back to Labor', () => {
    expect(keyParties(tally({}), null, true)).toEqual(['ALP'])
  })
  it('falls back to Labor before any seat leads', () => {
    expect(keyParties(tally({}), null, false)).toEqual(['ALP'])
  })
})

describe('cycleIndex', () => {
  it('wraps and never overruns a shrinking list', () => {
    expect(cycleIndex(5, 3)).toBe(2)
    expect(cycleIndex(0, 0)).toBe(0)
  })
})
