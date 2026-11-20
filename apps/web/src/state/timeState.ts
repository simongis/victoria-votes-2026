/**
 * The one derived time state shared by the top band's pill, the Rewind control and the chrome tint (ADR 0024).
 * The feed has no "count finished" field, so it is derived here with no schema change.
 */
export type TimeState = 'live' | 'paused' | 'final' | 'rewinding'
/** What "Back to now" returns to: the state with the viewer at the latest tick. */
export type BaseState = Exclude<TimeState, 'rewinding'>

/** No new snapshot for this long during the night means counting has paused (the VEC feed refreshes about every 5 minutes). */
export const PAUSE_AFTER_MS = 45 * 60_000

export interface TimeInput {
  /** When the latest snapshot was made (ms), or null before any results. */
  latestAt: number | null
  /** The clock to measure its age against: see clockFor. */
  now: number
  /** Seats declared (won) in the latest snapshot, and the seats in the election. */
  declared: number
  total: number
  /** The viewer is behind the latest tick. */
  viewing: boolean
  /** The operator has held updates (status table), whatever the snapshot's age. */
  held?: boolean
}

/**
 * Rewinding beats everything (it is about where the viewer is, not the count). Otherwise Final (every seat declared)
 * beats Paused (the operator held updates, or no new snapshot for 45 minutes), and anything else is Live. A clock slightly behind the snapshot
 * (skew) reads as live, never as a negative age.
 */
export function timeState(i: TimeInput): { state: TimeState; base: BaseState } {
  const base: BaseState =
    i.latestAt === null ? 'live' : i.declared >= i.total && i.total > 0 ? 'final' : i.held || i.now - i.latestAt >= PAUSE_AFTER_MS ? 'paused' : 'live'
  return { state: i.viewing ? 'rewinding' : base, base }
}

/**
 * Which clock the age of the latest snapshot is measured against. The real feed uses the wall clock. Replay and trial
 * data carry old timestamps and have their own clock (the demo clock holds the head tick by construction), so their
 * "now" is the latest tick itself: they are never Paused, however long ago the real night was. (UNVERIFIED: this
 * assumes the replay and trial sources release ticks on their own schedule, as the dev replay does.)
 */
export function clockFor(i: { labelled: boolean; latestAt: number | null; wall: number }): number {
  return i.labelled && i.latestAt !== null ? i.latestAt : i.wall
}

/**
 * The pill's words before the time: the desktop form and the phone form (CSS shows one). Replay and trial data are never
 * called Live (hard rule 2: the badge beside the title names what they are), so they get the bare time (VE-165: no "Updated").
 */
export function pillWords(state: TimeState, labelled: boolean): { long: string; short: string } {
  switch (state) {
    case 'live':
      return labelled ? { long: '', short: '' } : { long: 'Live · ', short: 'Live · ' }
    case 'rewinding':
      return { long: 'Rewinding · ', short: 'Rewinding · ' }
    case 'final':
      return { long: 'Final · count complete ', short: 'Final · ' }
    case 'paused':
      return { long: 'Counting paused · last update ', short: 'Paused · ' }
  }
}
