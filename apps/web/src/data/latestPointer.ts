/**
 * The static `latest.json` pointer (ADR 0016, VE-55): snapshot id, snapshot time and kill-switch state, written by
 * the ingest Function after the AGOL status row (packages/ingest/func/src/run.ts). Only the fields it writes are read.
 */
import type { KillSwitchState } from '@vic26/schema'

export interface Pointer {
  snapshotId: string
  snapshotAt: number
  state: KillSwitchState
  /** Epoch ms the pointer was written. */
  writtenAt: number
}

const STATES: readonly string[] = ['live', 'paused', 'offline']

/** Ingest writes the pointer once per new snapshot (about every 5 minutes), so older than this means ingest is quiet or stuck. */
export const POINTER_STALE_MS = 20 * 60_000

export function parsePointer(raw: unknown): Pointer | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const writtenAt = typeof r.written_at === 'string' ? Date.parse(r.written_at) : Number.NaN
  if (
    typeof r.snapshot_id !== 'string' ||
    typeof r.snapshot_at !== 'number' ||
    typeof r.state !== 'string' ||
    !STATES.includes(r.state) ||
    Number.isNaN(writtenAt)
  )
    return null
  return { snapshotId: r.snapshot_id, snapshotAt: r.snapshot_at, state: r.state as KillSwitchState, writtenAt }
}

export const pointerIsStale = (p: Pointer, now: number): boolean => now - p.writtenAt > POINTER_STALE_MS
