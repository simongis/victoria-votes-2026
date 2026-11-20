import { countedRgb } from '../../../derive/colour'
import type { Palette, Rgb } from '../../../theme/theme'

const lin = (v: number): number => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (c: Rgb): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
/** WCAG contrast ratio, 1 to 21. */
export const contrast = (a: Rgb, b: Rgb): number => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)

/** A deep navy (the Counted ink's family) for figures on pale seats. */
export const LABEL_DARK: Rgb = [10, 22, 46]
export const LABEL_LIGHT: Rgb = [255, 255, 255]
/** How far the halo moves from the seat's own colour towards the opposite end: enough to lift digits off the edge, too little to read as a ring. */
const HALO_SHIFT = 0.3

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as Rgb

export interface CountedLabel {
  text: string
  ink: Rgb
  halo: Rgb
}

/**
 * The % counted printed on a hexagon (FB-134). The figure is deep navy or white, whichever reads better on the seat's
 * own fill (the Counted ramp's middle steps are too mid-tone for the ramp's own ink or the paper to reach 4.5:1). The
 * halo stays in the seat's own colour family, nudged away from the figure, so it separates the digits quietly instead
 * of drawing a black or white ring. No figure at all (nothing counted yet) gets no label.
 */
export function countedLabel(pct: number | null | undefined, pal: Palette, cuts?: readonly [number, number, number]): CountedLabel | null {
  if (pct === null || pct === undefined) return null
  return { text: String(Math.round(pct)), ...labelOn(countedRgb(pct, pal, cuts)) }
}

/**
 * Ink and halo for a figure on any seat fill (VE-129, FB-147: the main Hex prints % counted on whatever colour is on
 * show). Same rule as the Counted lens: navy or white, whichever contrasts more, and a halo in the fill's own family.
 */
export function labelOn(fill: Rgb): { ink: Rgb; halo: Rgb } {
  const ink = contrast(LABEL_DARK, fill) >= contrast(LABEL_LIGHT, fill) ? LABEL_DARK : LABEL_LIGHT
  return { ink, halo: mix(fill, ink === LABEL_DARK ? LABEL_LIGHT : LABEL_DARK, HALO_SHIFT) }
}
