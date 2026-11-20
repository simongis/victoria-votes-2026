import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * The right-hand panel while an Explore lens is open (VE-125, FB-138): the lens's picture as a ranked list. This is the
 * shared frame, top to bottom: search, one summary line, a few filter chips, the list. A lens fills it with a config
 * (the rows, their marks and numbers, its filters); SwingPanel is the first. The rule is in docs/research/side-panel-per-lens.md.
 */

export interface LensFilterChip {
  key: string
  label: string
  title?: string
  /** Rows the chip would show, over every row (not narrowed by search). */
  count: number
}

export interface LensRowView {
  id: number
  name: string
  /** The leader's colour for the square. */
  colour: string
  /** A small mark drawn like the stage's (an SVG). */
  mark: ReactNode
  /** The number, or the words that stand in for it. */
  value: ReactNode
  /** The row's tooltip and what a screen reader hears. */
  words: string
}

interface Props {
  summary: string
  /** Under the list's heading: what the number is. */
  unit: string
  filters: readonly LensFilterChip[]
  filter: string | null
  onFilter: (key: string | null) => void
  query: string
  onQuery: (q: string) => void
  /** Rows after the filter and search. */
  rows: readonly LensRowView[]
  /**
   * Cards instead of table rows (VE-156): the mark leads, then the name over the value's words. The Gains cards use this,
   * with the main stage's own hover and pick passed in through `link` (an Explore lens's stage is not there to read).
   */
  variant?: 'cards'
  /** Replaces the Explore stage link: the lit and picked seat, and how a row lights or picks a seat. */
  link?: StageLink
  /** What the list says when it has no rows (default: no seats match). */
  empty?: string
}

/** What a row needs to light and pick its seat, wherever that seat is drawn. */
export interface StageLink {
  /** The seat lit now (hovered, focused or picked elsewhere), or null. */
  active: number | null
  /** The seat picked, or null. */
  picked: number | null
  /** Light a seat (id) or put the light out (null; `last` is the one that was lit). */
  lightRow: (id: number | null, last?: number | null) => void
  pickRow: (id: number) => void
  /** The seat to bring into view, when it differs from `active` (Gains: only a seat the viewer hovers or focuses on the stage, never a pick or the first load). */
  scrollTo?: number | null
}

const LENS = '[data-testid="explore-lens"]'
/** How long after the viewer last scrolled the list a lit seat leaves it alone. */
const SCROLL_HOLD_MS = 900
/** A seat's shape on the stage (or its strip row) carries data-id; the lens reads its own hover and pick from it. */
const idOf = (t: EventTarget | null): number | null => {
  const el = t instanceof Element ? t.closest<SVGElement>('[data-id]') : null
  return el ? Number(el.dataset.id) : null
}
const targetOf = (id: number): Element | null => document.querySelector(`${LENS} [data-id="${id}"]`)

/**
 * The link between the rows and the stage, both ways. The lens owns its hover and pick (ExploreLayer is not ours), so the
 * panel speaks its language: a row hover sends the same pointer events a mouse would to the seat's shape, a row pick sends
 * the click, and the panel reads the lens's own hover and pick back from the events on the stage. The lens's pill, outline
 * and Tap-again-to-clear then work from a row exactly as from the map.
 */
function useStageLink() {
  const [hover, setHover] = useState<number | null>(null)
  const [sticky, setSticky] = useState<number | null>(null)
  useEffect(() => {
    const root = document.querySelector(LENS)
    if (!root) return
    const over = (e: Event) => {
      if ((e as PointerEvent).pointerType === 'mouse') setHover(idOf(e.target))
    }
    const out = (e: Event) => {
      if ((e as PointerEvent).pointerType === 'mouse') setHover(idOf((e as PointerEvent).relatedTarget))
    }
    // The lens toggles its pick on a click inside its stage and clears it on a click on nothing; mirror that.
    const click = (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest('.arrows__stage')) return
      const id = idOf(e.target)
      setSticky(id === null ? null : (s) => (s === id ? null : id))
      setHover(null)
    }
    root.addEventListener('pointerover', over)
    root.addEventListener('pointerout', out)
    root.addEventListener('click', click)
    return () => {
      root.removeEventListener('pointerover', over)
      root.removeEventListener('pointerout', out)
      root.removeEventListener('click', click)
    }
  }, [])
  const lightRow = useCallback((id: number | null, last?: number | null) => {
    const el = id === null ? (last == null ? null : targetOf(last)) : targetOf(id)
    el?.dispatchEvent(new PointerEvent(id === null ? 'pointerout' : 'pointerover', { bubbles: true, pointerType: 'mouse' }))
  }, [])
  const pickRow = useCallback((id: number) => targetOf(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), [])
  return { active: hover ?? sticky, picked: sticky, lightRow, pickRow }
}

export function LensPanel({ summary, unit, filters, filter, onFilter, query, onQuery, rows, variant, link, empty }: Props) {
  const explore = useStageLink()
  const { active, picked, lightRow, pickRow } = link ?? explore
  const list = useRef<HTMLUListElement>(null)
  const over = useRef<number | null>(null)
  // The viewer scrolling the list (wheel, touch or the scrollbar) is not interrupted by a seat lit on the stage (VE-156).
  const scrolled = useRef(0)
  const noteScroll = () => {
    scrolled.current = Date.now()
  }

  const target = link && 'scrollTo' in link ? link.scrollTo ?? null : active
  useEffect(() => {
    if (target === null || Date.now() - scrolled.current < SCROLL_HOLD_MS) return
    list.current?.querySelector(`[data-district="${target}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [target])

  const enter = (id: number) => {
    over.current = id
    lightRow(id)
  }
  const leave = () => {
    lightRow(null, over.current)
    over.current = null
  }
  // Leaving the panel (the lens closes) must not leave a seat lit on a stage that is going away.
  useEffect(() => () => lightRow(null, over.current), [lightRow])

  const cards = variant === 'cards'
  return (
    <div className={`lenspanel${cards ? ' lenspanel--cards' : ''}`} data-testid="lens-panel">
      <div className="rail__bar">
        <input type="search" className="rail__search" placeholder="Search seats" aria-label="Search seats" value={query} onChange={(e) => onQuery(e.target.value)} />
      </div>
      <p className="lenspanel__summary" role="status" data-testid="lens-summary">{summary}</p>
      {(filters.length > 0 || query.trim() !== '') && (
        <div className="rail__filters" role="group" aria-label="Show">
          {filters.map((f) => (
            <button key={f.key} type="button" className="rail__chip" aria-pressed={filter === f.key} title={f.title} onClick={() => onFilter(filter === f.key ? null : f.key)}>
              {f.label} ({f.count})
            </button>
          ))}
          {query.trim() !== '' && (
            <button type="button" className="rail__chip" onClick={() => onQuery('')}>
              Clear search
            </button>
          )}
        </div>
      )}
      {unit !== '' && <p className="lenspanel__unit">{unit}</p>}
      <div className="rail__scroll" onWheel={noteScroll} onTouchMove={noteScroll} onPointerDown={(e) => e.target === e.currentTarget && noteScroll()}>
        <ul ref={list} className="lenspanel__list" aria-label={unit || summary}>
          {rows.map((r) => (
            <li key={r.id} data-district={r.id} data-testid="lens-row" className={`lenspanel__row${active === r.id ? ' is-lit' : ''}${picked === r.id ? ' is-picked' : ''}`}>
              <button
                type="button"
                title={r.words}
                aria-pressed={picked === r.id}
                onPointerEnter={(e) => e.pointerType === 'mouse' && enter(r.id)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && leave()}
                onFocus={() => enter(r.id)}
                onBlur={leave}
                onClick={() => pickRow(r.id)}
              >
                {cards ? (
                  <>
                    <span className="lenspanel__mark" aria-hidden>{r.mark}</span>
                    <span className="gcard__txt">
                      <span className="lenspanel__name">{r.name}</span>
                      <span className="gcard__sub">{r.value}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="sq" style={{ background: r.colour }} aria-hidden />
                    <span className="lenspanel__name">{r.name}</span>
                    <span className="lenspanel__mark" aria-hidden>{r.mark}</span>
                    <span className="lenspanel__value">{r.value}</span>
                  </>
                )}
                <span className="sr-only">. {r.words}</span>
              </button>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <p className="rail__none">{empty ?? 'No seats match.'}</p>}
      </div>
    </div>
  )
}
