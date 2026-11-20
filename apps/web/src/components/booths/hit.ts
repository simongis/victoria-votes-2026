/** A dot's place on screen, in pane pixels. */
export interface ScreenDot {
  key: number
  x: number
  y: number
  r: number
}

/**
 * The dot nearest a pointer, measured from each dot's edge, within `reach` pixels. A few thousand dots a few pixels
 * across are too small to aim at, so the pane finds the nearest one itself instead of giving each its own target.
 */
export function nearestDot(dots: readonly ScreenDot[], px: number, py: number, reach: number): ScreenDot | null {
  let best: ScreenDot | null = null
  let bestGap = Infinity
  for (const d of dots) {
    const gap = Math.hypot(d.x - px, d.y - py) - d.r
    if (gap < reach && gap < bestGap) {
      best = d
      bestGap = gap
    }
  }
  return best
}
