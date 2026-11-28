/**
 * VE-293: the seat panel's words for a seat whose VEC two-candidate pair is in doubt. Two ways in, as on the Multiples
 * lens (VE-290, components/lenspanel/multi.ts pairOutsider, which this mirrors): a party outside the pair leads on first
 * preferences (at any count, since a made-up or early seat can start wrong from the first figure), or the app's own
 * pairInDoubt test (VE-224, past 50% counted). Pure, so the rule is tested without a browser.
 */
import type { PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../parties'
import { PAIR_DOUBT_PTS } from './colour'
import type { Seat } from './seats'

export interface PairDoubt {
  a: PartyBucket
  b: PartyBucket
  outsider: PartyBucket
  outsiderPct: number
  /** The outsider leads on first preferences (not just ahead of one of the pair). */
  leads: boolean
}

/** Null for a declared seat (the VEC has settled it), a withheld count, no pair, or a pair that passes both tests. */
export function pairDoubtNote(s: Seat): PairDoubt | null {
  if (s.state === 'won' || !s.tcp?.b || s.tcpWithheld) return null
  const { a, b } = s.tcp
  const fp = (s.fp ?? []).filter((f) => f.party !== 'OTH')
  const outside = fp.filter((f) => f.party !== a && f.party !== b).reduce<(typeof fp)[number] | null>((m, f) => (m === null || f.pct > m.pct ? f : m), null)
  if (!outside) return null
  const leads = outside.pct >= Math.max(...fp.map((f) => f.pct))
  // The pairInDoubt gap test without its 50% gate: a doubtful pair is worth a word at any count (the map colouring is unchanged).
  const share = (p: PartyBucket): number => fp.find((f) => f.party === p)?.pct ?? 0
  if (!leads && outside.pct - Math.min(share(a), share(b)) <= PAIR_DOUBT_PTS) return null
  return { a, b, outsider: outside.party, outsiderPct: outside.pct, leads }
}

export const isPairDoubt = (s: Seat): boolean => pairDoubtNote(s) !== null

/** The tail after the pair, shared by the plain-text and coloured forms. */
export const pairDoubtTail = (n: PairDoubt): string =>
  n.leads ? ` lead on first preferences (${n.outsiderPct.toFixed(1)}%); the final two may differ.` : ` are on ${n.outsiderPct.toFixed(1)}% of first preferences; the final two may differ.`

export const pairDoubtText = (n: PairDoubt): string =>
  `VEC counting ${PARTY_NAMES[n.a]} v ${PARTY_NAMES[n.b]}. ${PARTY_NAMES[n.outsider]}${pairDoubtTail(n)}`
