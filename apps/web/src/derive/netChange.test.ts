import { describe, expect, it } from 'vitest'
import type { PartyNet } from './gains'
import { netChip, netSentence } from './netChange'

const n = (party: PartyNet['party'], gains: number, losses: number): PartyNet => ({ party, gains, losses, net: gains - losses })

describe('netChip (VE-190, FB-223)', () => {
  it('shows the signed net when one side is empty', () => {
    expect(netChip(n('GRN', 1, 0))).toBe('+1')
    expect(netChip(n('NAT', 0, 1))).toBe('−1')
    expect(netChip(n('ALP', 6, 0))).toBe('+6')
  })
  it('shows a swap as gained and lost, never as a bare 0', () => {
    expect(netChip(n('ALP', 1, 1))).toBe('+1 −1')
    expect(netChip(n('LIB', 2, 2))).toBe('+2 −2')
  })
  it('keeps the net when a party both gained and lost but did not break even', () => {
    expect(netChip(n('ALP', 3, 1))).toBe('+2')
    expect(netChip(n('LIB', 1, 3))).toBe('−2')
  })
  it('is 0 only when nothing changed', () => {
    expect(netChip(n('ALP', 0, 0))).toBe('0')
  })
})

describe('netSentence', () => {
  it('says gained and lost in words, with the right plural', () => {
    expect(netSentence(n('ALP', 1, 1))).toBe('Labor: gained 1 seat, lost 1 seat')
    expect(netSentence(n('GRN', 2, 0))).toBe('Greens: gained 2 seats, lost 0 seats')
  })
})
