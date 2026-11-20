import { describe, expect, it } from 'vitest'
import { createZoomGauge, INSET_AWAY_ZOOM, insetAway } from './zoom'

describe('zoom gauge', () => {
  it('reads 1x at the first (full extent) camera and rises as the resolution falls', () => {
    const g = createZoomGauge()
    expect(g.read(null)).toBe(1)
    expect(g.read(1000)).toBe(1)
    expect(g.read(500)).toBe(2)
    expect(g.read(250)).toBe(4)
  })
  it('treats a coarser resolution (the window shrank) as the new full extent', () => {
    const g = createZoomGauge()
    g.read(1000)
    expect(g.read(1200)).toBe(1)
    expect(g.read(600)).toBe(2)
  })
  it('learns a smaller fit when told the map is at its fit', () => {
    const g = createZoomGauge()
    g.read(1000)
    g.fit(700)
    expect(g.read(700)).toBe(1)
    expect(g.read(350)).toBe(2)
  })
  it('puts the inset away above 2.5x only', () => {
    expect(INSET_AWAY_ZOOM).toBe(2.5)
    expect(insetAway(2.5)).toBe(false)
    expect(insetAway(2.51)).toBe(true)
    expect(insetAway(1)).toBe(false)
  })
})
