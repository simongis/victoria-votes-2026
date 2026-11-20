import { describe, expect, it } from 'vitest'
import type { GeoCollection, Position } from '../data/types'
import type { TransitionScene } from './draw'
import { drawFrame, prepareGeometry, snapshotScreen } from './draw'
import { buildMorphShapes, merc } from './morph'
import { createTransitionRunner, type StageEvent } from './runner'

const sq = (x: number, y: number, s: number): Position[] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
  [x, y],
]
const col = (polys: Record<number, Position[]>): GeoCollection<{ district_id: number }> => ({
  type: 'FeatureCollection',
  features: Object.entries(polys).map(([id, r]) => ({
    type: 'Feature',
    properties: { district_id: Number(id) },
    geometry: { type: 'Polygon', coordinates: [r] },
  })),
})
const geometry = buildMorphShapes(col({ 1: sq(144, -38, 1), 2: sq(146, -38, 1) }), col({ 1: sq(143, -37, 0.5), 2: sq(144, -37, 0.5) }), 24)

const scene: TransitionScene = {
  width: 800,
  height: 500,
  // Any linear map is enough to test the plumbing; the callers supply real projections.
  project: {
    map: (p) => [(p[0] - 1.5e7) / 1000, (-p[1] - 4e6) / 1000],
    seats: (p) => [(p[0] - 1.5e7) / 1000 + 50, (-p[1] - 4e6) / 1000 + 50],
  },
  seats: [
    { id: 1, party: 'ALP', fill: 'rgb(1,2,3)' },
    { id: 2, party: 'LIB', fill: 'rgb(4,5,6)' },
  ],
  tally: 'bar',
  stroke: '#fff',
  track: '#eee',
  marker: '#111',
}

/** A canvas context that records the fills so we can see what was drawn. */
function fakeCanvas() {
  const fills: string[] = []
  const ctx = new Proxy(
    { fillStyle: '', set: 0 } as Record<string, unknown>,
    {
      get(t, k: string) {
        if (k === 'fill') return () => fills.push(String(t['fillStyle']))
        if (k in t) return t[k]
        return () => undefined
      },
      set(t, k: string, v) {
        t[k] = v
        return true
      },
    },
  )
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
  return { canvas, fills }
}

describe('drawFrame', () => {
  const snap = snapshotScreen(prepareGeometry(geometry), scene)
  it('paints every seat in its own colour in the morph and the tally', () => {
    const { canvas, fills } = fakeCanvas()
    const info = drawFrame(canvas.getContext('2d')!, snap, 0.5)
    expect(info.counts).toBeNull()
    expect(fills).toEqual(expect.arrayContaining(['rgb(1,2,3)', 'rgb(4,5,6)']))
    const t = fakeCanvas()
    const end = drawFrame(t.canvas.getContext('2d')!, snap, 2)
    expect(end.counts).toEqual({ alp: 1, coalition: 1, settle: 1 })
  })
  it('hands the shell label opacities that hand over from Map to Seats', () => {
    const { canvas } = fakeCanvas()
    const c = canvas.getContext('2d')!
    expect(drawFrame(c, snap, 0).mapLabels).toBe(1)
    expect(drawFrame(c, snap, 1).seatLabels).toBe(1)
  })
})

describe('runner', () => {
  function harness(motion: 'full' | 'reduced') {
    const { canvas } = fakeCanvas()
    const events: StageEvent[] = []
    let now = 0
    const cbs: ((t: number) => void)[] = []
    const runner = createTransitionRunner({
      canvas,
      geometry,
      getScene: () => scene,
      onStage: (e) => events.push(e),
      motion: () => motion,
      raf: (cb) => cbs.push(cb),
      caf: () => undefined,
    })
    const tick = (dt = 16) => {
      now += dt
      const cb = cbs.shift()
      cb?.(now)
      return cb !== undefined
    }
    return { runner, events, tick, merc }
  }

  it('runs Map to Seats, goes inactive on arrival and resolves true', async () => {
    const h = harness('full')
    const p = h.runner.run('seats')
    let guard = 0
    while (h.tick() && guard++ < 1000);
    await expect(p).resolves.toBe(true)
    expect(h.runner.mode).toBe('seats')
    expect(h.events.some((e) => e.active)).toBe(true)
    expect(h.events[h.events.length - 1]).toMatchObject({ active: false, mode: 'seats' })
  })
  it('a second run supersedes the first without a gap', async () => {
    const h = harness('full')
    const first = h.runner.run('tally')
    for (let i = 0; i < 20; i++) h.tick()
    const second = h.runner.run('map')
    await expect(first).resolves.toBe(false)
    let guard = 0
    while (h.tick() && guard++ < 1000);
    await expect(second).resolves.toBe(true)
    expect(h.runner.mode).toBe('map')
  })
  it('reduced motion emits a cross-fade and never draws frames', async () => {
    const h = harness('reduced')
    const p = h.runner.run('seats')
    let guard = 0
    while (h.tick(100) && guard++ < 100);
    await expect(p).resolves.toBe(true)
    const fades = h.events.filter((e) => e.crossfade !== null)
    expect(fades.length).toBeGreaterThan(1)
    expect(fades.every((e) => e.frame === null)).toBe(true)
    expect(h.runner.mode).toBe('seats')
  })
})
