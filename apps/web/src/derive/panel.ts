/** Small pure labels for the district panel (VE-90). */
import type { DistrictStatic, PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../parties'

/** Informal votes as a percentage of all votes cast; null when either figure is missing. */
export function informalShare(informal: number | null, total: number | null): number | null {
  if (informal === null || total === null || total <= 0) return null
  return (100 * informal) / total
}

export function fpDisclosureLabel(n: number): string {
  if (n <= 0) return 'First preferences'
  return `First preferences, ${n} ${n === 1 ? 'candidate' : 'candidates'}`
}

/**
 * Labor's two-candidate swing as a plain line. The caller passes the figure from `swingShown`, so a seat under the
 * counted threshold, or with a changed pairing, arrives as null and gets no line (VE-98).
 */
export function swingLine(labor: number | null, since: string): string | null {
  if (labor === null) return null
  const r = Math.round(Math.abs(labor) * 10) / 10
  if (r === 0) return `No swing since ${since}`
  return `${r.toFixed(1)}% swing ${labor > 0 ? 'to' : 'from'} Labor since ${since}`
}

/** A vote count rounded so it does not claim more than an estimate knows: nearest 100 under 10,000, nearest 1,000 above. */
export function votesRounded(n: number): number {
  const step = n >= 10_000 ? 1_000 : 100
  return Math.round(n / step) * step
}

/** The 2022 holder as the short line beside the status (FB-145); it replaces the footer sentence. */
export function heldLine(holder: string | null, note: string): string {
  return holder ? `Held by ${holder} (${note})` : 'New seat'
}

/** What above and below the night line's dashed middle mean, in the holder's name. */
export function nightSides(holder: string | null): { above: string; below: string } {
  const who = holder ?? 'Holder'
  return { above: `${who} ahead`, below: `${who} behind` }
}

/**
 * VE-226 (finding 13): a line for a seat the 2022 replay has no figures for. Narracan's 2022 contest was postponed after a
 * candidate died and was held as a supplementary election in January 2023. Replay only: on the night all 88 seats count.
 */
export function replayNote(dataLabel: string | null, baseSource: DistrictStatic['base_source'] | undefined): string | null {
  if (dataLabel !== 'Replay' || baseSource !== 'NARRACAN_SUPP_2023') return null
  return 'Postponed in 2022: Narracan voted at a supplementary election in January 2023, so this replay has no figures for it.'
}

/**
 * VE-254 (F3): when the source has no candidate rows the panel shows one bar per party bucket. Independents and Other
 * parties are many candidates added together, while the seat's leader is the single candidate with the most votes (ingest
 * derive.ts fpTally), so "Greens leading" beside "Other 41.7%" and "Greens 8.6%" looked wrong. These name the groups.
 */
const GROUPED: Partial<Record<PartyBucket, string>> = { IND: 'Independents', OTH: 'Other parties' }

export function bucketRowNames(p: PartyBucket): { name: string; partyText: string | null } {
  const group = GROUPED[p]
  return group ? { name: group, partyText: 'all candidates added together' } : { name: PARTY_NAMES[p], partyText: null }
}

/** One line saying why the leader is not the biggest bar; null when the leader tops the rows or there is none. */
export function bucketLeadNote(leader: PartyBucket | null, rows: readonly { party: PartyBucket }[]): string | null {
  if (!leader) return null
  const at = rows.findIndex((r) => r.party === leader)
  if (at <= 0) return null
  const groups = rows.slice(0, at).map((r) => GROUPED[r.party]).filter((g): g is string => !!g)
  if (groups.length === 0) return null
  const who = groups.join(' and ')
  return `The ${PARTY_NAMES[leader]} candidate has the most votes of any single candidate. ${who} ${groups.length > 1 ? 'each add' : 'add'} their candidates together.`
}
