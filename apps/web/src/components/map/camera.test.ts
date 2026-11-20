import { describe, expect, it } from 'vitest'
import { boxInside, clampCam, fitCam, frame, MAX_ZOOM, panBy, toMatrix, toScreen, worldBox, zoomAbout, type World } from './camera'

const world: World = { e0: 2000000, n0: 2900000, w: 800000, h: 560000 }

describe('camera', () => {
  it('fits the whole state with no stretch: one scale for both axes', () => {
    const c = fitCam(world, 1000, 700)
    expect(boxInside(c, 1000, 700, worldBox(world))).toBe(true)
    // The state is wider than the pane's ratio allows on one axis only.
    const [x0, y0] = toScreen(c, 1000, 700, world.e0, world.n0)
    const [x1, y1] = toScreen(c, 1000, 700, world.e0 + world.w, world.n0 - world.h)
    expect((x1 - x0) / (y1 - y0)).toBeCloseTo(world.w / world.h, 6)
  })

  it('zooms about the cursor: the world point under it does not move', () => {
    const c = fitCam(world, 1000, 700)
    const before = { x: 300, y: 200 }
    const e = c.cx + (before.x - 500) * c.res
    const n = c.cy - (before.y - 350) * c.res
    const z = zoomAbout(c, 3, before.x, before.y, 1000, 700)
    const [sx, sy] = toScreen(z, 1000, 700, e, n)
    expect(sx).toBeCloseTo(before.x, 6)
    expect(sy).toBeCloseTo(before.y, 6)
    expect(z.res).toBeCloseTo(c.res / 3, 9)
  })

  it('drags the map with the finger', () => {
    const c = fitCam(world, 1000, 700)
    const p = panBy(c, 40, -25)
    const [x, y] = toScreen(p, 1000, 700, c.cx, c.cy)
    expect(x).toBeCloseTo(500 + 40, 6)
    expect(y).toBeCloseTo(350 - 25, 6)
  })

  it('limits zoom to the fit and MAX_ZOOM times it, and keeps the centre in the state', () => {
    const fit = fitCam(world, 1000, 700)
    expect(clampCam({ ...fit, res: fit.res * 5 }, world, 1000, 700).res).toBeCloseTo(fit.res, 9)
    expect(clampCam({ ...fit, res: 0.001 }, world, 1000, 700).res).toBeCloseTo(fit.res / MAX_ZOOM, 9)
    const z = { ...fit, res: fit.res / 10 }
    const far = clampCam({ ...z, cx: 0, cy: 9e9 }, world, 1000, 700)
    // Zoomed in, the pane's left edge stops at the state's left edge and its top at the state's top.
    expect(far.cx - (1000 * z.res) / 2).toBeCloseTo(world.e0, 6)
    expect(far.cy + (700 * z.res) / 2).toBeCloseTo(world.n0, 6)
    // At the fit the state is centred whatever the centre was.
    const centred = clampCam({ ...fit, cx: 0, cy: 0 }, world, 1000, 700)
    expect(centred.cx).toBeCloseTo(world.e0 + world.w / 2, 6)
    expect(centred.cy).toBeCloseTo(world.n0 - world.h / 2, 6)
  })

  it('frames a small box and fills the pane with it', () => {
    const box = { minE: 2400000, maxE: 2410000, minN: 2400000, maxN: 2406000 }
    const c = frame(box, 1000, 700, 0)
    expect(boxInside(c, 1000, 700, box)).toBe(true)
    const [x0] = toScreen(c, 1000, 700, box.minE, box.maxN)
    expect(x0).toBeCloseTo(0, 6)
  })

  it('the tick matrix puts the top-left tick at the right pixel', () => {
    const c = fitCam(world, 1000, 700)
    const [a, tx, ty] = toMatrix(c, world, 100, 1000, 700)
    const [x, y] = toScreen(c, 1000, 700, world.e0 + 5000, world.n0 - 2000)
    expect(tx + a * 50).toBeCloseTo(x, 6)
    expect(ty + a * 20).toBeCloseTo(y, 6)
  })
})
