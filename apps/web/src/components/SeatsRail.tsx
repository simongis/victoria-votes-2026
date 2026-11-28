import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { IN_DOUBT_TCP_PCT, type DistrictStatic } from '@vic26/schema'
import type { Seat } from '../derive/seats'
import { DOUBT, focusName, type Focus } from '../derive/focus'
import { filterRows, latestFirst, listRow, railCounts, resultWords, sortRows, type ListRow, type RailFilter, type SortDir, type SortKey } from '../derive/list'
import { barScale, barWidths, doubtWords } from '../derive/doubt'
import { noPreferencesYet } from '../derive/closest'
import { sparkPath } from '../derive/pulse'
import { css, usePalette } from '../theme/theme'
import { allDeclared, leaderCss, partyCss } from '../views/encoding'
import { HEADLINE_MIN_PCT, legibleOn } from '../derive/headline'
import { GAINS_FROM_COUNTED_PCT } from '../derive/gains'
import { usePhoneBits } from '../state/phoneBits'
import { useFx } from './Effects'
import { LEAD_HEADER, LEAD_HINT, leadCell } from '../derive/marginWords'
import { findPlaces, loadPlaces, type PlaceIndex } from './lookup/lookup'
import { PlaceMatches } from './lookup/PlaceMatches'
import { FLOAT_ROW_PX, LIST_HALF, sheetGrows } from './sheet/sheet'
import { PANEL_SHEET_QUERY, useSheet } from './sheet/useSheet'
import { scrollRowIntoView } from './scrollRowIntoView'

/** The status chips, in reading order. The titles carry the longer meaning so the chips stay short. */
const CHIPS: { key: RailFilter; label: string; title: string }[] = [
  { key: 'doubt', label: 'Close seats', title: `Seats not yet declared where the leader is under ${IN_DOUBT_TCP_PCT}% after preferences, or the VEC is still working out the final two` },
  { key: 'changing', label: 'Changing hands', title: 'Seats where the leader is not the 2022 holder and enough of the seat is counted' },
  { key: 'won', label: 'Won', title: 'Seats the VEC has declared' },
]

const SPARK_W = 56
const SPARK_H = 24
/** Points either side of zero that reach the sparkline's edges. */
const SPARK_RANGE = 30

/** Under this width the rail is a bottom sheet (the same breakpoint as the rest of the narrow layout). */
const isNarrow = (): boolean => matchMedia('(max-width: 1023px)').matches

interface Props {
  seats: ReadonlyMap<number, Seat>
  statics: ReadonlyMap<number, DistrictStatic>
  selected: number | null
  focus: Focus | null
  onFocus: (f: Focus | null) => void
  onSelect: (id: number) => void
  /** Each seat's margin at every tick of the night (derive/pulse.ts). */
  pulse: ReadonlyMap<number, readonly (number | null)[]>
  /** The tick on screen: lines are drawn up to it, so scrubbing grows them. */
  shownIdx: number
  /** Ticks in the night so far, the width every line is spread over. */
  total: number
  /** Statewide share of enrolment counted: under HEADLINE_MIN_PCT the Close seats chip is not offered (VE-166). */
  countedPct: number
  /** The status chip picked, held by App so the top band's in-doubt button can set it (VE-92). */
  status: RailFilter | null
  onStatus: (s: RailFilter | null) => void
  /**
   * While an Explore lens is open its panel takes the rail's place (VE-125): its body fills the sheet and its summary is the
   * phone handle's words. The rail itself stays mounted underneath, so its search, sort and filter are as they were on return.
   */
  lens?: { summary: string; panel: ReactNode; /** A pick in the panel selects the seat, so on a phone the sheet gives way to the district panel (Gains cards, VE-156). */ picks?: boolean } | null
  /** VE-227: told when the phone sheet opens or closes, so the map can refit above it. */
  onOpenChange?: (open: boolean) => void
}

/** The count pulse: a dashed zero line (the 2022 holder level with the rest) and the margin line over the night. */
function Spark({ series, total, colour }: { series: readonly (number | null)[]; total: number; colour: string }) {
  const d = sparkPath(series, total, SPARK_W, SPARK_H, SPARK_RANGE)
  return (
    <svg className="spark" width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} aria-hidden="true" focusable="false">
      <line className="spark__mid" x1="0" x2={SPARK_W} y1={SPARK_H / 2} y2={SPARK_H / 2} />
      {d && <path className="spark__line" d={d} style={{ stroke: colour }} />}
    </svg>
  )
}

/**
 * The seats rail (ADR 0018, from VE-62's list): every seat in a compact real table beside the stage, whatever the
 * shape. Each row has the leader's colour, the seat, a count-pulse line and the leader's margin. Sort, a name
 * search and the top-tally party focus narrow it; choosing a row selects the seat on the stage and the other way
 * round. On a narrow screen it is a bottom sheet that peeks and opens.
 */
export function SeatsRail({ seats, statics, selected, focus, onFocus, onSelect, pulse, shownIdx, total, countedPct, status, onStatus, lens = null, onOpenChange }: Props) {
  const pal = usePalette()
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'margin', dir: 'asc' })
  // Under In doubt the list starts closest first (lead against votes left, VE-111) until the viewer picks a sort.
  const [picked, setPicked] = useState(false)
  const inDoubt = status === 'doubt'
  const order = useMemo<{ key: SortKey; dir: SortDir }>(() => (inDoubt && !picked ? { key: 'lead', dir: 'asc' } : sort), [inDoubt, picked, sort])
  const [query, setQuery] = useState('')
  const root = useRef<HTMLElement>(null)
  // VE-228 (ADR 0035): on a phone the list is the shared bottom sheet: peek (the handle), half, and full for the plain list. A lens's
  // list stops at half, so the lens's Back and "i" stay in view; both stop at peek on the way down.
  const sheet = useSheet(root, {
    query: PANEL_SHEET_QUERY,
    share: LIST_HALF,
    full: lens === null,
    gap: FLOAT_ROW_PX,
    below: null,
    scroller: () => root.current?.querySelector<HTMLElement>('.rail__body:not([hidden]) .rail__scroll') ?? null,
  })
  const { set: setSheet } = sheet
  const open = sheet.detent !== 'peek'
  const setOpen = (o: boolean) => setSheet((d) => (o ? (d === 'peek' ? 'half' : d) : 'peek'))
  const openRef = useRef(onOpenChange)
  useEffect(() => {
    openRef.current = onOpenChange
  })
  useEffect(() => {
    openRef.current?.(open)
  }, [open])
  const lastFocused = useRef<number | null>(null)
  const bodyId = useId()
  // VE-144a: on a phone the handle is one row: the short headline, the in-doubt button and "Seats" (both come from the top band).
  const { handle } = usePhoneBits()

  const fx = useFx()
  // "Latest" lifts the seats counted most recently to the top, whatever the sort (VE-75b: recency is said in words and order, not marks).
  const [latest, setLatest] = useState(false)
  const rows = useMemo(() => [...seats.values()].map((s) => listRow(s, statics.get(s.id))), [seats, statics])
  const shown = useMemo(() => {
    const sorted = sortRows(filterRows(rows, focus, query, status), order.key, order.dir)
    return latest ? latestFirst(sorted, fx.fresh) : sorted
  }, [rows, focus, query, status, order, latest, fx.fresh])
  const waiting = useMemo(() => (inDoubt ? shown.filter((r) => r.seat.noPrefs) : []), [inDoubt, shown])
  // One scale for every bar on show, so a long grey bar beside a short coloured one reads at a glance.
  const scale = useMemo(() => (inDoubt ? barScale(shown.map((r) => ({ lead: r.seat.marginVotes, left: r.seat.stillToCount }))) : 0), [inDoubt, shown])

  // A seat chosen on the stage: bring its row into view (the header is sticky, scroll-margin clears it).
  useEffect(() => {
    if (selected === null) return
    scrollRowIntoView(root.current?.querySelector(`tr[data-district="${selected}"]`))
  }, [selected])

  // The district panel covers the rail while a seat is selected, which drops keyboard focus from a row. When the
  // panel closes, hand focus back to that row.
  const hadSelection = useRef(false)
  useEffect(() => {
    const had = hadSelection.current
    hadSelection.current = selected !== null
    if (!had || selected !== null || lastFocused.current === null) return
    const id = lastFocused.current
    lastFocused.current = null
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return
      root.current?.querySelector<HTMLElement>(`tr[data-district="${id}"] button, [data-testid="lens-row"][data-district="${id}"] button`)?.focus({ preventScroll: true })
    })
  }, [selected])

  // Suburbs and postcodes (VE-147): the asset loads on the first real search, so the startup bundle does not grow.
  const [index, setIndex] = useState<PlaceIndex | null>(null)
  const searching = query.trim().length >= 2
  useEffect(() => {
    if (index || !searching) return
    let live = true
    void loadPlaces(new Set(statics.keys())).then((i) => live && setIndex(i))
    return () => {
      live = false
    }
  }, [index, searching, statics])
  const places = useMemo(() => (index ? findPlaces(index, query) : []), [index, query])
  const seatName = (id: number): string => seats.get(id)?.name ?? statics.get(id)?.district_name.replace(/ District$/, '') ?? 'Unknown seat'

  const counts = useMemo(() => railCounts(rows), [rows])
  // VE-153: once every seat is won and none is in doubt, the In doubt chip (0) has nothing to offer.
  const finished = rows.length > 0 && counts.doubt === 0 && counts.won === rows.length
  // VE-166 (FB-195): at Final a row's "Won" and the Won chip say the same thing 88 times, so both go; they come back in Rewind because this reads the seats on screen.
  const final = useMemo(() => allDeclared(seats.values()), [seats])
  // VE-170 (review finding 9): "Won (0)" filters to nothing, so it waits for the first declared seat. If it is pressed when Rewind takes the count to zero it stays until unpressed, as the Close chip does.
  // VE-254 (F5): and not while no seat has a count after preferences, when "Close seats (0)" would read as a fact.
  const closeShown = countedPct >= HEADLINE_MIN_PCT && !(counts.doubt === 0 && noPreferencesYet(seats.values()))
  // Changing hands is offered on Gains' bar (VE-168, FB-198), so its count can never run ahead of the Gains panel's.
  const changingShown = countedPct >= GAINS_FROM_COUNTED_PCT
  // The open lens makes everything behind it inert (ExploreLayer), the rail included. The panel is the lens's own list and must
  // stay usable, so it opts back out for as long as the lens is open.
  const lensOpen = lens !== null
  useEffect(() => {
    const el = root.current
    if (!el || !lensOpen) return
    el.removeAttribute('inert')
    const watch = new MutationObserver(() => el.hasAttribute('inert') && el.removeAttribute('inert'))
    watch.observe(el, { attributes: true, attributeFilter: ['inert'] })
    return () => watch.disconnect()
  }, [lensOpen])
  const sortBy = (key: SortKey) => {
    setPicked(true)
    setSort(() => (order.key === key ? { key, dir: order.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }
  const pick = (id: number) => {
    lastFocused.current = id
    onSelect(id)
    // On a phone the district panel takes the sheet's place.
    if (isNarrow()) setOpen(false)
  }
  // A card picked in the Gains panel is a row pick: remember it for the focus hand-back, and on a phone let the district panel take the sheet's place.
  const onLensPick = (e: MouseEvent<HTMLElement>) => {
    const id = (e.target as Element).closest('[data-testid="lens-row"]')?.getAttribute('data-district')
    if (id == null) return
    lastFocused.current = Number(id)
    if (isNarrow()) setOpen(false)
  }
  const filtered = focus !== null || query.trim() !== '' || status !== null
  const aria = (key: SortKey) => (order.key === key ? (order.dir === 'asc' ? 'ascending' : 'descending') : 'none')
  const arrow = (key: SortKey) => (order.key === key ? (order.dir === 'asc' ? '▲' : '▼') : '')

  return (
    <aside ref={root} className="rail" data-open={open} data-lens={lensOpen} data-testid="seats-rail" aria-label="Seats">
      <div className="rail__top" data-sheet-peek {...sheet.zone}>
      <button type="button" className="rail__handle" aria-expanded={open} aria-controls={bodyId} onClick={sheet.step}>
        <span className="rail__grip" aria-hidden />
        {open ? (
          // The handle names its next step: up to full, back to half, then down to the handle (ADR 0035).
          sheet.active && sheetGrows(sheet) ? 'Show more' : sheet.active && sheet.next !== 'peek' ? 'Show less' : lens ? 'Hide list' : 'Hide seats'
        ) : lens ? (
          lens.summary
        ) : handle ? (
          <>
            <span className="rail__text">
              <span className="rail__lead" data-testid="handle-lead">
                {handle.parts.map((b, i) =>
                  b.side ? (
                    <b key={i} style={{ color: css(legibleOn(pal.party[b.side === 'COA' ? 'LIB' : b.side], pal.paper)) }}>{b.text}</b>
                  ) : (
                    <span key={i}>{b.text}</span>
                  ),
                )}
              </span>
              {/* VE-221 (B3): the share counted, the second line of the handle (the desktop band shows it up top). */}
              <span className="rail__counted" data-testid="handle-counted">{handle.counted}</span>
            </span>
          </>
        ) : (
          `Seats (${rows.length})`
        )}
      </button>
      {/* Beside the handle, not inside it (a button cannot hold a button): the band's in-doubt pill moved here. */}
      {!open && !lens && handle && handle.inDoubt > 0 && (
        <button type="button" className="rail__doubt" data-testid="handle-doubt" aria-label={`${handle.inDoubt} close ${handle.inDoubt === 1 ? 'seat' : 'seats'}: show them`} onClick={() => { handle.showDoubt(); setOpen(true) }}>
          <b>{handle.inDoubt}</b> close
        </button>
      )}
      {/* The handle's "Seats" label is its own target (the headline button and this one both open the sheet), so no two targets overlap. */}
      {!open && !lens && handle && (
        <button type="button" className="rail__seats" aria-label={`Seats (${rows.length})`} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(true)}>
          Seats
        </button>
      )}
      </div>
      {lens && (
        <div className="rail__body" id={bodyId} onClickCapture={lens.picks ? onLensPick : undefined}>
          {lens.panel}
        </div>
      )}
      <div className="rail__body" id={lensOpen ? undefined : bodyId} hidden={lensOpen}>
        <div className="rail__bar">
          <input type="search" className="rail__search" placeholder="Seat, suburb or postcode" aria-label="Search seats, suburbs or postcodes" value={query} onChange={(e) => setQuery(e.target.value)} />
          <p className="rail__count" role="status" data-testid="rail-count">
            {filtered ? (shown.length === 0 && places.length > 0 ? `${places.length} ${places.length === 1 ? 'suburb or postcode' : 'suburbs or postcodes'}` : `${shown.length - waiting.length} of ${rows.length} seats`) : `${rows.length} seats`}
          </p>
          <button type="button" className="rail__chip" aria-label="Latest first" aria-pressed={latest} title="Show the seats with the newest figures first" onClick={() => setLatest((l) => !l)}>
            Latest
          </button>
        </div>
        <div className="rail__filters">
          {CHIPS.filter((c) => !(c.key === 'doubt' && ((finished && status !== 'doubt') || !closeShown)) && !(c.key === 'won' && (final || (counts.won === 0 && status !== 'won'))) && !(c.key === 'changing' && !changingShown)).map((c) => (
            <button key={c.key} type="button" className="rail__chip" aria-pressed={status === c.key} title={c.title} onClick={() => onStatus(status === c.key ? null : c.key)}>
              {c.key === 'changing' && final ? 'Changed hands' : c.label} ({counts[c.key]})
            </button>
          ))}
          {/* The In doubt pick has its own chip above, already pressed. */}
          {focus !== null && focus !== DOUBT && (
            <button type="button" className="rail__chip" onClick={() => onFocus(null)}>
              {focusName(focus)} only, clear
            </button>
          )}
          {query.trim() !== '' && (
            <button type="button" className="rail__chip" onClick={() => setQuery('')}>
              Clear search
            </button>
          )}
        </div>
        {inDoubt && (
          <p className="rail__key" data-testid="rail-key">Bar: lead. Grey: votes left to count.</p>
        )}
        <PlaceMatches places={places} seatName={seatName} onPick={pick} />
        <div className="rail__scroll">
          <table className="data-table railtable">
            <caption className="sr-only">Every seat, with its lead over the night and how many votes ahead the leader is</caption>
            <thead>
              <tr>
                <th scope="col" aria-sort={aria('name')}>
                  <button type="button" className="sortbtn" onClick={() => sortBy('name')}>
                    Seat<span aria-hidden className="sortbtn__arrow">{arrow('name')}</span>
                  </button>
                </th>
                <th scope="col" className="is-spark" title="How the 2022 holder's two-candidate lead moved over the night: above the dashed line they lead, below it they trail">Night</th>
                <th scope="col" className="is-num" aria-sort={aria('margin')}>
                  <button type="button" className="sortbtn" title={LEAD_HINT} onClick={() => sortBy('margin')}>
                    <span aria-hidden className="sortbtn__arrow">{arrow('margin')}</span>{LEAD_HEADER}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {(inDoubt ? shown.filter((r) => !r.seat.noPrefs) : shown).map((r) => (
                <Row
                  key={r.id}
                  r={r}
                  selected={selected === r.id}
                  mark={leaderCss(r.seat, pal)}
                  line={r.leader ? partyCss(r.leader, pal) : 'var(--color-text-subtle)'}
                  series={(pulse.get(r.id) ?? []).slice(0, shownIdx + 1)}
                  total={total}
                  scale={inDoubt ? scale : null}
                  final={final}
                  onSelect={pick}
                />
              ))}
            </tbody>
            {/* VE-226 (finding 7): seats with no count after preferences are unknown, not close, so they follow under their own
                heading and are not in the "N close" count. */}
            {inDoubt && waiting.length > 0 && (
              <tbody data-testid="rail-waiting">
                <tr className="rail__sep">
                  <th scope="colgroup" colSpan={3}>No preference count yet ({waiting.length})</th>
                </tr>
                {waiting.map((r) => (
                  <Row
                    key={r.id}
                    r={r}
                    selected={selected === r.id}
                    mark={leaderCss(r.seat, pal)}
                    line={r.leader ? partyCss(r.leader, pal) : 'var(--color-text-subtle)'}
                    series={(pulse.get(r.id) ?? []).slice(0, shownIdx + 1)}
                    total={total}
                    scale={scale}
                    final={final}
                    onSelect={pick}
                  />
                ))}
              </tbody>
            )}
          </table>
          {/* VE-215 A7: a suburb or postcode match above already answers the search, so only a search with no match at all says "No seats match." */}
          {shown.length === 0 && places.length === 0 && <p className="rail__none">No seats match.</p>}
        </div>
      </div>
    </aside>
  )
}

/** The In doubt row's two bars: the lead in the leader's colour, the votes left in grey, a tick where they would be level. */
function DoubtBars({ lead, left, scale, colour, withheld }: { lead: number | null; left: number | null; scale: number; colour: string; withheld: boolean }) {
  const w = barWidths(lead, left, scale)
  if (!w) return <span className="dbars dbars--none" data-testid="doubt-bars" aria-hidden>{withheld ? 'VEC still working out the final two' : 'No preference count yet'}</span>
  return (
    <span className="dbars" data-testid="doubt-bars" aria-hidden title={doubtWords(lead, left)}>
      <span className="dbars__lead" data-w={w.lead.toFixed(2)} style={{ width: `max(3px, ${w.lead}%)`, background: colour }} />
      <span className="dbars__left" data-w={w.left.toFixed(2)} style={{ width: `${w.left}%` }} />
    </span>
  )
}

function Row({ r, selected, mark, line, series, total, scale, final, onSelect }: { r: ListRow; selected: boolean; mark: string; line: string; series: readonly (number | null)[]; total: number; scale: number | null; final: boolean; onSelect: (id: number) => void }) {
  const pal = usePalette()
  const fx = useFx()
  const change = fx.active ? fx.changes.get(r.id) : undefined
  const was = change?.flipped ? fx.prevSeats.get(r.id) : undefined
  const won = r.status === 'Declared' && !final
  const words = resultWords(r.seat)
  // Counts and flips tint the row (alternating names restart the animation on a seat that changes on two ticks running);
  // reduced motion outlines it instead.
  const cue = change ? (fx.reduced ? 'steady' : fx.seq % 2 === 0 ? 'a' : 'b') : undefined
  const delta = change?.counted ? change.countedDelta : 0
  return (
    // The row itself takes the click so the whole row is the target; the name button stays for keyboard and screen readers.
    <tr aria-selected={selected} className={selected ? 'is-selected' : undefined} data-district={r.id} data-fx={cue} onClick={() => onSelect(r.id)}>
      <th scope="row">
        <button type="button" className="link-btn" title={words ? `${r.name}: ${words}` : r.name}>
          <span className="sqwrap" aria-hidden>
            <span className="sq" style={{ background: mark }} />
            {was && !fx.reduced && <span key={fx.seq} className="sq sq--old" style={{ background: leaderCss(was, pal) }} data-fx="flip" />}
          </span>
          <span className="rail__name">{r.name}</span>
          {won && <span className={`rail__won${change?.declared && !fx.reduced ? ' rail__won--new' : ''}`} aria-hidden>Won</span>}
          <span className="sr-only">{r.leader ? `, ${words ?? r.status}` : ', no figures yet'}</span>
          {scale !== null && <span className="sr-only">. {doubtWords(r.seat.marginVotes, r.seat.stillToCount)}</span>}
        </button>
        {scale !== null && <DoubtBars lead={r.seat.marginVotes} left={r.seat.stillToCount} scale={scale} colour={line} withheld={r.seat.tcpWithheld} />}
      </th>
      <td className="is-spark">
        <Spark series={series} total={total} colour={line} />
      </td>
      <td className="is-num">
        {/* VE-215 A10: in the close-seats list a seat with no two-candidate count says so under its name, so the lead cell stays blank. */}
        {scale !== null && r.seat.marginVotes === null ? null : leadCell(r.seat.marginVotes)}
        {delta >= 0.5 && (
          <span key={fx.seq} className="fx-chip fx-chip--css" data-fx="chip" aria-hidden>
            +{Math.round(delta)}%
          </span>
        )}
      </td>
    </tr>
  )
}
