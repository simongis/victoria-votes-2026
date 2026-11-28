import type { PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../../parties'
import { usePalette } from '../../theme/theme'
import { partyCss } from '../../views/encoding'

/** Short names, as the Leader key uses on a phone: the key has to fit beside the "More ways to see it" peek on a desktop. */
const SHORT: Partial<Record<PartyBucket, string>> = { LIB: 'Lib', NAT: 'Nats', IND: 'Ind' }

/** Parties shown in the key when the caller does not say which lead a booth. */
const DEFAULT_PARTIES: readonly PartyBucket[] = ['ALP', 'LIB', 'NAT', 'GRN', 'IND']

/**
 * The key line under the chips while Polling places is on: a dot per party that leads at least one booth, then size and
 * faint in a few words. The party swatches drop out on a phone (leader.css), where the tally above is that key.
 */
export function PlacesKey({ parties, final = false }: { parties?: readonly PartyBucket[]; /** Every seat is declared (VE-167): no dot is waiting, so "Faint" has nothing to say. */ final?: boolean }) {
  const pal = usePalette()
  const order = Object.keys(PARTY_NAMES) as PartyBucket[]
  const list = parties && parties.length > 0 ? order.filter((p) => parties.includes(p)) : DEFAULT_PARTIES
  return (
    <>
      {/* VE-221 (B11): the dot's colour is the first-preference leader, which can differ from the panel's top two after preferences. */}
      <span className="lkey__item lkey__colour" data-testid="places-colour-key">Colour: most number 1 votes</span>
      {list.map((p) => (
        <span key={p} className="lkey__item lkey__party">
          <i className="bkey__dot" style={{ background: partyCss(p, pal) }} aria-hidden />
          {SHORT[p] ?? PARTY_NAMES[p]}
        </span>
      ))}
      <span className="lkey__item lkey__size" data-testid="places-size-key">
        <i className="bkey__dot bkey__dot--small" aria-hidden />
        <i className="bkey__dot bkey__dot--big" aria-hidden />
        Bigger = more votes · Tap a dot
      </span>
      {!final && (
        <span className="lkey__item lkey__extra">
          <i className="bkey__dot bkey__dot--faint" aria-hidden />
          Faint = none yet
        </span>
      )}
    </>
  )
}

/** Behind the "i": what a dot is, in plain words. On a phone the size and faint lines of the key live here (VE-167). */
export function PlacesInfo() {
  // VE-308 (pick P1): the three rules are drawn (PlacesArt), so the words shrink to one line and the one caveat.
  return (
    <>
      <p>Each dot is a polling place on election day.</p>
      <p className="key__sub">Early and postal votes count in seat totals only.</p>
    </>
  )
}
