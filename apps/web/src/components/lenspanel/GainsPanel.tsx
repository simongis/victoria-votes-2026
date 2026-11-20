import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../../parties'
import { cardLine, gainCards, type GainCard } from '../../derive/gains'
import type { Seat } from '../../derive/seats'
import { partyCss } from '../../views/encoding'
import { usePalette } from '../../theme/theme'
import { LensPanel, type LensRowView, type StageLink } from './LensPanel'

interface Props {
  seats: ReadonlyMap<number, Seat>
  /** The party tapped in the Gains key: only its gains show. */
  party: PartyBucket | null
  /** The seat picked on the stage. */
  selected: number | null
  /** The one line over the cards (also the Seats handle on a phone). */
  summary: string
  /** Pick a seat (the rail's own pick, so a phone's sheet closes as it does for a row). */
  onPick: (id: number) => void
  /** Tell the stage which seat a card is lit for, so the Hex and Map ring it (VE-156, FB-191). */
  onRing: (id: number | null) => void
}

/** A seat shape on the stage (Hex or Map) or its inset: the seats the pointer or the keyboard is on. */
const SEAT_SEL = '[data-district], [data-inset-seat]'
const stageSeat = (t: EventTarget | null): number | null => {
  const el = t instanceof Element ? t.closest(SEAT_SEL) : null
  // Only the stage's own shapes: the rail's rows and the cards carry data-district too.
  if (!el || !el.closest('.stage')) return null
  const id = el.getAttribute('data-district') ?? el.getAttribute('data-inset-seat')
  return id === null ? null : Number(id)
}

/**
 * The seat under a mouse pointer or the keyboard focus on the stage (FB-191), so its card can light and come into view.
 * Mouse only for hover, as the stage does: a tap selects, and a hover left behind by a finger would stick.
 */
function useStageHover(): number | null {
  const [id, setId] = useState<number | null>(null)
  useEffect(() => {
    const over = (e: Event) => {
      if ((e as PointerEvent).pointerType === 'mouse') setId(stageSeat(e.target))
    }
    const out = (e: Event) => {
      if ((e as PointerEvent).pointerType === 'mouse') setId(stageSeat((e as PointerEvent).relatedTarget))
    }
    const focus = (e: Event) => {
      const seat = stageSeat(e.target)
      if (seat !== null && (e.target as Element).matches(':focus-visible')) setId(seat)
    }
    const blur = (e: Event) => stageSeat(e.target) !== null && setId(null)
    document.addEventListener('pointerover', over)
    document.addEventListener('pointerout', out)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', blur)
    return () => {
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerout', out)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', blur)
    }
  }, [])
  return id
}

const sentence = (c: GainCard, baseNote: string): string =>
  `${c.name}: ${PARTY_NAMES[c.from]} to ${PARTY_NAMES[c.to]}, ${c.words}${baseNote === '2022' ? '' : ` (compared with the ${baseNote})`}.`

/**
 * The Gains colour's side panel (VE-156, FB-188, FB-192): one card per seat that changed hands, closest result first, in the
 * shared lens panel frame (LensPanel). Each card shows the party that held the seat, an arrow, and the party that leads or won
 * it now, then how big the lead is. The rows are in derive/gains.ts. A card and its seat light each other on the stage, both
 * ways, and picking one selects the seat as a rail row does.
 */
export function GainsPanel({ seats, party, selected, summary, onPick, onRing }: Props) {
  const pal = usePalette()
  const [query, setQuery] = useState('')
  const [cardHover, setCardHover] = useState<number | null>(null)
  const stageHover = useStageHover()

  const cards = useMemo(() => gainCards(seats.values(), party), [seats, party])
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => (q === '' ? cards : cards.filter((c) => c.name.toLowerCase().includes(q))), [cards, q])

  // The card's own light: the stage rings that seat. Stable, because LensPanel clears it on unmount.
  const lightRow = useCallback((id: number | null) => setCardHover(id), [])
  useEffect(() => onRing(cardHover), [cardHover, onRing])
  useEffect(() => () => onRing(null), [onRing])

  const link: StageLink = { active: cardHover ?? stageHover ?? selected, picked: selected, lightRow, pickRow: onPick, scrollTo: stageHover }

  const rows: LensRowView[] = useMemo(
    () =>
      shown.map((c) => ({
        id: c.id,
        name: c.name,
        colour: partyCss(c.to, pal),
        mark: (
          <span className="gcard__ft">
            <i className="gcard__sw" style={{ background: partyCss(c.from, pal) }} title={PARTY_NAMES[c.from]} />
            <span className="gcard__arrow">{'→'}</span>
            <i className="gcard__sw" style={{ background: partyCss(c.to, pal) }} title={PARTY_NAMES[c.to]} />
          </span>
        ),
        value: cardLine(c),
        words: sentence(c, c.seat.baseNote),
      })),
    [shown, pal],
  )

  const empty = party !== null && cards.length === 0 ? `${PARTY_NAMES[party]} gained no seats.` : q !== '' ? 'No seats match.' : 'No seat has changed hands yet.'
  return (
    <LensPanel
      summary={summary}
      unit=""
      filters={[]}
      filter={null}
      onFilter={() => {}}
      query={query}
      onQuery={setQuery}
      rows={rows}
      variant="cards"
      link={link}
      empty={empty}
    />
  )
}
