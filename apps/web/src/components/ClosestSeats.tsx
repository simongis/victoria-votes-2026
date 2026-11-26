import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CLOSE_WAIT_NOTE, CLOSEST_FROM_PCT, changingSeats, closestSeats, noPreferencesYet } from '../derive/closest'
import type { Seat } from '../derive/seats'
import { useCloseUpFits } from './map/closeUpWindow'
import type { PartyBucket } from '@vic26/schema'
import { partyCss } from '../views/encoding'
import { usePalette } from '../theme/theme'

interface Props {
  seats: ReadonlyMap<number, Seat>
  /** Statewide share counted, for the 5% gate. */
  countedPct: number
  /** Every seat declared: the heading drops "seats" for "results". */
  final: boolean
  /** The party tapped in the Gains key, if any: the Gains cards are that party's gains and losses. */
  party?: PartyBucket | null
  /** No lens or polling places cover the stage. The block shows under the Hex, or under the Map while it is at rest (VE-235). */
  active: boolean
  /** The seat ringed on the stage (shared with the Gains cards). */
  ring: number | null
  onRing: (id: number | null) => void
  /** Open a seat's panel, as tapping its hex does. */
  onSelect: (id: number) => void
}

/** A card is at least 48 px tall (touch target), cards sit 8 px apart, and the heading takes 20 px. */
const CARD_H = 48
const GAP = 8
const HEAD_H = 20

/**
 * The card's one figure at rest ("About 500 votes ahead" becomes "~500 votes"): about 40 words at rest is the phone rule, and six
 * sentences were half of them. The whole sentence stays in the card's accessible name (c.label).
 */
const shortLine = (line: string): string => line.replace(/^About /, '~').replace(/^Under 100/, '<100').replace(/ ahead$/, '')

interface Fit {
  top: number
  rows: number
}

/**
 * The closest seats under the portrait phone Hex (VE-177, FB-205, FB-206): picture, key, then up to six cards in two
 * columns. Where it sits is measured, not guessed: the hexes' bottom edge decides where the colour chips start (a CSS
 * variable on the stage), the chips' bottom edge decides where the cards start, and the Seats handle's top edge decides how
 * many whole rows fit. Fewer than two cards fitting means no block at all.
 * A first tap rings the seat's hex, a second tap on the same card opens its panel. Keyboard focus rings it too, without
 * arming the second-tap step (a touch browser also focuses a button it taps, which must not open the panel at once).
 */
export function ClosestSeats({ seats, countedPct, final, party = null, active, ring, onRing, onSelect }: Props) {
  const pal = usePalette()
  const phone = useCloseUpFits()
  const on = active && phone
  const root = useRef<HTMLElement>(null)
  // Under Gains the block is the seats that changed hands (VE-189). The colour lives in App state and this block takes no prop for it,
  // so it reads the app root's data-colour, which measure() already watches for changes.
  const [gains, setGains] = useState(false)
  const closest = useMemo(() => (gains ? changingSeats(seats.values(), countedPct, final, party) : closestSeats(seats.values(), countedPct, final)), [gains, seats, countedPct, final, party])
  const [fit, setFit] = useState<Fit | null>(null)
  // The card tapped once (ringed and waiting for a second tap), and the ring this block put up (so it never clears another's).
  const armed = useRef<number | null>(null)
  const own = useRef<number | null>(null)

  const measure = useCallback(() => {
    const el = root.current
    const stage = el?.parentElement
    if (!el || !stage) return
    setGains(stage.closest('.app')?.getAttribute('data-colour') === 'gains')
    if (!on) {
      stage.removeAttribute('data-hexfit')
      stage.style.removeProperty('--hex-bottom')
      setFit((f) => (f === null ? f : null))
      return
    }
    const s = stage.getBoundingClientRect()
    // The picture's foot: the hexes' bottom edge on Hex, or Victoria's at rest on the Map (MapPane publishes it, VE-235). A map that
    // has been moved, or any other state of it, publishes nothing, so the block and the key go back to their usual place.
    let hexBottom: number
    if (stage.closest('.app')?.getAttribute('data-shape') === 'map') {
      const mc = stage.querySelector<HTMLElement>('.map-container')
      const foot = Number(mc?.dataset['restBottom'])
      if (!mc || !(foot > 0)) {
        stage.removeAttribute('data-hexfit')
        stage.style.removeProperty('--hex-bottom')
        return setFit((f) => (f === null ? f : null))
      }
      hexBottom = mc.getBoundingClientRect().top + foot
    } else {
      const hexes = [...stage.querySelectorAll('.pane--seats polygon.hex')]
      if (hexes.length === 0) return
      hexBottom = Math.max(...hexes.map((h) => h.getBoundingClientRect().bottom))
    }
    stage.style.setProperty('--hex-bottom', `${(hexBottom - s.top + 6).toFixed(1)}px`)
    stage.setAttribute('data-hexfit', '')
    const chips = stage.querySelector(':scope > .colour-chips')
    const cb = chips ? chips.getBoundingClientRect() : null
    // The chips are hidden (a seat panel or the Seats sheet is open): the block goes with them. At Final the Leader key is empty,
    // so the box is shown but has no height; the cards then follow the hexes directly.
    if (!cb || !chips || getComputedStyle(chips).display === 'none') return setFit((f) => (f === null ? f : null))
    const rail = stage.parentElement?.querySelector('.rail')
    const railTop = rail ? rail.getBoundingClientRect().top : s.bottom
    const top = cb.bottom - s.top + GAP
    const room = railTop - s.top - GAP - top - HEAD_H
    const rows = Math.max(0, Math.floor((room + GAP) / (CARD_H + GAP)))
    setFit((f) => (f && f.rows === rows && Math.abs(f.top - top) < 0.5 ? f : { top, rows }))
  }, [on])

  useLayoutEffect(() => {
    // Measuring the DOM and storing the result is the point of this effect (the layout is outside React).
    measure()
    const el = root.current
    const stage = el?.parentElement
    if (!stage) return
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    const watch = () => {
      for (const n of stage.querySelectorAll('.pane--seats svg.hexes, :scope > .colour-chips')) ro.observe(n)
      const rail = stage.parentElement?.querySelector('.rail')
      if (rail) ro.observe(rail)
    }
    watch()
    window.addEventListener('resize', measure)
    // Attribute changes (the seat panel opening, Rewind opening, the sheet opening) move the chips and the rail.
    const mo = new MutationObserver(() => { watch(); measure() })
    const app = stage.closest('.app')
    if (app) mo.observe(app, { attributes: true, attributeFilter: ['data-selected', 'data-rewind', 'data-colour', 'data-shape', 'data-time'] })
    const mapBox = stage.querySelector('.map-container')
    if (mapBox) mo.observe(mapBox, { attributes: true, attributeFilter: ['data-rest-bottom'] })
    const rail = stage.parentElement?.querySelector('.rail')
    if (rail) mo.observe(rail, { attributes: true, attributeFilter: ['data-open'] })
    return () => {
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', measure)
      stage.removeAttribute('data-hexfit')
      stage.style.removeProperty('--hex-bottom')
    }
  }, [measure])
  // The colour chips change height with the colour (the Gains key is taller) and the key's words: measure after each render of the app.
  useEffect(measure)

  const clear = useCallback(() => {
    armed.current = null
    if (own.current !== null) {
      own.current = null
      onRing(null)
    }
  }, [onRing])

  // Tapping anywhere else, or Escape, clears the ring this block put up.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (own.current === null) return
      if (e.target instanceof Element && e.target.closest('.closest__card')) return
      clear()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && clear()
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key)
    }
  }, [clear])

  const shownCards = on && closest && fit && fit.rows >= 1 ? closest.cards.slice(0, fit.rows * 2) : []
  // One seat is a fair block under Gains (a short list of changers); the closest seats need a pair to fill a row.
  const visible = shownCards.length >= (gains ? 1 : 2)
  // The block going away (a seat opened, another shape) takes its ring with it.
  useEffect(() => {
    if (!visible) clear()
  }, [visible, clear])

  // VE-254 (F5): with no count after preferences anywhere the block would be empty, and the lower part of the phone map with it. One plain line says why (the smaller, safer change: no first-preference cards, which would rank party totals, not candidates).
  const waiting = on && !gains && !closest && !final && countedPct >= CLOSEST_FROM_PCT && fit !== null && noPreferencesYet(seats.values())
  if (waiting) return <section ref={root} className="closest" style={{ top: fit.top }} data-testid="closest-wait"><p className="closest__h closest__wait">{CLOSE_WAIT_NOTE}</p></section>
  if (!visible || !closest || !fit) return <section ref={root} className="closest" hidden aria-hidden />

  return (
    <section ref={root} className="closest" style={{ top: fit.top }} aria-label={closest.heading} data-testid="closest-seats">
      <h2 className="closest__h">{closest.heading}</h2>
      <div className="closest__grid">
        {shownCards.map((c) => (
          <button
            key={c.id}
            type="button"
            className="closest__card"
            data-card={c.id}
            data-ringed={ring === c.id || undefined}
            aria-label={c.label}
            onFocus={() => { own.current = c.id; onRing(c.id) }}
            onBlur={() => { if (armed.current !== c.id && own.current === c.id) { own.current = null; onRing(null) } }}
            onClick={() => {
              if (armed.current === c.id) {
                clear()
                onSelect(c.id)
                return
              }
              armed.current = c.id
              own.current = c.id
              onRing(c.id)
            }}
          >
            <span className="closest__stripe" style={{ background: partyCss(c.leader, pal) }} aria-hidden />
            <span className="closest__body">
              <span className="closest__name">{c.name}</span>
              <span className="closest__line">{shortLine(c.line)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
