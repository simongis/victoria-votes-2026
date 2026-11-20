import { describe, expect, it } from 'vitest'
import { clampCam, fitCam, MAX_ZOOM, panBy, toScreen, zoomAbout, type Cam, type World } from './camera'
import { clampOver, frameSeat, freeRect, MIN_SPAN_M, NO_INSET, railCover, SEAT_BUFFER, unionBox, type Inset } from './frameSeat'
import { parseTier, type Box } from './tiers'

import desktop from './geometry/districts-desktop.json?raw'

// A Victoria-sized world: 800 km across, 560 km tall, in VicGrid-like metres.
const world: World = { e0: 2_000_000, n0: 2_900_000, w: 800_000, h: 560_000 }
// A portrait phone's map pane, with the seat sheet over the bottom 55% and the "i" row over the top 52 px.
const W = 390
const H = 700
const inset: Inset = { top: 52, right: 0, bottom: Math.round(H * 0.55), left: 0 }
const free = freeRect(W, H, inset)
const box = (cE: number, cN: number, halfW: number, halfH = halfW): Box => ({ minE: cE - halfW, maxE: cE + halfW, minN: cN - halfH, maxN: cN + halfH })
const atRest = (): Cam => fitCam(world, W, H)
/** The seat's box on screen under a camera. */
const onScreen = (cam: Cam, b: Box) => {
  const [x0, y0] = toScreen(cam, W, H, b.minE, b.maxN)
  const [x1, y1] = toScreen(cam, W, H, b.maxE, b.minN)
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}

describe('freeRect: the part of the pane the sheet and the floating controls leave', () => {
  it('takes the insets off each side', () => {
    expect(freeRect(W, H, inset)).toEqual({ x0: 0, y0: 52, x1: 390, y1: 700 - 385 })
  })
  it('never goes below one pixel, even if the insets cover the pane', () => {
    const r = freeRect(100, 100, { top: 80, right: 0, bottom: 80, left: 0 })
    expect(r.y1 - r.y0).toBeGreaterThanOrEqual(1)
  })
})

describe('frameSeat', () => {
  it('frames a middle-sized seat with about 60% of its size each side, centred in the free part above the sheet', () => {
    // A 40 km seat in the middle of the state.
    const seat = box(2_400_000, 2_620_000, 20_000)
    const cam = frameSeat({ box: seat, world, W, H, inset, cam: atRest() })
    const s = onScreen(cam, seat)
    // Centred in the free part, not the pane.
    expect(s.cx).toBeCloseTo((free.x0 + free.x1) / 2, 0)
    expect(s.cy).toBeCloseTo((free.y0 + free.y1) / 2, 0)
    // The free part's short side (its height) holds the seat plus SEAT_BUFFER of its size on each side.
    const freeH = free.y1 - free.y0
    expect(s.h).toBeCloseTo(freeH / (1 + 2 * SEAT_BUFFER), 0)
    expect(s.y0 - free.y0).toBeCloseTo(SEAT_BUFFER * s.h, 0)
  })

  it('gives a tiny Melbourne seat a floor, so several neighbours show round it', () => {
    // A 4 km seat: 60% each side would be only 8.8 km across, about one neighbour. The floor makes it MIN_SPAN_M.
    const seat = box(2_500_000, 2_500_000, 2000)
    const cam = frameSeat({ box: seat, world, W, H, inset, cam: atRest() })
    const freeW = (free.x1 - free.x0) * cam.res
    const freeH = (free.y1 - free.y0) * cam.res
    expect(Math.min(freeW, freeH)).toBeCloseTo(MIN_SPAN_M, -2)
    // Still well zoomed: the seat is comfortably tappable (over 44 px) and inside the free part.
    const s = onScreen(cam, seat)
    expect(Math.min(s.w, s.h)).toBeGreaterThan(44)
    expect(s.y1).toBeLessThan(free.y1)
    expect(s.y0).toBeGreaterThan(free.y0)
  })

  it('never frames wider than Victoria: a huge seat stops at the whole-state zoom', () => {
    // A 300 km seat: with its buffer it wants far more than the free part can show at the state's fit.
    const seat = box(2_400_000, 2_650_000, 150_000)
    const cam = frameSeat({ box: seat, world, W, H, inset, cam: atRest() })
    expect(cam.res).toBeCloseTo(fitCam(world, W, H).res, 6)
  })

  it('never zooms in past the map’s own limit', () => {
    const seat = box(2_500_000, 2_500_000, 50)
    const cam = frameSeat({ box: seat, world, W, H, inset, cam: atRest() })
    expect(cam.res).toBeGreaterThanOrEqual(fitCam(world, W, H).res / MAX_ZOOM - 1e-9)
  })

  it('already closer and the seat fully in view above the sheet: no zoom out and no move', () => {
    const seat = box(2_500_000, 2_500_000, 2000)
    // Zoomed in beyond the framing about the seat itself (so it stays in the free part), then nudged a few pixels.
    const target = frameSeat({ box: seat, world, W, H, inset, cam: atRest() })
    const at = onScreen(target, seat)
    const closer = panBy(zoomAbout(target, 2, at.cx, at.cy, W, H), 9, -6)
    expect(frameSeat({ box: seat, world, W, H, inset, cam: closer })).toEqual(closer)
  })

  it('already closer but the seat is under the sheet: keeps the zoom and pans just enough', () => {
    const seat = box(2_500_000, 2_500_000, 2000)
    const target = frameSeat({ box: seat, world, W, H, inset, cam: atRest() })
    const res = target.res / 2
    // Seat centred on the pane: at this zoom its lower part is under the sheet.
    const closer: Cam = { cx: 2_500_000, cy: 2_500_000, res }
    const cam = frameSeat({ box: seat, world, W, H, inset, cam: closer })
    expect(cam.res).toBe(res)
    const s = onScreen(cam, seat)
    expect(s.y1).toBeLessThanOrEqual(free.y1)
    expect(s.y0).toBeGreaterThanOrEqual(free.y0)
    // Only up: the left and right were already fine.
    expect(cam.cx).toBeCloseTo(closer.cx, 6)
  })

  it('already closer but the seat no longer fits at that zoom: frames it as from further out', () => {
    const seat = box(2_400_000, 2_620_000, 20_000)
    const target = frameSeat({ box: seat, world, W, H, inset, cam: atRest() })
    const tooClose: Cam = { cx: 2_400_000, cy: 2_620_000, res: target.res / 8 }
    const cam = frameSeat({ box: seat, world, W, H, inset, cam: tooClose })
    expect(cam.res).toBeCloseTo(target.res, 6)
  })

  it('a seat on the south coast can still sit above the sheet (the map may run past the coast by the sheet)', () => {
    // A 10 km seat right at the state's southern edge.
    const seat = box(2_400_000, world.n0 - world.h + 5000, 5000)
    const cam = frameSeat({ box: seat, world, W, H, inset, cam: atRest() })
    const s = onScreen(cam, seat)
    expect(s.y1).toBeLessThanOrEqual(free.y1 + 0.5)
    // And the plain clamp would have pushed it back under the sheet: this is why the phone clamp allows it.
    const plain = onScreen(clampCam(cam, world, W, H), seat)
    expect(plain.y1).toBeGreaterThan(free.y1)
  })

  it('with no insets (a pane with nothing over it) centres the seat on the pane', () => {
    const seat = box(2_400_000, 2_620_000, 20_000)
    const cam = frameSeat({ box: seat, world, W, H, inset: NO_INSET, cam: atRest() })
    const s = onScreen(cam, seat)
    expect(s.cx).toBeCloseTo(W / 2, 0)
    expect(s.cy).toBeCloseTo(H / 2, 0)
  })

  it('a phone held sideways: the sheet is on the right, so the seat is centred in the left part', () => {
    const sw = { W: 844, H: 330 }
    const side: Inset = { top: 52, right: 380, bottom: 0, left: 0 }
    const seat = box(2_400_000, 2_620_000, 20_000)
    const cam = frameSeat({ box: seat, world, W: sw.W, H: sw.H, inset: side, cam: fitCam(world, sw.W, sw.H) })
    const [x0] = toScreen(cam, sw.W, sw.H, seat.minE, seat.maxN)
    const [x1] = toScreen(cam, sw.W, sw.H, seat.maxE, seat.minN)
    expect((x0 + x1) / 2).toBeCloseTo((844 - 380) / 2, 0)
  })
})

describe('clampOver: the phone clamp lets the map run past the state by the covered edges, once zoomed in', () => {
  it('is the plain clamp at the whole-state zoom (Victoria sits centred at rest)', () => {
    const rest = fitCam(world, W, H)
    const nudged = { ...rest, cy: rest.cy - 100_000 }
    expect(clampOver(nudged, world, W, H, inset)).toEqual(clampCam(nudged, world, W, H))
  })
  it('is the plain clamp with no insets at any zoom (desktop)', () => {
    const c: Cam = { cx: 2_100_000, cy: 2_360_000, res: 100 }
    expect(clampOver(c, world, W, H, NO_INSET)).toEqual(clampCam(c, world, W, H))
  })
  it('zoomed in, lets the south coast rise up to the sheet but no further', () => {
    const res = fitCam(world, W, H).res / 4
    const far: Cam = { cx: 2_400_000, cy: world.n0 - world.h - 1_000_000, res }
    const c = clampOver(far, world, W, H, inset)
    // The state's southern edge lands on the sheet's top edge.
    const [, y] = toScreen(c, W, H, 2_400_000, world.n0 - world.h)
    expect(y).toBeCloseTo(H - inset.bottom, 3)
  })
  it('keeps the zoom limits of the plain clamp', () => {
    const fit = fitCam(world, W, H).res
    expect(clampOver({ cx: 2_400_000, cy: 2_600_000, res: fit * 3 }, world, W, H, inset).res).toBeCloseTo(fit, 9)
    expect(clampOver({ cx: 2_400_000, cy: 2_600_000, res: 0.01 }, world, W, H, inset).res).toBeCloseTo(fit / MAX_ZOOM, 9)
  })
  it('a pinch in the lower half, still zoomed out so the state is shorter than the pane, keeps its point under the fingers', () => {
    // Victoria is wide: on a portrait phone it fills the width and well under half the height at rest. Pinching 1.5 times about
    // a point low on the map must not shove the state up to the middle of the extended range (the bug a first cut had).
    const rest = fitCam(world, W, H)
    const z = zoomAbout(rest, 1.5, W / 2, 400, W, H)
    expect(clampOver(z, world, W, H, inset)).toEqual(z)
  })
  it('moves smoothly as the zoom nears the whole state: no jump between nearly fit and fit', () => {
    const fit = fitCam(world, W, H).res
    const far = (res: number): Cam => ({ cx: 2_400_000, cy: world.n0 - world.h - 1_000_000, res })
    const a = clampOver(far(fit * 0.999), world, W, H, inset)
    const b = clampOver(far(fit), world, W, H, inset)
    expect(Math.abs(a.cy - b.cy) / fit).toBeLessThan(2) // under 2 px apart
  })
})

describe('frameSeat on the real geometry (portrait phone, 390 px wide)', () => {
  const tier = parseTier(JSON.parse(desktop))
  const rest = fitCam(tier.world, W, H)
  const area = (b: Box) => (b.maxE - b.minE) * (b.maxN - b.minN)
  const sorted = [...tier.boxes.entries()].sort(([, a], [, b]) => area(a) - area(b))

  it('frames the smallest inner Melbourne seat above the sheet at a tappable size, with room for neighbours', () => {
    const [id, b] = sorted[0]!
    const cam = frameSeat({ box: b, world: tier.world, W, H, inset, cam: rest })
    const s = onScreen(cam, b)
    expect({ id, inside: s.y0 >= free.y0 && s.y1 <= free.y1 && s.x0 >= 0 && s.x1 <= W }).toEqual({ id, inside: true })
    expect(Math.min(s.w, s.h)).toBeGreaterThan(44)
    // The free part shows at least MIN_SPAN_M on its short side: several seats of about 5 km.
    expect(Math.min(free.x1 - free.x0, free.y1 - free.y0) * cam.res).toBeGreaterThanOrEqual(MIN_SPAN_M - 1)
  })

  it('frames Footscray (15970) whole above the sheet', () => {
    const b = tier.boxes.get(15970)!
    const s = onScreen(frameSeat({ box: b, world: tier.world, W, H, inset, cam: rest }), b)
    expect(s.y0).toBeGreaterThanOrEqual(free.y0 - 0.5)
    expect(s.y1).toBeLessThanOrEqual(free.y1 + 0.5)
  })

  it('never frames wider than Victoria, even for the biggest seats', () => {
    for (const [id, b] of sorted.slice(-4)) {
      const cam = frameSeat({ box: b, world: tier.world, W, H, inset, cam: rest })
      expect({ id, ok: cam.res <= rest.res + 1e-6 }).toEqual({ id, ok: true })
    }
  })

  it('every seat comes out centred where the clamp allows and inside the zoom limits', () => {
    for (const [id, b] of sorted) {
      const cam = frameSeat({ box: b, world: tier.world, W, H, inset, cam: rest })
      expect({ id, same: clampOver(cam, tier.world, W, H, inset) }).toEqual({ id, same: cam })
    }
  })
})

describe('unionBox (VE-227, finding 2: the lit seats frame as one box above the open list)', () => {
  it('spans every box', () => {
    const u = unionBox([box(1000, 1000, 100), box(5000, 3000, 200, 50)])!
    expect(u).toEqual({ minE: 900, maxE: 5200, minN: 900, maxN: 3050 })
  })
  it('is null for nothing', () => {
    expect(unionBox([])).toBeNull()
  })
})

describe('railCover: how much of the map pane an open list covers', () => {
  it('is the part of the pane below the list top, never negative or past the pane', () => {
    expect(railCover({ top: 0, bottom: 710 }, 385)).toBe(325)
    expect(railCover({ top: 0, bottom: 710 }, 900)).toBe(0)
    expect(railCover({ top: 100, bottom: 710 }, 0)).toBe(610)
  })
})
