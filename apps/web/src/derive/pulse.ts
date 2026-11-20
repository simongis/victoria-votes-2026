/**
 * The count pulse (S6, VE-64a): a tiny line per seat of how its two-candidate-preferred margin moved over the night.
 * Pure, and built from the Seats already derived for every tick, so no extra history is read.
 */
import type { Seat } from './seats'

/**
 * The seat's 2CP margin in points from its 2022 holder's side: positive while the holder is ahead, negative once
 * they trail, so a line crossing zero is a seat changing hands. With no holder (or when the pairing has changed so
 * the holder is not in it) there is nothing to compare against: no holder falls back to the leader's own margin,
 * a changed pairing is null (it would draw a misleading line). Null with no 2CP figure yet.
 */
export function pulseValue(s: Seat): number | null {
  if (!s.tcp) return null
  const { a, b, pctA } = s.tcp
  const leaderMargin = 2 * pctA - 100
  if (s.base === null) return leaderMargin
  if (a === s.base) return leaderMargin
  if (b === s.base) return -leaderMargin
  return null
}

/** One value per tick for every seat seen, null where the seat had no figure; every series is as long as the night. */
export function pulseSeries(seatsAt: readonly ReadonlyMap<number, Seat>[]): Map<number, (number | null)[]> {
  const out = new Map<number, (number | null)[]>()
  seatsAt.forEach((seats, t) => {
    for (const s of seats.values()) {
      let line = out.get(s.id)
      if (!line) {
        line = Array<number | null>(seatsAt.length).fill(null)
        out.set(s.id, line)
      }
      line[t] = pulseValue(s)
    }
  })
  return out
}

const r2 = (n: number): number => Math.round(n * 100) / 100

/**
 * SVG path data for a series: tick i at x = i / (total - 1) of the width (so the line grows rightwards as the night
 * goes on), zero margin on the middle of the height, `range` points reaching the top or bottom edge. Missing
 * ticks break the line; a lone point is a zero-length stroke, which a round cap draws as a dot.
 */
export function sparkPath(series: readonly (number | null)[], total: number, w: number, h: number, range: number): string {
  const x = (i: number) => r2(total > 1 ? (i / (total - 1)) * w : 0)
  const y = (v: number) => r2(h / 2 - (Math.max(-range, Math.min(range, v)) / range) * (h / 2))
  const runs: string[][] = []
  let open = false
  series.forEach((v, i) => {
    if (v === null) {
      open = false
      return
    }
    const p = `${x(i)} ${y(v)}`
    if (open) runs[runs.length - 1]!.push(p)
    else runs.push([p])
    open = true
  })
  // A lone point repeats itself so the stroke has a (zero) length and draws.
  return runs.map((r) => `M${r[0]}${(r.length === 1 ? [r[0]!, r[0]!] : r).slice(1).map((p) => `L${p}`).join('')}`).join('')
}
