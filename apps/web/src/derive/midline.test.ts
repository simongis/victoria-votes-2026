import { describe, expect, it } from 'vitest'
import { midlineInk } from './midline'
import { PARTY_COLOURS } from '../parties'
import type { Rgb } from '../theme/theme'

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb

describe('midlineInk (VE-284)', () => {
  it('uses a light line on dark fills and a dark line on light fills', () => {
    expect(midlineInk([20, 90, 40])).toBe('light')
    expect(midlineInk([0, 49, 116])).toBe('light')
    expect(midlineInk([240, 240, 240])).toBe('dark')
    expect(midlineInk([250, 220, 120])).toBe('dark')
  })
  it('picks by party: Nationals and Liberal light, Greens dark', () => {
    expect(midlineInk(rgb(PARTY_COLOURS.NAT))).toBe('light')
    expect(midlineInk(rgb(PARTY_COLOURS.LIB))).toBe('light')
    expect(midlineInk(rgb(PARTY_COLOURS.GRN))).toBe('dark')
    expect(midlineInk(rgb(PARTY_COLOURS.ONP))).toBe('dark')
    expect(midlineInk(rgb(PARTY_COLOURS.ALP))).toBe('light')
  })
})
