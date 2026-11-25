import type { DistrictHistoryRow, PartyBucket } from '@vic26/schema'

/**
 * ADR 0036: the live view's history layer cannot carry `elected_party`, but the `districts` layer does. For the current
 * tick, a declared seat takes the districts layer's winner first, then whatever the history row already holds. Past ticks
 * are not passed in: the layer only knows the present.
 */
export function withDistrictWinners(
  rows: readonly DistrictHistoryRow[],
  districts: readonly { district_id: number; elected_party: PartyBucket | null }[],
): DistrictHistoryRow[] {
  const winner = new Map(districts.filter((d) => d.elected_party).map((d) => [d.district_id, d.elected_party as PartyBucket] as const))
  return rows.map((r) => {
    const p = r.status === 'declared' ? winner.get(r.district_id) : undefined
    return p ? { ...r, elected_party: p } : r
  })
}
