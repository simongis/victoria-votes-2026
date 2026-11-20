import { useEffect, useRef, useState } from 'react'
import type { Statics } from '../../data/types'
import { projectSvg, ringsById } from '../../views/geometry'
import { pathBoxTicks, pathCentre, type Tier } from '../map/tiers'

/** Map and Hex geometry shared by the lenses that draw the seats full stage (arrows, counted). */
export interface Item {
  id: number
  /** Path data (Map) or polygon points (Hex). */
  geom: string
  cx: number
  cy: number
  box: { x0: number; y0: number; x1: number; y1: number }
}
export interface View {
  vb: [number, number, number, number]
  items: Item[]
}
/** Element size, kept current. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** The Map outlines in the tier's ticks, each with the centre to draw its arrow at. */
export function mapView(tier: Tier, statics: Statics, melbourne: boolean): View {
  const items: Item[] = [...tier.paths].map(([id, d]) => {
    const box = pathBoxTicks(d)
    const c = pathCentre(d)
    return { id, geom: d, cx: c.x, cy: c.y, box }
  })
  const pad = 800
  if (melbourne) {
    // The metropolitan seats' box, so the small seats have room for their arrows.
    const metro = items.filter((it) => statics.districtById.get(it.id)?.region_name?.includes('Metropolitan'))
    if (metro.length > 0) {
      const x0 = Math.min(...metro.map((m) => m.box.x0))
      const y0 = Math.min(...metro.map((m) => m.box.y0))
      const x1 = Math.max(...metro.map((m) => m.box.x1))
      const y1 = Math.max(...metro.map((m) => m.box.y1))
      const p = 0.04 * (x1 - x0)
      return { vb: [x0 - p, y0 - p, x1 - x0 + 2 * p, y1 - y0 + 2 * p], items }
    }
  }
  return { vb: [-pad, -pad, tier.world.w / tier.tick + 2 * pad, tier.world.h / tier.tick + 2 * pad], items }
}

export function hexView(statics: Statics): View {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const items: Item[] = [...ringsById(statics.seatHexes)].map(([id, rings]) => {
    const pts = rings[0]!.map((p) => projectSvg(p))
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
    x0 = Math.min(x0, box.x0)
    y0 = Math.min(y0, box.y0)
    x1 = Math.max(x1, box.x1)
    y1 = Math.max(y1, box.y1)
    return { id, geom: pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '), cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2, box }
  })
  const pad = 3
  return { vb: [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad], items }
}
