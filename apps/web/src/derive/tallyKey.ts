import type { PartyBucket } from '@vic26/schema'

/** The small-party bucket the tally key groups as "Others". One Nation is not in it (VE-131). */
export const OTHERS_KEY: PartyBucket[] = ['IND', 'OTH']

/**
 * What the tally key shows beyond Labor, Greens and the Coalition. One Nation always has its own chip: every 2026
 * Victorian poll since February has it well ahead of the Greens (docs/research/one-nation-polling-2026.md), so a key
 * without it would hide the party people expect to see, even at zero seats. Independents and the small parties join the
 * Others group only once they lead a seat.
 */
export function keyOthers(seatsOf: (q: PartyBucket) => number): { onp: true; others: PartyBucket[] } {
  return { onp: true, others: OTHERS_KEY.filter((q) => seatsOf(q) > 0) }
}
