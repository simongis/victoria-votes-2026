import type { Rgb } from '../theme/theme'

const lin = (v: number): number => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (c: Rgb): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])

/**
 * VE-284: which ink the 50% line on a two-candidate bar should use over the fill beneath it. Picks whichever of near-black
 * or white has the higher contrast with the fill, so the line reads on Nationals green as well as on a pale tint.
 */
export function midlineInk(fill: Rgb): 'dark' | 'light' {
  const l = luminance(fill)
  const dark = (l + 0.05) / (luminance([20, 20, 20]) + 0.05)
  const light = 1.05 / (l + 0.05)
  return light > dark ? 'light' : 'dark'
}
