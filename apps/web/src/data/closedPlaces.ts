import { normaliseName } from '../derive/jointCentres'

/**
 * Polling places the VEC has closed on the day (VE-306). A closed place stays in the results feed with zero figures all
 * night, so without this it would sit as "not counted yet" for ever. Each entry is data: the panel, the dot and the
 * hover label all read it, and none of them treats a closed place as an error.
 *
 * Source: VEC email to Simon, 28 Nov 2026 (about 5 pm): "The Keysborough Gardens voting centre in Mordialloc District
 * will be officially closed for voting today due to water damage from flooding. Electors are being redirected to nearby
 * Chapel voting centre at Sirius College ... Results for electors redirected will be reported against the Chapel voting centre."
 *
 * To add another: copy an entry, set `districtId` (booths.geojson district_id) and `name` as the booth layer spells it
 * (matching ignores case and punctuation), then `reason` and where the votes are counted instead. `redirect.name` is
 * looked up in the same district to make the button; if it is not found the panel shows plain text.
 */
export interface ClosedPlace {
  districtId: number
  name: string
  /** 'all-day': closed for the day with zero results (the 'closed' panel state). 'early': closed in the afternoon and results still come in (VE-310), so the panel keeps its numbers and adds a note. */
  when: 'all-day' | 'early'
  /** Plain words, lower case: "Closed today (flooding)". */
  reason: string
  /** `name` is the booth layer's spelling, for the lookup; `label` is what the panel says ("Chapel (Sirius College)"). */
  redirect: { name: string; label: string }
}

export const CLOSED_PLACES: readonly ClosedPlace[] = [
  // Booth 19553 in Mordialloc (district 15919); Chapel is booth 18556 in the same district.
  { districtId: 15919, name: 'Keysborough Gardens', when: 'all-day', reason: 'flooding', redirect: { name: 'Chapel', label: 'Chapel (Sirius College)' } },
  // VE-310: Wodonga (booth 19334) in Benambra (district 15932) closed early on 28 Nov for poor weather; Victory (booth 19176,
  // Victory Lutheran College) is in the same district. VEC email, about 5:50 pm: results are still entered for Wodonga, but the count is smaller than expected.
  { districtId: 15932, name: 'Wodonga', when: 'early', reason: 'poor weather', redirect: { name: 'Victory', label: 'Victory (Victory Lutheran College)' } },
]

/** The closure for a place, matched on its district and normalised name, or null when it is open. */
export function closedFor(districtId: number, name: string, list: readonly ClosedPlace[] = CLOSED_PLACES): ClosedPlace | null {
  const n = normaliseName(name)
  return list.find((c) => c.districtId === districtId && normaliseName(c.name) === n) ?? null
}

/** VE-310: the note above an early-closed place's results. */
export const closedEarlyWords = (c: Pick<ClosedPlace, 'reason' | 'redirect'>): string => `Closed early this afternoon (${c.reason}), so the count here is smaller. Voters were sent to ${c.redirect.label}.`

/** The panel's line as plain text (the panel makes the redirect label a button when it can open that place). */
export const closedWords = (c: Pick<ClosedPlace, 'reason' | 'redirect'>): string => `Closed today (${c.reason}). Votes are counted at ${c.redirect.label}.`
