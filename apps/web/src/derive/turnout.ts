/**
 * VE-165 (UX review 8 Nov, finding 3): the share of enrolment counted never reaches 100%, so at Final "87% counted"
 * reads as 13% missing. At Final the same figure is called turnout. One place decides "is Final", so the band, the seat
 * panel and the Counted lens cannot disagree; it follows the seats shown, so Rewind before Final brings "counted" back.
 */
import { allDeclared } from '../views/encoding'
import type { Seat } from './seats'

export const isFinal = (seats: Iterable<Seat | undefined>): boolean => allDeclared(seats)

/** The word after the percentage. */
export const countedWord = (final: boolean): 'turnout' | 'counted' => (final ? 'turnout' : 'counted')

/** The Counted lens's heading at Final; its ramp is unchanged. */
export const COUNTED_LENS_FINAL_TITLE = 'Where was turnout highest?'

/** VE-227 (finding 14): the share counted as text. Above 0 but under half a percent it says "Under 1%", not "0%". */
export const countedShare = (pct: number): string => {
  const r = Math.round(pct)
  return r === 0 && pct > 0 ? 'Under 1%' : `${r}%`
}
