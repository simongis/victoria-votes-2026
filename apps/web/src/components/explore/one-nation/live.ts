import type { PartyBucket } from '@vic26/schema'
import type { LensParty } from '../../../derive/oneNation'
import { partyLabel } from '../../../derive/oneNation'
import { partySentence, type PartyRow } from '../../lenspanel/party'

/**
 * VE-270: "Where is each party strongest?" follows the live count. Until a seat has this much of its enrolment counted
 * the 2025 federal estimate stays (a first-preference share from the first few booths misleads: early booths skew by
 * place and by vote type). This is lower than the swing views' SWING_MIN_PCT (50), which compares against 2022 and needs
 * a near-complete seat; a plain share of first preferences only needs enough booths to be a fair sample. 5% of enrolment
 * is our own call (UNVERIFIED against 2022), kept in one place so it can be moved.
 */
export const LIVE_MIN_PCT = 5

const FEDERAL_MARKER = 'From the 2025 federal election, mapped to state seats'

/** The slice of a seat this needs: counted per cent of enrolment, and first preferences by party bucket. */
export interface LiveSeat {
  id: number
  pct: number | null
  fp: readonly { party: PartyBucket; pct: number }[]
}

export interface LiveRow extends PartyRow {
  /** True when the figure is tonight's count, false when it is the 2025 federal estimate or "no figures yet". */
  live: boolean
  /** VE-282: counting has started but this seat is below the gate. Drawn as "No figures yet", never as its 2025 estimate. */
  noFigures: boolean
}

/** The buckets a toggle choice adds up (the Coalition is Liberal plus National). */
export const BUCKETS: Record<LensParty, readonly PartyBucket[]> = {
  ALP: ['ALP'],
  COA: ['LIB', 'NAT'],
  LIB: ['LIB'],
  NAT: ['NAT'],
  GRN: ['GRN'],
  ONP: ['ONP'],
  IND: ['IND'],
  OTH: ['OTH'],
  // Victorian Socialists are inside Others, so no bucket adds up to them; their figure comes from the candidates (vs.ts).
  VS: [],
}

/**
 * Swap each seat's 2025 row for tonight's share once it is past the gate. The history carries only parties with votes,
 * so a party with none in a seat that is past the gate did not stand there (a candidate on the ballot would have votes
 * by 5% counted); it shows as "did not stand", never 0%.
 *
 * VE-282: until any seat has a count the 2025 federal rows stand as they are. From the first figures on only tonight's
 * count is drawn: a seat below the gate is "no figures yet" (no 2025 fill-in, so the two never read alike).
 */
export function liveRows(
  federal: readonly PartyRow[],
  seats: Iterable<LiveSeat>,
  party: LensParty,
  /** VE-320: Victorian Socialists shares by seat from the candidates (vsShares); null where the source cannot say. */
  vs: ReadonlyMap<number, number | null> | null = null,
): LiveRow[] {
  const byId = new Map<number, LiveSeat>()
  for (const s of seats) byId.set(s.id, s)
  const started = countingStarted(byId.values())
  const want = new Set(BUCKETS[party])
  return federal
    .map((r): LiveRow => {
      const s = byId.get(r.id)
      if (!s || s.pct === null || s.pct < LIVE_MIN_PCT || s.fp.length === 0) {
        return started ? { ...r, pct: 0, stood: 1, partial: false, notStanding: false, live: false, noFigures: true } : { ...r, live: false, noFigures: false }
      }
      // Victorian Socialists without a candidate figure for this seat wait, rather than read as did not stand.
      const vsPct = party === 'VS' ? vs?.get(r.id) : undefined
      if (party === 'VS' && (vsPct === undefined || vsPct === null)) return { ...r, pct: 0, stood: 1, partial: false, notStanding: false, live: false, noFigures: true }
      const pct = party === 'VS' ? (vsPct ?? 0) : s.fp.filter((f) => want.has(f.party)).reduce((n, f) => n + f.pct, 0)
      return { ...r, pct, stood: 1, partial: false, notStanding: pct <= 0, live: true, noFigures: false }
    })
    .sort((a, b) => Number(a.noFigures) - Number(b.noFigures) || b.pct - a.pct || a.name.localeCompare(b.name))
}

/** True once any seat has any figure (a counted share above zero, or first preferences). */
export function countingStarted(seats: Iterable<LiveSeat>): boolean {
  for (const s of seats) if ((s.pct ?? 0) > 0 || s.fp.length > 0) return true
  return false
}

const f1 = (n: number) => n.toFixed(1)

/** The seat's sentence: tonight's figure, "did not stand", or the 2025 federal wording the panel already uses. */
export function liveSentence(r: LiveRow, party: LensParty, final = false): string {
  if (r.noFigures) return `${r.name}: no figures yet (under ${LIVE_MIN_PCT}% counted).`
  if (!r.live) return partySentence(r, party)
  const label = partyLabel(party)
  return r.notStanding ? `${r.name}: ${label} did not stand here.` : `${r.name}: ${label} ${f1(r.pct)}% of first preferences in ${final ? 'the final' : "tonight's"} count.`
}

/** The line under the lens heading. Plain, and always says which figures are tonight's. */
export function liveMarker(live: number, total: number, started: boolean = live > 0, final = false): string {
  if (live <= 0) return started ? `Counting has started: no seat has ${LIVE_MIN_PCT}% counted yet` : FEDERAL_MARKER
  if (live >= total) return final ? 'Final count in every seat.' : "Tonight's count in every seat."
  return `Tonight's count in ${live} of ${total} ${total === 1 ? 'seat' : 'seats'}`
}
