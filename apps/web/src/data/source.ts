/**
 * The one place the app gets results from. Two implementations sit behind ResultsSource:
 *   replay - the ingest replay folder over HTTP (dev default), with a demo clock standing in for "now";
 *   agol   - the public read-only view vic26election_view (ADR 0004), queried anonymously by schema layer.
 * Views never know which one they have: they poll status() and fetch timeline() when it changes.
 */
import type { CandidateAttributes, StatusAttributes } from '@vic26/schema'
import type { BoothSource } from './boothSource'
import type { Statics, Timeline } from './types'

export type SourceKind = 'replay' | 'agol'
const KINDS: readonly SourceKind[] = ['replay', 'agol']

export interface ResultsSource {
  readonly kind: SourceKind
  /** Fixed poll interval for the replay source. The AGOL source follows data/pollPlan.ts instead. */
  readonly pollMs: number
  /** One line for the info sheet about where the data comes from, or null. */
  readonly note: string | null
  /** True while a configured latest.json pointer is failing or stale and the AGOL status row is standing in (ADR 0016). */
  fallback?(): boolean
  /** Polling place statics and booth history (VE-136), read lazily. Absent where the source has no booth data. */
  readonly booths?: BoothSource
  statics(): Promise<Statics>
  /**
   * The one-row status table (ADR 0009): kill-switch state, snapshot stamp, statewide summary.
   * Null means the table has no row yet (before ingest's first live publish): the expected before-results state, not a
   * failure. A failed read rejects instead.
   */
  status(): Promise<StatusAttributes | null>
  /** Every tick up to the current snapshot, with each tick's district rows. */
  timeline(): Promise<Timeline>
  /** Candidates for one district at one snapshot, or null when the source cannot say. */
  candidates(snapshotId: string, districtId: number): Promise<CandidateAttributes[] | null>
}

const asKind = (v: string | null | undefined): SourceKind | null =>
  v && (KINDS as readonly string[]).includes(v) ? (v as SourceKind) : null

/** `?source=` beats the VITE_RESULTS_SOURCE env var, which beats the default (replay in dev, AGOL in a build). */
export function chooseSourceKind({ search, env, dev }: { search: string; env: string | undefined; dev: boolean }): SourceKind {
  return asKind(new URLSearchParams(search).get('source')) ?? asKind(env?.trim()) ?? (dev ? 'replay' : 'agol')
}
