import { describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import type { Tally } from '../derive/seats'
import { cycleIndex, cycleStep, keyParties, matrixParties, msToNextStep } from './leaderKeyParties'

const zero = (): Record<PartyBucket, number> => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0 })
const tally = (firm: Partial<Record<PartyBucket, number>>, leading: Partial<Record<PartyBucket, number>> = {}): Tally => ({ firm: { ...zero(), ...firm }, leading: { ...zero(), ...leading } })

describe('keyParties (VE-312: the chips under the view buttons)', () => {
  it('cycles Labor, Liberal, Nationals and Greens even when only Labor leads', () => {
    expect(keyParties(tally({ ALP: 5 }), null, false)).toEqual(['ALP', 'LIB', 'NAT', 'GRN'])
  })
  it('adds One Nation when it leads a seat, as the matrix does', () => {
    expect(keyParties(tally({ ALP: 20 }, { ONP: 1 }), null, false)).toEqual(['ALP', 'LIB', 'NAT', 'GRN', 'ONP'])
  })
  it('cycles the main four before any seat leads', () => {
    expect(keyParties(tally({}), null, false)).toEqual(['ALP', 'LIB', 'NAT', 'GRN'])
  })
  it('shows one party only, when a party is picked', () => {
    expect(keyParties(tally({ ALP: 20, LIB: 5 }), 'LIB', false)).toEqual(['LIB'])
  })
  it('a part-pick (LIB:pale) shows that party', () => {
    expect(keyParties(tally({ ALP: 20, LIB: 5 }), 'LIB:pale', false)).toEqual(['LIB'])
  })
  it('a Coalition pick shows the bigger partner, and a crossbench pick the biggest of IND and OTH', () => {
    expect(keyParties(tally({ LIB: 3, NAT: 6 }), 'COA', false)).toEqual(['NAT'])
    expect(keyParties(tally({ IND: 1, OTH: 4 }), 'XB', false)).toEqual(['OTH'])
  })
  it('keeps cycling for the seats-in-doubt pick, which is not a party', () => {
    expect(keyParties(tally({ ALP: 3, LIB: 2 }), 'DOUBT', false)).toEqual(['ALP', 'LIB', 'NAT', 'GRN'])
  })
  it('holds on Labor when motion is reduced (the device setting or the Animations switch)', () => {
    expect(keyParties(tally({ ALP: 3, LIB: 20 }), null, true)).toEqual(['ALP'])
    expect(keyParties(tally({}), null, true)).toEqual(['ALP'])
  })
  it('a pick still pins the key when motion is reduced', () => {
    expect(keyParties(tally({ ALP: 3, LIB: 2 }), 'LIB', true)).toEqual(['LIB'])
  })
})

describe('cycleStep (VE-312: every key on screen changes together)', () => {
  it('counts whole periods of the wall clock, so two keys mounted at different times agree', () => {
    expect(cycleStep(0, 4000)).toBe(0)
    expect(cycleStep(3999, 4000)).toBe(0)
    expect(cycleStep(4000, 4000)).toBe(1)
    expect(cycleStep(41_000, 4000)).toBe(10)
  })
  it('ms until the next change', () => {
    expect(msToNextStep(41_000, 4000)).toBe(3000)
    expect(msToNextStep(40_000, 4000)).toBe(4000)
  })
})

describe('matrixParties (VE-312)', () => {
  it('always shows Labor, Liberal, Nationals and Greens, even when only Labor leads', () => {
    expect(matrixParties(tally({ ALP: 5 }))).toEqual(['ALP', 'LIB', 'NAT', 'GRN'])
  })
  it('shows the same four before any seat leads', () => {
    expect(matrixParties(tally({}))).toEqual(['ALP', 'LIB', 'NAT', 'GRN'])
  })
  it('adds One Nation when it leads a seat', () => {
    expect(matrixParties(tally({ ALP: 5 }, { ONP: 1 }))).toEqual(['ALP', 'LIB', 'NAT', 'GRN', 'ONP'])
  })
  it('adds every other leading party, biggest first', () => {
    expect(matrixParties(tally({ IND: 1, OTH: 3 }, { ONP: 2 }))).toEqual(['ALP', 'LIB', 'NAT', 'GRN', 'OTH', 'ONP', 'IND'])
  })
})

describe('cycleIndex', () => {
  it('wraps and never overruns a shrinking list', () => {
    expect(cycleIndex(5, 3)).toBe(2)
    expect(cycleIndex(0, 0)).toBe(0)
  })
})
