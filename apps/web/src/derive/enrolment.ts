/**
 * VE-247: enrolment for the figures that need it, without the static `enrolment` on the districts layer. That field holds
 * the 2022 baseline and is stale in every district for 2026 (docs/research/pct-counted-check-2026-11-25.md). Ingest's
 * `pct_counted` is correct (votes over the 2026 results-file enrolment), so a seat's real enrolment is recovered from its own
 * history row: fp_total / (pct_counted / 100). The replay source is the one place the static field is right (2022 data).
 */
import type { DistrictHistoryRow, DistrictStatic } from '@vic26/schema'

/** One row's enrolment, or null where it cannot be worked out (nothing counted, or a missing figure). */
export function enrolmentOf(r: Pick<DistrictHistoryRow, 'fp_total' | 'pct_counted'>): number | null {
  const votes = r.fp_total
  const pct = r.pct_counted
  if (votes === null || votes === undefined || pct === null || pct === undefined || !(pct > 0) || !(votes > 0)) return null
  return Math.round(votes / (pct / 100))
}

/**
 * Enrolment per district from every history row: the row with the most counted gives it (the percent is rounded to two
 * places, so a fuller count carries the least error). A seat that has not reported yet takes its static figure scaled by how
 * far the reported seats' derived total sits from their static total, so the statewide sum is not short by whole seats; a seat
 * with nothing to go on is left out (callers show a dash, never a wrong number).
 */
export function enrolmentByDistrict(rows: readonly Pick<DistrictHistoryRow, 'district_id' | 'fp_total' | 'pct_counted'>[], statics: Iterable<DistrictStatic>): Map<number, number> {
  const best = new Map<number, { pct: number; enrolment: number }>()
  for (const r of rows) {
    const e = enrolmentOf(r)
    if (e === null) continue
    const cur = best.get(r.district_id)
    if (!cur || r.pct_counted! > cur.pct) best.set(r.district_id, { pct: r.pct_counted!, enrolment: e })
  }
  const out = new Map<number, number>([...best].map(([id, b]) => [id, b.enrolment]))
  let derived = 0
  let basis = 0
  const all = [...statics]
  for (const s of all) {
    const e = out.get(s.district_id)
    if (e !== undefined && s.enrolment) {
      derived += e
      basis += s.enrolment
    }
  }
  if (basis > 0) {
    const scale = derived / basis
    for (const s of all) if (!out.has(s.district_id) && s.enrolment) out.set(s.district_id, Math.round(s.enrolment * scale))
  }
  return out
}

/** Replay: 2022 results on 2022 enrolment, so the static figure is right as it stands. */
export function staticEnrolment(statics: Iterable<DistrictStatic>): Map<number, number> {
  const out = new Map<number, number>()
  for (const s of statics) if (s.enrolment) out.set(s.district_id, s.enrolment)
  return out
}

/** Statewide votes counted as a share of the summed enrolment, as ingest's votes_counted_pct; 0 with no enrolment. */
export function statewidePct(rows: readonly Pick<DistrictHistoryRow, 'fp_total'>[], enrolment: ReadonlyMap<number, number>): number {
  let total = 0
  for (const e of enrolment.values()) total += e
  return total > 0 ? (100 * rows.reduce((a, r) => a + (r.fp_total ?? 0), 0)) / total : 0
}
