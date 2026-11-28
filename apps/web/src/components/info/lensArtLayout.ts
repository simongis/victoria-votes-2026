/**
 * VE-313: the logic behind the small pictures that open three More ways keys (lensArt.tsx). Kept apart from the drawing
 * so the choices and the layout can be tested without a browser.
 */

/** What the Strongest lens is showing: the vote map, the seat profile (fifths) or the other votes. */
export type StrongestTop = 'vote' | 'share' | 'flow'

/**
 * Which picture heads the Strongest key. Simon (28 Nov): when the seat profile is on, the picture explains that instead.
 * Other votes has its own words and no colour scale, so no picture.
 */
export function strongestArtFor(top: StrongestTop): 'strength' | 'profile' | null {
  if (top === 'vote') return 'strength'
  if (top === 'share') return 'profile'
  return null
}

/** `n` shares from 0 to the top of the party's scale, evenly, so the picture's steps match the map's ramp. */
export function rampStops(max: number, n: number): number[] {
  if (n <= 1) return [max]
  return Array.from({ length: n }, (_, i) => (max * i) / (n - 1))
}

/**
 * Where a line passes through the middle line at `midY`, by straight-line interpolation. A line that only touches the
 * middle and turns back is not a crossing: on the small charts that is a tie, not a lead changing.
 */
export function crossings(points: readonly (readonly [number, number])[], midY: number): number[] {
  const out: number[] = []
  let lastSign = 0
  let lastX = 0
  let lastY = 0
  let zeroX: number | null = null
  for (const [x, y] of points) {
    const s = Math.sign(y - midY)
    if (s === 0) {
      zeroX ??= x
      continue
    }
    if (lastSign !== 0 && s !== lastSign) out.push(zeroX ?? lastX + ((midY - lastY) / (y - lastY)) * (x - lastX))
    lastSign = s
    lastX = x
    lastY = y
    zeroX = null
  }
  return out
}

export interface Spot { x: number; y: number; r: number }

/** Hexagon sizes in the Similar picture: your seat, the 5 nearest, the next 15. */
export const SIM_R = { centre: 12, five: 9, fifteen: 6 } as const

/** Your seat, in the middle of the left part of the picture (0 to 214 across, 0 to 124 down; labels sit to the right). */
export const SIM_CENTRE: Spot = { x: 100, y: 64, r: SIM_R.centre }

/** The 5 most alike, out towards the edges: alike places are often far apart. */
export const SIM_FIVE: readonly Spot[] = (
  [
    [28, 24],
    [176, 22],
    [200, 96],
    [38, 106],
    [138, 110],
  ] as const
).map(([x, y]) => ({ x, y, r: SIM_R.five }))

/** The next 15, faintly shaded, scattered between. */
export const SIM_FIFTEEN: readonly Spot[] = (
  [
    [70, 44], [130, 46], [72, 84], [128, 84], [100, 30],
    [100, 98], [60, 64], [140, 64], [160, 46], [164, 78],
    [46, 44], [20, 70], [190, 60], [70, 112], [110, 8],
  ] as const
).map(([x, y]) => ({ x, y, r: SIM_R.fifteen }))

/** A thread from your seat to one of the five: a gentle curve, bowed a fifth of its length to one side, as the lens draws. */
export function threadPath(a: Spot, b: Spot): string {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const k = 0.2
  const cx = Math.round(mx - (b.y - a.y) * k)
  const cy = Math.round(my + (b.x - a.x) * k)
  return `M${a.x} ${a.y}Q${cx} ${cy} ${b.x} ${b.y}`
}
