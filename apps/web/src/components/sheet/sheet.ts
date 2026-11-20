/**
 * The phone bottom sheet's maths (ADR 0035, VE-228): which heights a sheet has, where the finger puts it, and where it comes
 * to rest when let go. Pure, so it is tested without a browser; useSheet.ts does the DOM. Heights are pixels from the bottom
 * of the sheet's room (taller is higher), and speeds are px per ms with up positive.
 */

/** Closed is a stop only where a sheet had one before (Seats like yours); the seat and booth panels close instead. */
export type Detent = 'closed' | 'peek' | 'half' | 'full'

export interface Stop {
  name: Detent
  h: number
}

/** A release at this speed or more goes on to the next height in its direction (ADR 0035: about 0.5 px/ms). */
export const FLICK_PX_MS = 0.5
/** Dragged this far below peek, a panel that can close does (the same as its X). */
export const CLOSE_PX = 80
/** A fast flick down from peek closes only once it has moved this far, so a twitch on the handle never shuts the panel. */
export const FLICK_CLOSE_PX = 24
/** The share of the room the seat and polling place panels take at half (MapPane frames a tapped seat above it, ADR 0032). */
export const PANEL_HALF = 0.55
/** The Seats list and the lens sheets at half (as tall as the open list was before VE-228). */
export const LIST_HALF = 0.6
/** The row of floating controls over the stage on a phone (View and the "i"): 8 px from the top and 44 px tall. */
export const FLOAT_ROW_PX = 52
/** Content within this much of half fits there: it gets no full height, as the extra pixels just scroll. */
const FIT_SLACK = 8
/** Past either end the sheet gives this share of the finger's movement, so it feels held rather than stuck. */
const GIVE = 0.35
/** Speed is read over the last stretch of the drag, so a pause before letting go reads as slow. */
const VELOCITY_MS = 100

export interface StopsInput {
  /** The height of the sheet's room: the workspace under the band, or the lens body. Full never goes past it. */
  room: number
  /** The handle and headline. */
  peek: number
  /** Half as a share of the room. */
  share: number
  /** Whether the sheet may have a full height at all (lens sheets in the Seats list do not: Back and the "i" stay in view). */
  full: boolean
  /** The content's own height, for sheets that fit their content: short content stops at its height and has no full. */
  natural?: number | null
  /** A closed height below peek (just the handle), where the sheet has one. */
  closed?: number | null
  /**
   * Room left above full. On the main stage it is the row of floating controls (View and the "i"), so at full the band (title,
   * Replay badge, tally) and those two stay in view rather than lying over the sheet's title.
   */
  gap?: number
}

/** The heights a sheet has, lowest first. */
export function sheetStops({ room, peek, share, full, natural = null, closed = null, gap = 0 }: StopsInput): Stop[] {
  const p = Math.round(peek)
  const share0 = Math.round(room * share)
  const fits = natural !== null && natural <= share0 + FIT_SLACK
  const half = Math.max(p, Math.round(fits ? natural : share0))
  const stops: Stop[] = []
  if (closed !== null) stops.push({ name: 'closed', h: Math.round(Math.min(closed, p)) })
  stops.push({ name: 'peek', h: p }, { name: 'half', h: half })
  if (full && !fits) stops.push({ name: 'full', h: Math.round(Math.max(half, Math.min(room - gap, natural ?? room))) })
  return stops
}

/**
 * Where a released sheet comes to rest. A slow release goes to the nearest height; a fast flick to the next height in its
 * direction. `closeBelow` is the height under which a panel closes (null for sheets that stop at their lowest height).
 */
export function settle(h: number, v: number, stops: readonly Stop[], closeBelow: number | null): Detent | 'close' {
  const low = stops[0]!
  const high = stops[stops.length - 1]!
  if (closeBelow !== null && h <= closeBelow) return 'close'
  if (v >= FLICK_PX_MS) return (stops.find((s) => s.h > h + 1) ?? high).name
  if (v <= -FLICK_PX_MS) {
    const below = [...stops].reverse().find((s) => s.h < h - 1)
    if (below) return below.name
    return closeBelow !== null && h <= low.h - FLICK_CLOSE_PX ? 'close' : low.name
  }
  let best = low
  for (const s of stops) if (Math.abs(s.h - h) < Math.abs(best.h - h)) best = s
  return best.name
}

/**
 * The handle's tap: up through the heights to the top, then back down to the bottom, and so on (peek, half, full, half, peek).
 * `dir` is the way the last step went. A closed sheet, or one at a height it no longer has, goes to the nearest end.
 */
export function tapNext(order: readonly Detent[], current: Detent, dir: 1 | -1): { to: Detent; dir: 1 | -1 } {
  const i = order.indexOf(current)
  if (i < 0) return current === 'closed' || order.length < 2 ? { to: order[0]!, dir: 1 } : { to: order[order.length - 1]!, dir: -1 }
  let d = dir
  if (i + d < 0 || i + d >= order.length) d = d === 1 ? -1 : 1
  const to = order[i + d]
  return to ? { to, dir: d } : { to: current, dir: d }
}

/**
 * The sheet under the finger: its height follows the finger between the lowest and highest stops. Below the lowest a panel
 * that can close slides down whole (`drop`, a transform, so its content does not reflow); past either end otherwise it gives a little.
 */
export function dragPlace(h: number, stops: readonly Stop[], canDrop: boolean): { px: number; drop: number } {
  const low = stops[0]!.h
  const high = stops[stops.length - 1]!.h
  if (h > high) return { px: Math.round(high + (h - high) * GIVE), drop: 0 }
  if (h < low) return { px: low, drop: Math.round(canDrop ? low - h : (low - h) * GIVE) }
  return { px: Math.round(h), drop: 0 }
}

const RANK: Record<Detent, number> = { closed: 0, peek: 1, half: 2, full: 3 }

/** Whether the handle's next tap makes the sheet taller, for its label ("Show more" or "Show less"). */
export function sheetGrows(s: { detent: Detent; next: Detent }): boolean {
  return RANK[s.next] > RANK[s.detent]
}

export interface Sample {
  t: number
  h: number
}

/** The finger's speed over the last VELOCITY_MS of the drag, up positive. */
export function velocity(samples: readonly Sample[]): number {
  const last = samples[samples.length - 1]
  if (!last) return 0
  const first = samples.find((s) => s.t >= last.t - VELOCITY_MS)!
  const dt = last.t - first.t
  return dt > 0 ? (last.h - first.h) / dt : 0
}
