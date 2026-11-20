import { useEffect, useState } from 'react'
import type { StatusAttributes } from '@vic26/schema'
import type { ResultsSource } from '../data/source'
import type { Statics, Timeline } from '../data/types'
import { startPolling } from '../data/pollLoop'
import { isStatusRow, shouldFetch, type HeldStamp } from '../derive/status'

export interface Results {
  statics: Statics | null
  status: StatusAttributes | null
  timeline: Timeline | null
  /** Last error from a poll; data on screen is kept (hold last good). */
  error: string | null
  /** A few words when polling is degraded (falling back to AGOL, or backing off), else null. Nothing shows at rest. */
  pollNote: string | null
}

/**
 * Checks status on the polite schedule of data/pollPlan.ts (VE-54) and fetches the timeline only when status says
 * there is something new (and the kill switch allows it). Everything on screen stays put through a failed poll.
 */
export function useResults(source: ResultsSource, opts: { publicBuild?: boolean } = {}): Results {
  const publicBuild = opts.publicBuild === true
  const [statics, setStatics] = useState<Statics | null>(null)
  const [status, setStatus] = useState<StatusAttributes | null>(null)
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollNote, setPollNote] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    source.statics().then(
      (s) => alive && setStatics(s),
      (e: unknown) => alive && setError(`Could not load the district shapes: ${String(e)}`),
    )
    return () => {
      alive = false
    }
  }, [source])

  useEffect(() => {
    let alive = true
    let held: HeldStamp | null = null
    // startPolling runs one check at a time, so there is no in-flight guard here.
    const check = async () => {
      const s = await source.status()
      // A malformed row is a failed read: everything on screen stays as it was (hold last good).
      if (!isStatusRow(s)) throw new Error('The status row is not readable')
      if (!alive) return { snapshotAt: null, state: null }
      setStatus(s)
      // A public build never fetches the figures behind a row that is not live data (hard rule 2).
      if (!(publicBuild && s.data_mode !== 'live') && shouldFetch(held, s)) {
        const t = await source.timeline()
        if (!alive) return { snapshotAt: s.snapshot_at, state: s.state }
        held = { snapshot_id: s.snapshot_id, ingested_at: s.ingested_at }
        setTimeline(t)
      }
      setError(null)
      return { snapshotAt: s.snapshot_at, state: s.state }
    }
    const stop = startPolling({
      // The replay source runs on a demo clock, so it keeps its own fixed interval.
      fixedMs: source.kind === 'replay' ? source.pollMs : undefined,
      check: () =>
        check().catch((e: unknown) => {
          if (alive) setError(String(e))
          throw e
        }),
      onCycle: (errors) => {
        if (!alive) return
        setPollNote(errors > 0 ? 'Retrying shortly' : source.fallback?.() ? 'Using the backup status check' : null)
      },
    })
    return () => {
      alive = false
      stop()
    }
  }, [source, publicBuild])

  return { statics, status, timeline, error, pollNote }
}
