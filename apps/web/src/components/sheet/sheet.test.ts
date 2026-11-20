import { describe, expect, it } from 'vitest'
import { CLOSE_PX, FLICK_PX_MS, dragPlace, settle, sheetGrows, sheetStops, tapNext, velocity, type Stop } from './sheet'

// A seat sheet on a 390 x 844 phone: the workspace under the band is about 700 px; peek shows the handle and headline.
const PEEK = 120
const HALF = 385
const FULL = 700
const three: Stop[] = [
  { name: 'peek', h: PEEK },
  { name: 'half', h: HALF },
  { name: 'full', h: FULL },
]
const two: Stop[] = three.slice(0, 2)
const withClosed: Stop[] = [{ name: 'closed', h: 44 }, ...two]

describe('settle: where a released sheet comes to rest', () => {
  it('a slow release goes to the nearest height', () => {
    expect(settle(400, 0, three, null)).toBe('half')
    expect(settle(560, 0.1, three, null)).toBe('full')
    expect(settle(240, -0.2, three, null)).toBe('peek')
    expect(settle(HALF + 2, 0, three, null)).toBe('half')
  })

  it('a fast flick goes to the next height in its direction, however short the drag', () => {
    expect(settle(HALF + 20, FLICK_PX_MS, three, null)).toBe('full')
    expect(settle(HALF - 20, -FLICK_PX_MS, three, null)).toBe('peek')
    // From near full, a flick down passes half only if it is already below it.
    expect(settle(FULL - 30, -1.2, three, null)).toBe('half')
    expect(settle(HALF - 30, -1.2, three, null)).toBe('peek')
  })

  it('just under the flick speed is a slow release', () => {
    expect(settle(HALF + 20, FLICK_PX_MS - 0.01, three, null)).toBe('half')
  })

  it('a flick past either end stays at that end when nothing is beyond it', () => {
    expect(settle(FULL - 5, 2, three, null)).toBe('full')
    expect(settle(PEEK + 4, -2, two, null)).toBe('peek')
  })

  it('a drag well below peek closes a sheet that can close; a little below springs back', () => {
    const closeBelow = PEEK - CLOSE_PX
    expect(settle(PEEK - CLOSE_PX - 1, 0, three, closeBelow)).toBe('close')
    expect(settle(PEEK - 30, 0, three, closeBelow)).toBe('peek')
    expect(settle(PEEK - 30, 0, three, null)).toBe('peek')
  })

  it('a fast flick down from at or below peek closes, once it has moved a little', () => {
    const closeBelow = PEEK - CLOSE_PX
    expect(settle(PEEK - 30, -0.8, three, closeBelow)).toBe('close')
    expect(settle(PEEK - 10, -0.8, three, closeBelow)).toBe('peek')
    // A flick down from half stops at peek, not past it.
    expect(settle(HALF - 40, -2, three, closeBelow)).toBe('peek')
  })

  it('a sheet with a closed height treats it as one more stop below peek', () => {
    expect(settle(PEEK - 80, 0, withClosed, null)).toBe('closed')
    expect(settle(PEEK - 20, 0, withClosed, null)).toBe('peek')
    expect(settle(PEEK - 20, -0.9, withClosed, null)).toBe('closed')
    expect(settle(60, 0.9, withClosed, null)).toBe('peek')
  })
})

describe('tapNext: the handle steps peek, half, full, half, peek', () => {
  it('goes up to the top, then back down, then up again', () => {
    const order = ['peek', 'half', 'full'] as const
    let at: (typeof order)[number] | 'closed' = 'peek'
    let dir: 1 | -1 = 1
    const seen: string[] = []
    for (let i = 0; i < 6; i++) {
      const n = tapNext(order, at, dir)
      at = n.to
      dir = n.dir
      seen.push(at)
    }
    expect(seen).toEqual(['half', 'full', 'half', 'peek', 'half', 'full'])
  })

  it('with two heights it toggles', () => {
    expect(tapNext(['peek', 'half'], 'peek', 1)).toEqual({ to: 'half', dir: 1 })
    expect(tapNext(['peek', 'half'], 'half', 1)).toEqual({ to: 'peek', dir: -1 })
    expect(tapNext(['peek', 'half'], 'half', -1)).toEqual({ to: 'peek', dir: -1 })
  })

  it('a closed sheet (or one at a height it no longer has) goes to peek', () => {
    expect(tapNext(['peek', 'half'], 'closed', -1)).toEqual({ to: 'peek', dir: 1 })
    expect(tapNext(['peek', 'half'], 'full', -1)).toEqual({ to: 'half', dir: -1 })
  })
})

describe('sheetStops: the heights a sheet has', () => {
  it('half is a share of the room, full is all of it', () => {
    expect(sheetStops({ room: 700, peek: 120, share: 0.55, full: true })).toEqual([
      { name: 'peek', h: 120 },
      { name: 'half', h: 385 },
      { name: 'full', h: 700 },
    ])
    expect(sheetStops({ room: 700, peek: 70, share: 0.6, full: false })).toEqual([
      { name: 'peek', h: 70 },
      { name: 'half', h: 420 },
    ])
  })

  it('content that fits at half has no full, and a short one stops at its own height', () => {
    expect(sheetStops({ room: 700, peek: 120, share: 0.55, full: true, natural: 300 })).toEqual([
      { name: 'peek', h: 120 },
      { name: 'half', h: 300 },
    ])
    // A little over half is still no full: the extra few pixels scroll.
    expect(sheetStops({ room: 700, peek: 120, share: 0.55, full: true, natural: 390 }).map((s) => s.name)).toEqual(['peek', 'half'])
  })

  it('long content reaches no further than its own height, and never past the room', () => {
    expect(sheetStops({ room: 700, peek: 120, share: 0.55, full: true, natural: 520 }).at(-1)).toEqual({ name: 'full', h: 520 })
    expect(sheetStops({ room: 700, peek: 120, share: 0.55, full: true, natural: 1900 }).at(-1)).toEqual({ name: 'full', h: 700 })
  })

  it('full stops short of the room by the gap left for the controls row over the stage', () => {
    expect(sheetStops({ room: 765, peek: 120, share: 0.55, full: true, gap: 52 }).at(-1)).toEqual({ name: 'full', h: 713 })
    expect(sheetStops({ room: 765, peek: 120, share: 0.55, full: true, gap: 52, natural: 2000 }).at(-1)).toEqual({ name: 'full', h: 713 })
    // Half stays a share of the whole room, so the map framing above it is unchanged.
    expect(sheetStops({ room: 765, peek: 120, share: 0.55, full: true, gap: 52 })[1]).toEqual({ name: 'half', h: 421 })
  })

  it('half is never below peek, and the closed height sits under peek', () => {
    expect(sheetStops({ room: 700, peek: 120, share: 0.55, full: true, natural: 90 })).toEqual([
      { name: 'peek', h: 120 },
      { name: 'half', h: 120 },
    ])
    expect(sheetStops({ room: 600, peek: 150, share: 0.6, full: false, closed: 44 })[0]).toEqual({ name: 'closed', h: 44 })
  })
})

describe('dragPlace: the sheet under the finger', () => {
  it('follows the finger between peek and full', () => {
    expect(dragPlace(300, three, true)).toEqual({ px: 300, drop: 0 })
  })

  it('below peek a closable sheet slides down whole; one that stops at peek gives a little', () => {
    expect(dragPlace(PEEK - 50, three, true)).toEqual({ px: PEEK, drop: 50 })
    const held = dragPlace(PEEK - 50, three, false)
    expect(held.px).toBe(PEEK)
    expect(held.drop).toBeGreaterThan(0)
    expect(held.drop).toBeLessThan(25)
  })

  it('above the top it gives a little and stops at the room', () => {
    const over = dragPlace(FULL + 60, three, true)
    expect(over.px).toBeGreaterThan(FULL)
    expect(over.px).toBeLessThan(FULL + 30)
  })
})

describe('sheetGrows: the handle label', () => {
  it('says more when the next tap is taller, less otherwise', () => {
    expect(sheetGrows({ detent: 'peek', next: 'half' })).toBe(true)
    expect(sheetGrows({ detent: 'half', next: 'full' })).toBe(true)
    expect(sheetGrows({ detent: 'full', next: 'half' })).toBe(false)
    expect(sheetGrows({ detent: 'half', next: 'peek' })).toBe(false)
    expect(sheetGrows({ detent: 'closed', next: 'peek' })).toBe(true)
  })
})

describe('velocity: px per ms upward over the last 100 ms', () => {
  it('reads the recent movement only', () => {
    // The rest at 100 px before 400 ms does not slow the flick.
    expect(velocity([{ t: 0, h: 100 }, { t: 400, h: 100 }, { t: 450, h: 180 }, { t: 500, h: 260 }])).toBeCloseTo(1.6)
    expect(velocity([{ t: 0, h: 300 }, { t: 50, h: 260 }])).toBeCloseTo(-0.8)
  })
  it('is zero with one sample or none, or when the finger rested before letting go', () => {
    expect(velocity([])).toBe(0)
    expect(velocity([{ t: 0, h: 10 }])).toBe(0)
  })
})
