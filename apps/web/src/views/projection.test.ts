import { describe, expect, it } from 'vitest'
import { merc } from '../transitions'
import { vicgrid } from '../components/map/vicgrid'
import { mapScreen, seatsScreen, type Rect } from './projection'

const origin = { left: 10, top: 20 }

describe('mapScreen', () => {
  it('puts the camera centre at the middle of the pane rect, in overlay pixels', () => {
    const c = merc([145, -37])
    const rect: Rect = { left: 10, top: 20, width: 600, height: 400 }
    const f = mapScreen({ cx: c[0], cy: c[1], resolution: 1000, units: 'metres' }, rect, origin)
    const [x, y] = f(c)
    expect(x).toBeCloseTo(300)
    expect(y).toBeCloseTo(200)
  })
  it('moves east to the right and north up, one pixel per resolution step', () => {
    const rect: Rect = { left: 10, top: 20, width: 600, height: 400 }
    const f = mapScreen({ cx: 0, cy: 0, resolution: 500, units: 'metres' }, rect, origin)
    expect(f([500, 0])).toEqual([301, 200])
    expect(f([0, 500])).toEqual([300, 199])
  })
  it('offsets by the pane position inside the overlay', () => {
    const rect: Rect = { left: 410, top: 20, width: 200, height: 100 }
    const f = mapScreen({ cx: 0, cy: 0, resolution: 1, units: 'metres' }, rect, origin)
    expect(f([0, 0])).toEqual([500, 50])
  })
})

describe('mapScreen on the Web Mercator view', () => {
  const rect: Rect = { left: 10, top: 20, width: 600, height: 400 }
  it('keeps the true Mercator shape: Victoria is about 1.25 times narrower than in plate carree', () => {
    const f = mapScreen({ cx: 0, cy: 0, resolution: 1000, units: 'metres' }, rect, origin)
    const [wx, wy] = [f(merc([141, -34]))[0] - f(merc([150, -34]))[0], f(merc([145, -34]))[1] - f(merc([145, -39]))[1]]
    // 9 degrees wide by 5 high: plate carree is 9 : 5; Mercator stretches y by 1/cos(lat) (about 1.25 at 37 S)
    const ratio = Math.abs(wx) / Math.abs(wy)
    expect(ratio).toBeGreaterThan(1.3)
    expect(ratio).toBeLessThan(1.5)
    expect(9 / 5 / ratio).toBeGreaterThan(1.2)
    expect(9 / 5 / ratio).toBeLessThan(1.3)
  })
})

describe('mapScreen on a geographic view', () => {
  const rect: Rect = { left: 10, top: 20, width: 600, height: 400 }
  it('lands a point on the centre of the view and one degree east at 1/res pixels', () => {
    const f = mapScreen({ cx: 145, cy: -37, resolution: 0.01, units: 'degrees' }, rect, origin)
    const [x, y] = f(merc([145, -37]))
    expect(x).toBeCloseTo(300, 4)
    expect(y).toBeCloseTo(200, 4)
    // Plate carree: a degree of latitude is 100 px north, not a Mercator-stretched distance.
    const [x2, y2] = f(merc([146, -36]))
    expect(x2).toBeCloseTo(400, 4)
    expect(y2).toBeCloseTo(100, 4)
  })
})

describe('seatsScreen', () => {
  // Hand check: viewBox 0 0 200 100 in a 400 x 400 box meets at scale 2, centred vertically (offset 100).
  const rect: Rect = { left: 10, top: 20, width: 400, height: 400 }
  it('fits the viewBox with xMidYMid meet', () => {
    const f = seatsScreen({ x: 0, y: 0, w: 200, h: 100 }, rect, origin)
    const k = 100 * (180 / (Math.PI * 6378137)) // metres to SVG units, as SeatsPane's projectSvg
    const [x0, y0] = f([0, 0])
    expect(x0).toBeCloseTo(0)
    expect(y0).toBeCloseTo(100)
    // svg point (100, -50) is x = 100 -> 200px, y = -50 -> 100 + (-50 * 2) = 0
    const [x1, y1] = f([100 / k, 50 / k])
    expect(x1).toBeCloseTo(200)
    expect(y1).toBeCloseTo(0)
  })
})

describe('mapScreen on the VicGrid view (the SVG map, VE-74)', () => {
  const rect: Rect = { left: 10, top: 20, width: 600, height: 400 }
  const [e, n] = vicgrid(145, -37) // the false origin: 2,500,000 and 2,500,000
  it('lands a Web Mercator point on the centre when the camera is on that place in VicGrid metres', () => {
    const f = mapScreen({ cx: e, cy: n, resolution: 1000, units: 'vicgrid' }, rect, origin)
    const [x, y] = f(merc([145, -37]))
    expect(x).toBeCloseTo(300, 4)
    expect(y).toBeCloseTo(200, 4)
  })
  it('puts a point where the camera maths puts it: 100 km north of the centre is 100 px up at 1 km a pixel', () => {
    const [, n2] = vicgrid(145, -36.1)
    const f = mapScreen({ cx: e, cy: n, resolution: 1000, units: 'vicgrid' }, rect, origin)
    const [x, y] = f(merc([145, -36.1]))
    expect(x).toBeCloseTo(300, 3)
    expect(y).toBeCloseTo(200 - (n2 - n) / 1000, 3)
  })
  it('is true to shape: a degree of longitude is about 0.8 of a degree of latitude on the ground at 37 S', () => {
    const f = mapScreen({ cx: e, cy: n, resolution: 1000, units: 'vicgrid' }, rect, origin)
    const wx = f(merc([146, -37]))[0] - f(merc([145, -37]))[0]
    const hy = f(merc([145, -37]))[1] - f(merc([145, -36]))[1]
    expect(wx / hy).toBeGreaterThan(0.78)
    expect(wx / hy).toBeLessThan(0.81)
  })
})
