import { createContext, useContext, useEffect, useState } from 'react'
import type { CandidateAttributes } from '@vic26/schema'

/**
 * VE-320: Victorian Socialists on "Where is each party strongest?". Our party buckets put them in Others, so the seat rows
 * cannot say; the candidates layer (schema layer 4) names each candidate's affiliation and first-preference share, so the
 * figure is built from that with no schema change. Matched on the feed's affiliation name, never a looser "socialist"
 * (Socialist Alliance also stands).
 */
export const VS_NAME = 'Victorian Socialists'

export const isVs = (c: Pick<CandidateAttributes, 'affiliation_name'>): boolean => c.affiliation_name?.trim().toLowerCase() === VS_NAME.toLowerCase()

/**
 * Each seat in the list: the Victorian Socialists share of first preferences (summed, should a seat ever have two), 0 where
 * the seat has candidates but none of theirs (did not stand), null where theirs has no figure yet. Seats with no candidate
 * rows are absent, so the lens cannot tell and waits.
 */
export function vsShares(cands: readonly Pick<CandidateAttributes, 'district_id' | 'affiliation_name' | 'fp_pct'>[]): Map<number, number | null> {
  const out = new Map<number, number | null>()
  for (const c of cands) {
    if (!out.has(c.district_id)) out.set(c.district_id, 0)
    if (!isVs(c)) continue
    const was = out.get(c.district_id)
    out.set(c.district_id, c.fp_pct === null || was === null ? null : (was ?? 0) + c.fp_pct)
  }
  return out
}

/** Every candidate at one snapshot, or null when the source cannot say (the live view holds only the newest snapshot). */
export type AllCandidates = (snapshotId: string) => Promise<CandidateAttributes[] | null>

/** What App hands the lens: the snapshot on show and how to read its candidates. Null outside a results source. */
export interface CandidatesFeed {
  snapshotId: string | null
  all: AllCandidates | null
}
export const CandidatesContext = createContext<CandidatesFeed>({ snapshotId: null, all: null })

/**
 * The Victorian Socialists shares for the snapshot on show, read only while `enabled` (the party is chosen), so the other
 * parties never pay for the candidates read. Null until read, or when the source cannot say for that snapshot.
 */
export function useVsShares(enabled: boolean): ReadonlyMap<number, number | null> | null {
  const { snapshotId, all } = useContext(CandidatesContext)
  const [got, setGot] = useState<{ id: string; shares: Map<number, number | null> | null } | null>(null)
  useEffect(() => {
    if (!enabled || !all || !snapshotId || got?.id === snapshotId) return
    let alive = true
    all(snapshotId).then(
      (list) => alive && setGot({ id: snapshotId, shares: list ? vsShares(list) : null }),
      () => undefined, // keep the last good read; the next tick tries again
    )
    return () => {
      alive = false
    }
  }, [enabled, all, snapshotId, got?.id])
  // Figures from another snapshot never stand in for the one on show.
  return enabled && got && got.id === snapshotId ? got.shares : null
}
