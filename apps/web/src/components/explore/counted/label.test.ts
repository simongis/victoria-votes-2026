import { describe, expect, it } from 'vitest'
import { countedRgb } from '../../../derive/colour'
import type { Palette, Rgb } from '../../../theme/theme'
import { contrast, countedLabel, LABEL_DARK, LABEL_LIGHT, labelOn } from './label'

const pal = (paper: Rgb): Palette => ({ party: {} as Palette['party'], tintBase: paper, tintAmount: 0, paper, noResult: [200, 200, 200], edge: paper, selected: [0, 0, 0] })
const LIGHT = pal([246, 244, 239])
const DARK = pal([24, 28, 34])

describe('countedLabel (VE-123, FB-134)', () => {
  it('shows a whole number, and nothing when nothing is counted', () => {
    expect(countedLabel(61.6, LIGHT)?.text).toBe('62')
    expect(countedLabel(0.2, LIGHT)?.text).toBe('0')
    expect(countedLabel(null, LIGHT)).toBeNull()
    expect(countedLabel(undefined, LIGHT)).toBeNull()
  })

  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ])('the figure reads on every step of the %s palette (contrast at least 4.5)', (_n, p) => {
    for (const pct of [5, 30, 60, 95]) {
      const l = countedLabel(pct, p)!
      expect(contrast(l.ink, countedRgb(pct, p))).toBeGreaterThanOrEqual(4.5)
      // The halo stays in the seat's own colour family: it lifts the digits without a ring.
      expect(contrast(l.halo, countedRgb(pct, p))).toBeLessThan(2)
    }
  })

  it('is navy or white, never a party colour', () => {
    const l = countedLabel(95, LIGHT)!
    expect([LABEL_DARK, LABEL_LIGHT]).toContainEqual(l.ink)
  })
})

describe('labelOn (VE-129, FB-147): a figure on any seat fill', () => {
  const fills: Rgb[] = [[255, 255, 255], [246, 244, 239], [24, 28, 34], [200, 60, 60], [210, 150, 150], [60, 90, 200], [150, 170, 220], [120, 120, 120], [230, 200, 60]]
  it('is navy or white, whichever reads better, and always at least large-text contrast (3:1)', () => {
    for (const f of fills) {
      const l = labelOn(f)
      expect([LABEL_DARK, LABEL_LIGHT]).toContainEqual(l.ink)
      expect(contrast(l.ink, f)).toBeGreaterThanOrEqual(3)
    }
  })
  it('keeps the halo in the fill family, so it lifts the digits without a ring', () => {
    for (const f of fills) expect(contrast(labelOn(f).halo, f)).toBeLessThan(2)
  })
  it('agrees with countedLabel for a counted step', () => {
    const fill = countedRgb(60, LIGHT)
    expect(countedLabel(60, LIGHT)).toMatchObject({ ink: labelOn(fill).ink, halo: labelOn(fill).halo })
  })
})
