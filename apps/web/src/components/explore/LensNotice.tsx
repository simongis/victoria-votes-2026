import { DECLARED_NOTICE, PROVISIONAL_NOTICE } from '../../footer'
import type { Seat } from '../../derive/seats'
import { allDeclared } from '../../views/encoding'

/**
 * VE-149 (ADR 0017): on a phone an open lens covers the page's own "i" with the lens's, and the band's "i" is hidden, so
 * the provisional notice and VEC attribution ride in every lens's "i" as well. App hides the covered "i" meanwhile
 * (app.css), so there is still exactly one. VE-226 (finding 12): once every seat is declared it says so, as the band's does.
 */
export function LensNotice({ seats }: { seats: ReadonlyMap<number, Seat> }) {
  return <p className="key__notice" data-testid="provisional">{allDeclared(seats.values()) ? DECLARED_NOTICE : PROVISIONAL_NOTICE}</p>
}
