/**
 * VE-224: why a seat panel shows no swing, in one line, so "not comparable" never reads like "not counted yet" (which keeps
 * today's behaviour: no line). Pure, so the rules are tested without a browser.
 */
import type { DistrictStatic } from '@vic26/schema'
import { PARTY_NAMES } from '../parties'
import { belowSwingMin, pairInDoubt } from './colour'
import type { Seat } from './seats'

export const WRONG_PAIR_LINE = 'The count may be on the wrong two candidates.'

/** "New contest: Labor v One Nation (2022: Labor v Liberal). No like-for-like swing.", the pair-check line, or null. */
export function swingGapLine(s: Seat, st: DistrictStatic | undefined): string | null {
  if (belowSwingMin(s.pct) || !s.tcp || !s.tcp.b) return null
  if (pairInDoubt(s)) return WRONG_PAIR_LINE
  const a = st?.base_tcp_party_a ?? null
  const b = st?.base_tcp_party_b ?? null
  if (!a || !b) return null
  const now = new Set([s.tcp.a, s.tcp.b])
  if (now.has(a) && now.has(b)) return null
  return `New contest: ${PARTY_NAMES[s.tcp.a]} v ${PARTY_NAMES[s.tcp.b]} (${s.baseNote || '2022'}: ${PARTY_NAMES[a]} v ${PARTY_NAMES[b]}). No like-for-like swing.`
}
