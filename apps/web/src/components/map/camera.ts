/**
 * The map's camera, in VicGrid metres: a centre and metres per CSS pixel (the same shape as MapCamera, which the
 * transition overlay reads). Pure functions, so the gestures and the fit are testable without a browser.
 * y runs up in VicGrid and down on screen.
 */
export interface World {
  /** VicGrid easting of the left edge and northing of the top edge. */
  e0: number
  n0: number
  /** Extent in metres. */
  w: number
  h: number
}

export interface Cam {
  cx: number
  cy: number
  /** Metres per CSS pixel. */
  res: number
}

/** Zoom in this many times beyond the full-state fit (a 5 km inner Melbourne seat then fills the pane). */
export const MAX_ZOOM = 80
/** Breathing room round the state, as a share of its size (a few pixels at phone width). */
export const FIT_PAD = 0.015

export const worldCentre = (w: World): { cx: number; cy: number } => ({ cx: w.e0 + w.w / 2, cy: w.n0 - w.h / 2 })

/** Frame a box (VicGrid metres) so it fills as much of the pane as it can. */
export function frame(box: { minE: number; maxE: number; minN: number; maxN: number }, W: number, H: number, pad = 0): Cam {
  const bw = (box.maxE - box.minE) * (1 + 2 * pad)
  const bh = (box.maxN - box.minN) * (1 + 2 * pad)
  return { cx: (box.minE + box.maxE) / 2, cy: (box.minN + box.maxN) / 2, res: Math.max(bw / W, bh / H, 1e-6) }
}

export const worldBox = (w: World) => ({ minE: w.e0, maxE: w.e0 + w.w, minN: w.n0 - w.h, maxN: w.n0 })

/** The whole state, tightly. */
export const fitCam = (world: World, W: number, H: number): Cam => frame(worldBox(world), W, H, FIT_PAD)

/**
 * Keep the zoom within the fit and MAX_ZOOM times it, and the view over the state: the pane's edge cannot be dragged
 * inside the state's edge, so it cannot be flung away, and a view wider than the state sits centred on it.
 */
export function clampCam(cam: Cam, world: World, W: number, H: number): Cam {
  const fit = fitCam(world, W, H).res
  const res = Math.min(fit, Math.max(fit / MAX_ZOOM, cam.res))
  const b = worldBox(world)
  const axis = (v: number, lo: number, hi: number, half: number) => (lo + half > hi - half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, v)))
  return { res, cx: axis(cam.cx, b.minE, b.maxE, (W * res) / 2), cy: axis(cam.cy, b.minN, b.maxN, (H * res) / 2) }
}

/** Zoom by `factor` (above 1 zooms in) keeping the world point under screen point (sx, sy) where it is. */
export function zoomAbout(cam: Cam, factor: number, sx: number, sy: number, W: number, H: number): Cam {
  const res = cam.res / factor
  // World point under the cursor before: cx + (sx - W/2) * res; after the zoom it must be the same.
  return { res, cx: cam.cx + (sx - W / 2) * (cam.res - res), cy: cam.cy - (sy - H / 2) * (cam.res - res) }
}

/** Drag the map by (dx, dy) screen pixels. */
export const panBy = (cam: Cam, dx: number, dy: number): Cam => ({ ...cam, cx: cam.cx - dx * cam.res, cy: cam.cy + dy * cam.res })

/** VicGrid metres to pane pixels. */
export const toScreen = (cam: Cam, W: number, H: number, e: number, n: number): [number, number] => [W / 2 + (e - cam.cx) / cam.res, H / 2 - (n - cam.cy) / cam.res]

/**
 * The matrix for a group whose paths are in ticks (integer multiples of `tick` metres from the world's top left,
 * y down): ticks to pane pixels.
 */
export function toMatrix(cam: Cam, world: World, tick: number, W: number, H: number): [number, number, number] {
  const a = tick / cam.res
  return [a, W / 2 + (world.e0 - cam.cx) / cam.res, H / 2 + (cam.cy - world.n0) / cam.res]
}

/** Is all of the box inside the pane? (The e2e check that Rewind does not crop the state.) */
export function boxInside(cam: Cam, W: number, H: number, box: { minE: number; maxE: number; minN: number; maxN: number }, slack = 1): boolean {
  const [x0, y0] = toScreen(cam, W, H, box.minE, box.maxN)
  const [x1, y1] = toScreen(cam, W, H, box.maxE, box.minN)
  return x0 >= -slack && y0 >= -slack && x1 <= W + slack && y1 <= H + slack
}
