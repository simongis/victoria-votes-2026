/**
 * Phone framing (VE-217, ADR 0032): a tapped seat is eased into the part of the map that the seat sheet and the floating
 * controls leave visible, with room round it so its neighbours show. Pure functions on the map's camera, so the maths is
 * tested without a browser. VicGrid metres; y runs up in the world and down on screen.
 */
import { clampCam, fitCam, MAX_ZOOM, panBy, toScreen, worldBox, type Cam, type World } from './camera'
import type { Box } from './tiers'

/** Pixels of the pane covered on each side (the sheet at the bottom, or on the right when the phone is sideways). */
export interface Inset {
  top: number
  right: number
  bottom: number
  left: number
}
export const NO_INSET: Inset = { top: 0, right: 0, bottom: 0, left: 0 }

/** Room round a framed seat, as a share of its own size, on each side: enough for the ring of seats next to it. */
export const SEAT_BUFFER = 0.6
/**
 * The least the framed view spans, in metres, on each axis. Inner Melbourne seats are 4 to 6 km across, so 60% each side
 * of one shows barely a neighbour; 18 km shows the seat with about a ring of them, and still draws it over 44 px.
 */
export const MIN_SPAN_M = 18_000
/** A seat closer than this to the edge of the free part does not count as fully in view (so a pan lifts it clear). */
export const EDGE_PX = 12
/** The clamp's allowance past the state grows from none at the whole-state zoom to all of the inset by this zoom. */
export const OVER_FULL_ZOOM = 1.5

/** The part of the pane nothing covers, in pane pixels; never less than a pixel each way. */
export function freeRect(W: number, H: number, inset: Inset): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = Math.min(inset.left, W - 1)
  const y0 = Math.min(inset.top, H - 1)
  return { x0, y0, x1: Math.max(x0 + 1, W - inset.right), y1: Math.max(y0 + 1, H - inset.bottom) }
}

/**
 * The phone's clamp. Like clampCam (the same zoom limits, the view kept over the state), except that once zoomed in the
 * map may run past the state's edge by the covered part of the pane: otherwise a seat on the coast could never be lifted
 * clear of the sheet, and the first drag after a framing would snap it back under. The allowance fades out as the zoom
 * nears the whole state, so Victoria still sits centred at rest and zooming out never jumps.
 */
export function clampOver(cam: Cam, world: World, W: number, H: number, inset: Inset): Cam {
  const fit = fitCam(world, W, H).res
  const res = Math.min(fit, Math.max(fit / MAX_ZOOM, cam.res))
  const k = Math.min(1, Math.max(0, (fit / res - 1) / (OVER_FULL_ZOOM - 1)))
  if (k === 0 || (inset.top === 0 && inset.right === 0 && inset.bottom === 0 && inset.left === 0)) return clampCam(cam, world, W, H)
  const b = worldBox(world)
  // The plain clamp's range for the centre (a single point when the view is wider than the state on that axis), widened by
  // the allowance on each side. Widening the range rather than the state keeps a short state centred where the plain clamp
  // centres it, so a pinch low on the map is not shoved up to the middle of a lopsided box.
  const axis = (v: number, lo: number, hi: number, half: number, below: number, above: number) => {
    const mid = (lo + hi) / 2
    const a = lo + half > hi - half ? mid : lo + half
    const z = lo + half > hi - half ? mid : hi - half
    return Math.min(z + above, Math.max(a - below, v))
  }
  return {
    res,
    cx: axis(cam.cx, b.minE, b.maxE, (W * res) / 2, k * inset.left * res, k * inset.right * res),
    cy: axis(cam.cy, b.minN, b.maxN, (H * res) / 2, k * inset.bottom * res, k * inset.top * res),
  }
}

export interface FrameInput {
  /** The seat's bounds, VicGrid metres. */
  box: Box
  world: World
  /** The map pane, pixels. */
  W: number
  H: number
  /** What covers the pane while the seat is open. */
  inset: Inset
  /** Where the map is looking now. */
  cam: Cam
}

/**
 * Where the map should look to show a seat: its bounds plus SEAT_BUFFER of its size each side (at least MIN_SPAN_M, never
 * more than Victoria, never closer than the zoom limit), centred in the free part of the pane. If the reader is already
 * closer than that and the seat fits, the zoom is kept: an unchanged camera if the seat is fully in view, else the
 * smallest pan that brings it in.
 */
export function frameSeat({ box, world, W, H, inset, cam }: FrameInput): Cam {
  const f = freeRect(W, H, inset)
  const fw = f.x1 - f.x0
  const fh = f.y1 - f.y0
  const fit = fitCam(world, W, H).res
  const sw = box.maxE - box.minE
  const sh = box.maxN - box.minN
  const spanW = Math.min(world.w, Math.max(MIN_SPAN_M, sw * (1 + 2 * SEAT_BUFFER)))
  const spanH = Math.min(world.h, Math.max(MIN_SPAN_M, sh * (1 + 2 * SEAT_BUFFER)))
  const res = Math.min(fit, Math.max(fit / MAX_ZOOM, spanW / fw, spanH / fh))

  if (cam.res <= res && sw / cam.res <= fw - 2 * EDGE_PX && sh / cam.res <= fh - 2 * EDGE_PX) {
    const [x0, y0] = toScreen(cam, W, H, box.minE, box.maxN)
    const [x1, y1] = toScreen(cam, W, H, box.maxE, box.minN)
    const shift = (lo: number, hi: number, min: number, max: number) => (lo < min ? min - lo : hi > max ? max - hi : 0)
    const dx = shift(x0, x1, f.x0 + EDGE_PX, f.x1 - EDGE_PX)
    const dy = shift(y0, y1, f.y0 + EDGE_PX, f.y1 - EDGE_PX)
    if (dx === 0 && dy === 0) return cam
    return clampOver(panBy(cam, dx, dy), world, W, H, inset)
  }

  // The seat's centre goes to the free part's centre.
  const ex = (f.x0 + f.x1) / 2
  const ey = (f.y0 + f.y1) / 2
  const centre: Cam = { res, cx: (box.minE + box.maxE) / 2 - (ex - W / 2) * res, cy: (box.minN + box.maxN) / 2 + (ey - H / 2) * res }
  return clampOver(centre, world, W, H, inset)
}

/** One box round several (the seats a Close seats or Changing hands pick lights); null when there are none. */
export function unionBox(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null
  return boxes.reduce((u, b) => ({ minE: Math.min(u.minE, b.minE), maxE: Math.max(u.maxE, b.maxE), minN: Math.min(u.minN, b.minN), maxN: Math.max(u.maxN, b.maxN) }))
}

/** VE-227 (finding 2): the pixels of the map pane an open list covers, from the list's top edge to the pane's bottom (0 when it starts below it). */
export function railCover(pane: { top: number; bottom: number }, railTop: number): number {
  return Math.max(0, Math.min(pane.bottom - pane.top, pane.bottom - railTop))
}
