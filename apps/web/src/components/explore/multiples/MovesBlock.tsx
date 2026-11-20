import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { biggestMoves, type MoveInput } from '../../../derive/biggestMoves'
import { sparkPath } from '../../../derive/pulse'
import { css, usePalette } from '../../../theme/theme'
import { stepRgb } from '../../../views/encoding'
import type { MultiRow } from '../../lenspanel/multi'

interface Props {
  rows: readonly MultiRow[]
  /** Ticks in the night so far: the width every line is spread over. */
  total: number
  /** Every seat declared: the heading says "of the night". */
  final: boolean
  /** Points either side of zero that reach a chart's top and bottom edge (the grid's own scale). */
  range: number
  /** The portrait phone is showing the grid. */
  on: boolean
  ring: number | null
  onRing: (id: number | null) => void
  /** Open a seat's panel, as tapping its tile does. */
  onSelect: (id: number) => void
}

/** A card holds a name, a line that may wrap to two, and a larger chart; cards sit 8 px apart and the heading takes 20 px. */
const CARD_H = 84
const GAP = 8
const HEAD_H = 20
const CW = 120
const CH = 22

interface Fit {
  top: number
  rows: number
}

/** The holder-signed line's two sides: the 2022 holder (positive) and the other party in the pairing (negative). */
function sides(r: MultiRow): Pick<MoveInput, 'holder' | 'other'> {
  const t = r.seat.tcp
  if (!t) return { holder: r.seat.base, other: null }
  const base = r.seat.base
  if (base === null) return { holder: t.a, other: t.b }
  return { holder: base, other: t.a === base ? t.b : t.a }
}

/**
 * The six biggest moves under the portrait phone Multiples grid (VE-182), the same pattern as the Hex's closest seats
 * (VE-177, ClosestSeats.tsx): two columns of cards sit under "Back to the map" and above the caption sheet. How many whole
 * rows fit is measured, not guessed; fewer than two cards fitting means no block. A first tap rings the seat's tile on the
 * grid, a second tap on the same card opens the seat. Keyboard focus rings it without arming the second step (a touch
 * browser also focuses a button it taps, which must not open the seat at once). Escape or a tap elsewhere clears the ring.
 */
export function MovesBlock({ rows, total, final, range, on, ring, onRing, onSelect }: Props) {
  const pal = usePalette()
  const root = useRef<HTMLElement>(null)
  const moves = useMemo(
    () => biggestMoves(rows.map((r): MoveInput => ({ id: r.id, name: r.name, line: r.line, ...sides(r) })), final),
    [rows, final],
  )
  const [fit, setFit] = useState<Fit | null>(null)
  // The card tapped once (ringed, waiting for a second tap), and the ring this block put up (so it never clears another's).
  const armed = useRef<number | null>(null)
  const own = useRef<number | null>(null)

  const measure = useCallback(() => {
    const el = root.current
    const lens = el?.closest<HTMLElement>('.explore-lens')
    if (!el || !lens || !on) return setFit((f) => (f === null ? f : null))
    const foot = lens.querySelector('.explore-lens__foot')
    const rail = document.querySelector('.rail')
    if (!foot) return setFit((f) => (f === null ? f : null))
    const l = lens.getBoundingClientRect()
    // The cards sit under the Back button, or under the grid when Back has moved up to the lens bar (VE-227, finding 4).
    const grid = lens.querySelector('.multi .arrows__stage')
    const top = Math.max(foot.getBoundingClientRect().bottom, grid ? grid.getBoundingClientRect().bottom : 0) - l.top + GAP
    const limit = rail ? rail.getBoundingClientRect().top : l.bottom
    const room = limit - l.top - GAP - top - HEAD_H
    const rowsFit = Math.max(0, Math.floor((room + GAP) / (CARD_H + GAP)))
    setFit((f) => (f && f.rows === rowsFit && Math.abs(f.top - top) < 0.5 ? f : { top, rows: rowsFit }))
  }, [on])

  useLayoutEffect(() => {
    // Measuring the DOM and storing the result is the point of this effect (the layout is outside React).
    measure()
    const lens = root.current?.closest<HTMLElement>('.explore-lens')
    if (!lens) return
    const ro = new ResizeObserver(measure)
    ro.observe(lens)
    const watch = () => {
      for (const n of lens.querySelectorAll('.explore-lens__foot, .multi .arrows__stage')) ro.observe(n)
      const rail = document.querySelector('.rail')
      if (rail) ro.observe(rail)
    }
    watch()
    window.addEventListener('resize', measure)
    // Attribute changes (Rewind opening, the sheet opening, a seat panel) move the rail.
    const mo = new MutationObserver(() => { watch(); measure() })
    const app = lens.closest('.app')
    if (app) mo.observe(app, { attributes: true, attributeFilter: ['data-selected', 'data-rewind', 'data-time'] })
    const rail = document.querySelector('.rail')
    if (rail) mo.observe(rail, { attributes: true, attributeFilter: ['data-open'] })
    return () => {
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])
  // The grid changes height with the caption and the title wrapping: measure after each render.
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
      if (e.target instanceof Element && e.target.closest('.moves__card')) return
      clear()
    }
    // Window capture runs before the Explore layer's own Escape (which closes the lens): with a ring up, Escape clears the ring first.
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || own.current === null) return
      e.preventDefault()
      clear()
    }
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [clear])

  const shown = on && moves && fit && fit.rows >= 1 ? moves.cards.slice(0, fit.rows * 2) : []
  const visible = shown.length >= 2
  // The block going away (a seat opened, another view) takes its ring with it.
  useEffect(() => {
    if (!visible) clear()
  }, [visible, clear])

  if (!visible || !moves || !fit) return <section ref={root} className="moves" hidden aria-hidden />

  const byId = new Map(rows.map((r) => [r.id, r]))
  return (
    <section ref={root} className="moves" style={{ top: fit.top }} aria-label={moves.heading} data-testid="multi-moves">
      <h2 className="moves__h">{moves.heading}</h2>
      <div className="moves__grid">
        {shown.map((c) => {
          const d = sparkPath(byId.get(c.id)?.line ?? [], total, CW, CH, range)
          return (
            <button
              key={c.id}
              type="button"
              className="moves__card"
              data-card={c.id}
              data-changed={c.changed || undefined}
              data-size={c.size.toFixed(2)}
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
              <span className="moves__name">{c.name}</span>
              <span className="moves__line">{c.line}</span>
              <svg className="moves__chart" viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" aria-hidden focusable="false">
                <line className="multi__mid" x1="0" x2={CW} y1={CH / 2} y2={CH / 2} />
                {d && <path className="multi__line moves__path" d={d} style={{ stroke: css(stepRgb(c.leader, 2, pal)) }} />}
              </svg>
            </button>
          )
        })}
      </div>
    </section>
  )
}
