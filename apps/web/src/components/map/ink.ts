import type { Rgb } from '../../theme/theme'

/** Black or white, whichever reads better on a fill (party colours range from the pale Greens to deep Labor red). */
export function onFill([r, g, b]: Rgb): string {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return l > 0.3 ? '#0b0b0b' : '#ffffff'
}
