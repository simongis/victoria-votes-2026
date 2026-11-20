/**
 * The swing arrow in the ABC 2025 shape (VE-117b, prototype variant A): a hairline tail that thickens along the shaft into
 * a bold head. Pure geometry in pixels, so the stage, the key and the side panel draw the same arrow.
 */
export interface Taper {
  /** The seven outline points, tail first, going round the top edge, the tip, then back along the lower edge. */
  points: [number, number][]
  tip: [number, number]
}

const ANGLE = (30 * Math.PI) / 180

/**
 * An arrow with its tail at the origin. `dir` is -1 toward Labor (left) and 1 toward the Coalition (right); `angled`
 * tilts it up 30 degrees, as the ABC draws it. `scale` thickens everything (the panel's marks are drawn larger).
 */
export function taperArrow(len: number, dir: 1 | -1, angled: boolean, scale = 1): Taper {
  const hl = Math.min(10, Math.max(5, len * 0.5)) * scale // head length
  const hw = hl * 0.62 // head half-width, bolder than the shaft
  const tail = 0.45 * scale
  const shaft = 1.9 * scale
  const L = Math.max(len, hl + 1)
  const b = L - hl
  const flat: [number, number][] = [[0, -tail], [b, -shaft], [b, -hw], [L, 0], [b, hw], [b, shaft], [0, tail]]
  // Built pointing along +x, then turned: mirrored for Labor, and tilted up when angled.
  const theta = angled ? ANGLE : 0
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const turn = ([x, y]: [number, number]): [number, number] => [dir * (x * cos + y * sin), -x * sin + y * cos]
  const points = flat.map(turn)
  return { points, tip: points[3]! }
}

/** SVG `points` text for a polygon. */
export const pointsAttr = (t: Taper): string => t.points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')
