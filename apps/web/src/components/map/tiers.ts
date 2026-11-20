/**
 * The drawing geometry: projected (VicGrid) and simplified at build time (packages/layouts/src/svg-map), served as
 * static files. Three tiers; the pane starts on the one that suits its first zoom and fetches a finer one only when
 * someone zooms in far enough to see the difference. Each path is in integer ticks of `tick` metres, y down, from the
 * top left of the state.
 */
import phoneUrl from './geometry/districts-phone.json?url'
import desktopUrl from './geometry/districts-desktop.json?url'
import detailUrl from './geometry/districts-detail.json?url'
import type { World } from './camera'

export interface Tier {
  tick: number
  world: World
  /** district_id to SVG path data in ticks. */
  paths: Map<number, string>
  /** district_id to its box in VicGrid metres, for zoom-to-seat. */
  boxes: Map<number, Box>
}
export interface Box {
  minE: number
  maxE: number
  minN: number
  maxN: number
}

interface File {
  v: number
  tick: number
  origin: [number, number]
  w: number
  h: number
  paths: Record<string, string>
}

const URLS = [phoneUrl, desktopUrl, detailUrl] as const
/** Simplification tolerance of each tier in metres (matches the build script). */
const TOL = [900, 150, 25] as const

/** Which tier is fine enough at this zoom: its tolerance stays under about 0.6 of a pixel. */
export const tierFor = (res: number): 0 | 1 | 2 => (res * 0.6 >= TOL[0] ? 0 : res * 0.6 >= TOL[1] ? 1 : 2)

/** Box of a path of integer ticks (an absolute move then relative lines per ring), in ticks. */
export function pathBoxTicks(d: string): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  let x = 0, y = 0
  for (const ring of d.split('z')) {
    const m = /^M(-?\d+) (-?\d+)l?(.*)$/.exec(ring)
    if (!m) continue
    x = Number(m[1])
    y = Number(m[2])
    const take = () => {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    take()
    const nums = m[3]!.match(/-?\d+/g) ?? []
    for (let i = 0; i + 1 < nums.length; i += 2) {
      x += Number(nums[i])
      y += Number(nums[i + 1])
      take()
    }
  }
  return { x0, y0, x1, y1 }
}

/**
 * Where to put a mark on a seat: the area centroid of its biggest ring, in ticks. The biggest ring so a seat with an
 * island is marked on its mainland; the centroid (not the box centre) so a crescent's mark stays inside it. A ring with
 * no area falls back to its box centre.
 */
export function pathCentre(d: string): { x: number; y: number } {
  let best: { area: number; cx: number; cy: number } | null = null
  for (const ring of d.split('z')) {
    const m = /^M(-?\d+) (-?\d+)l?(.*)$/.exec(ring)
    if (!m) continue
    const pts: [number, number][] = [[Number(m[1]), Number(m[2])]]
    const nums = m[3]!.match(/-?\d+/g) ?? []
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const [px, py] = pts[pts.length - 1]!
      pts.push([px + Number(nums[i]), py + Number(nums[i + 1])])
    }
    let a2 = 0, cx = 0, cy = 0
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i]!
      const [x1, y1] = pts[(i + 1) % pts.length]!
      const w = x0 * y1 - x1 * y0
      a2 += w
      cx += (x0 + x1) * w
      cy += (y0 + y1) * w
    }
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const area = Math.abs(a2) / 2
    const here = a2 === 0
      ? { area, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 }
      : { area, cx: cx / (3 * a2), cy: cy / (3 * a2) }
    if (!best || here.area > best.area) best = here
  }
  return best ? { x: best.cx, y: best.cy } : { x: 0, y: 0 }
}

export function parseTier(f: File): Tier {
  const world: World = { e0: f.origin[0], n0: f.origin[1], w: f.w, h: f.h }
  const paths = new Map<number, string>()
  const boxes = new Map<number, Box>()
  for (const [id, d] of Object.entries(f.paths)) {
    paths.set(Number(id), d)
    const b = pathBoxTicks(d)
    boxes.set(Number(id), { minE: world.e0 + b.x0 * f.tick, maxE: world.e0 + b.x1 * f.tick, minN: world.n0 - b.y1 * f.tick, maxN: world.n0 - b.y0 * f.tick })
  }
  return { tick: f.tick, world, paths, boxes }
}

/** VE-149: a hung request ends in a plain failure (and a retry next time) rather than waiting for ever. */
export const TIER_TIMEOUT_MS = 30_000
const inflight = new Map<number, Promise<Tier>>()
export function loadTier(i: 0 | 1 | 2): Promise<Tier> {
  let p = inflight.get(i)
  if (!p) {
    p = fetch(URLS[i], { signal: AbortSignal.timeout(TIER_TIMEOUT_MS) }).then((r) => {
      if (!r.ok) throw new Error(`map geometry ${r.status}`)
      return r.json() as Promise<File>
    }).then(parseTier)
    // A failed fetch must be retried next time, not remembered.
    p.catch(() => inflight.delete(i))
    inflight.set(i, p)
  }
  return p
}

// Start the first fetch as soon as the app's code runs, in parallel with the results data (a phone wants the coarse tier, a desktop the middle one).
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') loadTier(window.innerWidth < 700 ? 0 : 1).catch(() => undefined)
