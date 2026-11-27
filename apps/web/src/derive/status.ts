import { DATA_MODES, KILL_SWITCH_STATES, type StatusAttributes } from '@vic26/schema'

/**
 * How the shell honours the status table (ADR 0009). `live` shows results; `paused` freezes the last good
 * data with a banner; `offline` shows a holding page. Anything else is treated as paused, never as live.
 */
export type ScreenMode = 'waiting' | 'results' | 'held' | 'offline'

export interface StatusView {
  mode: ScreenMode
  /** Operator message, or our default wording for the state. Null when live with no message. */
  banner: string | null
  /** Short marker for anything that is not live data (hard rule 2). Null only for live data. */
  dataLabel: 'Replay' | 'Trial' | 'Not live' | null
  /** A public build never shows the figures of a row that is not live data (hard rule 2); the holding page shows instead. */
  hideFigures?: boolean
}

/** The words that mark replay, trial or other not-live data on a lens body or the polling places (hard rule 2). */
export function notLiveMarker(label: NonNullable<StatusView['dataLabel']>): string {
  return label === 'Replay' ? 'Replay of the 2022 count, not live results' : label === 'Trial' ? 'Trial data, not live results' : 'Not live results'
}

const PAUSED_TEXT = 'Updates paused. Showing the last confirmed figures.'
const OFFLINE_TEXT = 'Results are offline for now. Please check back soon.'

export interface StatusViewOptions {
  /** The public (production) build: it shows live data only, so a trial or replay row is held as "Not live results". */
  publicBuild?: boolean
}

export function statusView(status: StatusAttributes | null, sourceKind?: 'replay' | 'agol', opts: StatusViewOptions = {}): StatusView {
  // Hard rule 2: a replay source is always labelled Replay, whatever the status row claims (or before it arrives).
  const fromSource = sourceKind === 'replay' ? 'Replay' : null
  if (!status) return { mode: 'waiting', banner: null, dataLabel: fromSource }
  const fromStatus =
    status.data_mode === 'live' ? null : status.data_mode === 'replay' ? 'Replay' : status.data_mode === 'trial' ? 'Trial' : 'Not live'
  const dataLabel = fromSource ?? fromStatus
  const message = status.message?.trim() || null
  if (status.state === 'offline') return { mode: 'offline', banner: message ?? OFFLINE_TEXT, dataLabel }
  // ADR 0030: the public site reads the live view, but a row that says otherwise is still never shown as results.
  if (opts.publicBuild && status.data_mode !== 'live') return { mode: 'held', banner: 'Not live results', dataLabel: 'Not live', hideFigures: true }
  return status.state === 'live' ? { mode: 'results', banner: message, dataLabel } : { mode: 'held', banner: message ?? PAUSED_TEXT, dataLabel }
}

/** Past this age a live row's ingested_at is worth a word on screen: the feed polls every few minutes. */
export const STALE_AFTER_MS = 15 * 60_000

/**
 * The line for a live status row whose results may have stopped arriving, or null. `now` is the clock the app already
 * uses (the wall clock, or the tick itself for replay and the made-up nights), so those never read as stale unless
 * their own row is genuinely old against it. `fmt` turns ingested_at into a clock time.
 */
export function staleLine(status: StatusAttributes | null, now: number, fmt: (ms: number) => string): string | null {
  if (!status || status.state !== 'live') return null
  // VE-265: a live row before the first snapshot (seeded ahead of election night) has nothing that could be behind.
  if (status.snapshot_id === null || status.snapshot_id === undefined) return null
  const at = status.ingested_at
  if (at === null || at === undefined) return 'Results may be behind.'
  return now - at > STALE_AFTER_MS ? `Last updated ${fmt(at)}. Results may be behind.` : null
}

const SEAT_FIELDS = ['seats_ALP', 'seats_LIB', 'seats_NAT', 'seats_GRN', 'seats_ONP', 'seats_IND', 'seats_OTH', 'seats_declared', 'seats_in_doubt'] as const

const inRange = (v: unknown, max: number): boolean => v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max)

/**
 * A status row is read from the network, so check it before anything trusts it. A row that fails is an unreadable
 * read: the caller holds the last good one. Nullable fields may be null (before the first snapshot).
 */
export function isStatusRow(x: unknown): x is StatusAttributes {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  if (!(KILL_SWITCH_STATES as readonly unknown[]).includes(r.state)) return false
  if (!(DATA_MODES as readonly unknown[]).includes(r.data_mode)) return false
  if (!inRange(r.votes_counted_pct, 100)) return false
  for (const k of SEAT_FIELDS) if (!inRange(r[k], 88)) return false
  const t = r.snapshot_at
  return t === null || t === undefined || (typeof t === 'number' && Number.isFinite(t))
}

/** The stamp of the data on screen. */
export interface HeldStamp {
  snapshot_id: string | null
  ingested_at: number | null
}

/**
 * Whether a poll of `status` should fetch new results. Compared against what is on screen rather than the
 * previous status row, so coming back from a pause catches up. A pause with nothing on screen yet fetches once
 * (UNVERIFIED that this matches Simon's intent: the alternative is a blank page until he un-pauses).
 */
export function shouldFetch(held: HeldStamp | null, next: StatusAttributes): boolean {
  if (next.state === 'offline') return false
  if (held === null) return true
  if (next.state !== 'live') return false
  return held.snapshot_id !== next.snapshot_id || held.ingested_at !== next.ingested_at
}
