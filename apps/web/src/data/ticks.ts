import { SNAPSHOT_ID_PATTERN } from '@vic26/schema'

type TickLike = { snapshotId: string; snapshotAt: number }

/** Index of the latest tick at or before `ms`, or -1 when the clock is before the first tick. Ticks are in time order. */
export function tickIndexAt(ticks: readonly TickLike[], ms: number): number {
  let lo = 0
  let hi = ticks.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (ticks[mid]!.snapshotAt <= ms) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/**
 * The replay's `?now=` override, as epoch ms. Accepts a snapshot id (snapshot ids are Melbourne local time, so
 * they are matched against the ticks rather than parsed), "latest", a tick index, or an ISO time.
 */
export function resolveNowParam(ticks: readonly TickLike[], param: string | null): number | null {
  if (!param || ticks.length === 0) return null
  const last = ticks[ticks.length - 1]!
  if (param === 'latest') return last.snapshotAt
  if (SNAPSHOT_ID_PATTERN.test(param)) return (ticks.find((t) => t.snapshotId >= param) ?? last).snapshotAt
  if (/^\d{1,5}$/.test(param)) return ticks[Math.min(ticks.length - 1, Number(param))]!.snapshotAt
  const iso = Date.parse(param)
  return Number.isNaN(iso) ? null : iso
}

export interface DemoClockOptions {
  /** Demo time when the clock starts. */
  startMs: number
  /** Real time (performance.now or Date.now) when the clock starts. */
  realStart: number
  /** Real ms per feed interval in the demo. */
  cadenceMs: number
  /** Feed interval being simulated (VEC: 5 minutes). */
  feedMs: number
}

/** A replay clock that runs feedMs / cadenceMs times faster than real time, so a demo sees a new tick every cadence. */
export function demoClock({ startMs, realStart, cadenceMs, feedMs }: DemoClockOptions): (realNow: number) => number {
  const scale = feedMs / cadenceMs
  return (realNow) => startMs + (realNow - realStart) * scale
}
