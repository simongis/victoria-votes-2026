import { useEffect, useRef, useState } from 'react'
import type { CandidateAttributes, PartyBucket } from '@vic26/schema'
import { bucketLabels, MIN_COMPARE_FORMAL, placePanel, rankWords, swingWords, vsSeatWords, type PlaceInput, type PlacePanel, type TwoCp } from '../../derive/boothPanel'
import { num } from '../../format'
import { PARTY_NAMES } from '../../parties'
import { usePalette } from '../../theme/theme'
import { partyCss } from '../../views/encoding'
import { midlineInk } from '../../derive/midline'
import { nightWords } from '../../derive/nightWords'
import { currentMotion, usePresence } from '../DistrictPanel'
import { InfoButton } from '../InfoButton'
import { outsideWords } from './dots'
import { FLOAT_ROW_PX, PANEL_HALF, sheetGrows } from '../sheet/sheet'
import { PANEL_SHEET_QUERY, panelSheetMemory, useSheet } from '../sheet/useSheet'
import '../../styles/panel.css'
import '../../styles/booth-panel.css'

/** Everything the panel reads. `input` carries the time shown, so Rewind, a ?now= link and the live edge all agree with the stage. */
export interface BoothPanelData {
  input: PlaceInput
  /** The seat's places for the keyboard's "another place" list. */
  others: { id: number; name: string }[]
  /** Places at this spot (VE-292, VE-301): each record for a district it serves or a neighbour at the same address, in district order. */
  centre?: { id: number; districtId: number; seat: string }[]
  /** VE-301: an early voting centre whose point is outside the district it reports for. */
  outside?: boolean
  /** The biggest place's votes, for the size of the dots in the strip. */
  maxFormal: number
}

interface Props {
  data: BoothPanelData
  /** "Replay", "Trial" or null: the not-live label, kept on the panel (hard rule 2). */
  dataLabel: string | null
  /** The baseline's name for the swing line ("2022"). */
  since: string
  /** A time of day for a tick ("9:05 pm"). */
  label: (ms: number) => string
  /** The first and last tick of the night, for the line under "Count here over the night". */
  nightEnds: { start: string; end: string; total: number } | null
  onSeat: () => void
  onClose: () => void
  onPick: (id: number) => void
  closing?: boolean
  motion?: 'full' | 'reduced'
  /** VE-208b: the seat panel is leaving for this one (or this one for it): the frame stays still, only the content changes. */
  handoff?: boolean
  /** The seat's candidates, when the source has them: they name the Independent and Other rows (FB-271). */
  candidates?: readonly CandidateAttributes[] | null
}

const pct1 = (n: number): string => `${n.toFixed(1)}%`

/**
 * The polling place panel (VE-208, variant B of the VE-206 prototype). Opens where the seat panel opens, over the rail
 * on desktop and as the bottom sheet on a phone, and takes its figures from `placePanel`, which reads the same tick as the stage.
 */
export function BoothPanel({ data, dataLabel, since, label, nightEnds, onSeat, onClose, onPick, closing = false, motion = 'full', handoff = false, candidates = null }: Props) {
  const { input } = data
  const p = placePanel(input)
  const pal = usePalette()
  const root = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // A new place starts at the top, and its heading takes focus (screen readers and keyboard), whether it came from the
  // seat panel (handoff, on mount) or from another place under the same frame.
  const shownId = useRef<number | null>(null)
  useEffect(() => {
    const first = shownId.current === null
    shownId.current = input.place.id
    if (root.current) root.current.scrollTop = 0
    if (!first || handoff) heading.current?.focus({ preventScroll: true })
  }, [input.place.id, handoff])
  useEffect(() => {
    const el = root.current
    if (!el) return
    if (closing) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [closing])
  // VE-228 (ADR 0035): the same phone sheet as the seat panel. It opens at half, or at the height the seat panel was left at
  // when it takes over from it; a drag well below peek closes it, as the X does.
  const sheet = useSheet(root, {
    query: PANEL_SHEET_QUERY,
    initial: handoff ? panelSheetMemory.last : 'half',
    share: PANEL_HALF,
    full: true,
    gap: FLOAT_ROW_PX,
    fit: true,
    below: 'close',
    onClose,
    scroller: () => root.current?.querySelector<HTMLElement>('.panel__body') ?? null,
  })
  useEffect(() => {
    panelSheetMemory.last = sheet.detent
  }, [sheet.detent])

  const seat = input.seat.name
  const kind = input.isEvc ? 'Early voting centre' : 'Election day polling place'
  const partyOf = (q: PartyBucket) => PARTY_NAMES[q]
  const swing = swingWords(p.swing, partyOf, since)

  return (
    <aside ref={root} className="panel booth-panel" aria-label={`${input.place.name} polling place`} data-testid="booth-panel" data-state-of={p.state} data-motion={motion} data-state={closing ? 'closing' : 'open'} data-handoff={handoff || undefined}>
      <button type="button" className="panel__grip" data-testid="panel-grip" aria-expanded={sheet.detent !== 'peek'} aria-label={sheetGrows(sheet) ? 'Show more' : 'Show less'} onClick={sheet.step} {...sheet.zone} />
      <div className="panel__head" {...sheet.zone}>
        {/* The seat's name before the place's: one control that goes back to the seat, in the title line so the frame matches the seat panel's. */}
        <div className="bp__title">
          <button type="button" className="bp__crumb" onClick={onSeat} data-testid="booth-see-seat" aria-label={`Back to ${seat}`}>
            {seat} <span aria-hidden>&rsaquo;</span>
          </button>
          <h2 key={input.place.id} ref={heading} tabIndex={-1}>{input.place.name}</h2>
        </div>
        <span className="panel__tools">
          <InfoButton label="About these numbers">
            <p>The bar is the count between the last two candidates, at this place only. Seat figures are the seat&apos;s whole count, early and postal votes included.</p>
            {since && <p>Swing is the change in that share since this place in {since}.</p>}
            <p>Places are ranked on the seat leader&apos;s share. Each dot in the strip is a place; bigger means more votes.</p>
            <p>Places with fewer than {MIN_COMPARE_FORMAL} formal votes are left out of comparisons: a few ballots swing the share too far to mean much.</p>
          </InfoButton>
          <button type="button" className="icon-btn" aria-label="Close polling place panel" onClick={onClose}>
            ✕
          </button>
        </span>
      </div>
      <div className="panel__body bp" key={input.place.id}>
        <p className="bp__sub" data-sheet-peek>
          {kind}
          {/* VE-295: the pill's words come from the one helper, so a simulated night says so here too. */}
          {dataLabel && <span className="bp__chip" data-testid="booth-panel-label">{nightWords(dataLabel as 'Replay' | 'Trial' | 'Not live')?.pill ?? 'Not live'}</span>}
        </p>
        {data.outside && input.isEvc && <p className="bp__sub" data-testid="booth-outside">{outsideWords(seat)}</p>}
        {data.centre &&data.centre.length > 1 && (
          <div className="bp__joint" role="group" aria-label="Results for each place at this spot" data-testid="booth-joint">
            <span className="bp__nav-label">Results for:</span>
            {data.centre.map((m) => (
              <button key={m.id} type="button" className="bp__joint-btn" aria-pressed={m.id === input.place.id} data-testid="booth-joint-btn" onClick={() => m.id !== input.place.id && onPick(m.id)}>
                {m.seat}
              </button>
            ))}
          </div>
        )}
        {data.others.length > 1 && (
          <div className="bp__nav">
            {/* A visible label so the list reads as a way to move, not a repeat of the title; the accessible name stays "Another place in ...". */}
            <span className="bp__nav-label" aria-hidden>Other places in {seat}</span>
            <select className="bp__select" aria-label={`Another place in ${seat}`} value={input.place.id} onChange={(e) => onPick(Number(e.target.value))} data-testid="booth-select">
              {data.others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {p.state === 'waiting' && <Waiting p={p} seat={seat} label={label} />}
        {p.state === 'evc-no-result' && <EvcNoResult p={p} seat={seat} />}
        {(p.state === 'first-preferences' || p.state === 'counted') && (
          <>
            {p.twoCp ? <TwoCpBar two={p.twoCp} title="VEC's two-candidate count" /> : <FirstPrefs p={p} labels={bucketLabels(candidates)} />}
            <dl className="bp__facts" data-testid="booth-facts">
              {swing && !p.tooFew && (
                <>
                  <dt>Swing</dt>
                  <dd data-testid="booth-swing">{swing}</dd>
                </>
              )}
              <dt>First reported</dt>
              <dd>{p.firstReportedAt !== null ? label(p.firstReportedAt) : 'not yet'}</dd>
              <dt>Votes counted</dt>
              <dd>{p.votes !== null ? num.format(p.votes) : '-'}</dd>
              <dt>Informal (not filled in correctly, or blank)</dt>
              <dd>{p.informalPct !== null ? pct1(p.informalPct) : '-'}</dd>
            </dl>
            {p.state === 'first-preferences' && <p className="bp__cap">The final two is not counted here yet.</p>}
            {p.tooFew && p.twoCp && (
              <p className="bp__cap" data-testid="booth-too-few">Too few votes here to compare yet.</p>
            )}
            {p.vsSeat && (
              <section className="bp__block" aria-label="Against the seat" data-testid="booth-vs-seat">
                <h3 className="panel__h">Against the seat</h3>
                <p className="bp__line">
                  <b>{vsSeatWords(p.vsSeat, partyOf(p.vsSeat.party), seat)}</b>
                </p>
                <PairBars
                  rows={[
                    { label: 'This place', v: p.vsSeat.here },
                    { label: 'Whole seat', v: p.vsSeat.seat },
                  ]}
                  colour={partyCss(p.vsSeat.party, pal)}
                />
              </section>
            )}
            {p.rank && (
              <section className="bp__block" aria-label="Among the seat's places" data-testid="booth-rank">
                <h3 className="panel__h">Among the seat&apos;s places</h3>
                <p className="bp__line">
                  <b>{rankWords(p.rank, partyOf(p.rank.party), seat)}</b>
                </p>
                <DotStrip rank={p.rank} name={input.place.name} party={partyOf(p.rank.party)} maxFormal={data.maxFormal} />
              </section>
            )}
            {p.share && (
              <section className="bp__block" aria-label="Share of the seat" data-testid="booth-share">
                <h3 className="panel__h">Share of the seat</h3>
                <p className="bp__line">
                  <b>{pct1(p.share.pctOfSeat)}</b> of {seat}&apos;s votes were cast here.
                </p>
                {p.share.offPlacePct === null || p.share.otherPct === null ? (
                  <p className="bp__cap" data-testid="booth-share-pending">Early and postal votes: not counted yet.</p>
                ) : (
                  <>
                    <p className="bp__line">
                      <b>{p.share.offPlacePct.toFixed(0)}%</b> were not cast at {p.share.hasEvc ? 'a place on this map' : 'a polling place'} ({p.share.hasEvc ? 'postal, absent and so on' : 'early, postal and so on'}). {partyOf(p.share.party)} first preferences:
                    </p>
                    <PairBars
                      rows={[
                        { label: 'Polling places', v: p.share.placesPct },
                        { label: 'Other votes', v: p.share.otherPct },
                      ]}
                      colour={partyCss(p.share.party, pal)}
                    />
                  </>
                )}
              </section>
            )}
            {p.series.length > 1 && nightEnds && (
              <section className="bp__block" aria-label="Count here over the night" data-testid="booth-night">
                <h3 className="panel__h">Count here over the night</h3>
                <Spark series={p.series} total={nightEnds.total} start={nightEnds.start} end={nightEnds.end} />
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

function Waiting({ p, seat, label }: { p: PlacePanel; seat: string; label: (ms: number) => string }) {
  return (
    <div className="bp__block bp__block--first" data-testid="booth-waiting">
      <p className="bp__line">
        <b>Not counted yet</b>
      </p>
      <p className="bp__cap">{p.firstSeatAt !== null ? `The first places in ${seat} reported at ${label(p.firstSeatAt)}.` : `No place in ${seat} has reported yet.`}</p>
    </div>
  )
}

function EvcNoResult({ p, seat }: { p: PlacePanel; seat: string }) {
  return (
    <div className="bp__block bp__block--first" data-testid="booth-evc">
      <p className="bp__line">
        {/* VE-226 (finding 11): from 2026 the VEC reports each early voting centre as its own polling place (guide p. 10), so no result means not yet. */}
        <b>No result for this centre yet.</b>
      </p>
      {p.seatFallback && <TwoCpBar two={p.seatFallback} title={`${seat}, whole seat`} />}
    </div>
  )
}

/** The final two as the seat panel draws it: both sides at the ends of one bar with the 50% tick. */
function TwoCpBar({ two, title }: { two: TwoCp; title: string }) {
  const pal = usePalette()
  const pctB = 100 - two.pctA
  return (
    <div className="bp__two" data-testid="booth-two">
      <h3 className="panel__h">{title}</h3>
      <div className="bp__two-row">
        <span>
          <b>{pct1(two.pctA)}</b> {PARTY_NAMES[two.a]}
        </span>
        <span className="bp__end">
          <b>{pct1(pctB)}</b> {PARTY_NAMES[two.b]}
        </span>
      </div>
      <div className="bp__two-bar" role="img" aria-label={`${PARTY_NAMES[two.a]} ${pct1(two.pctA)}, ${PARTY_NAMES[two.b]} ${pct1(pctB)}, tick at 50%`}>
        <span style={{ width: `${two.pctA}%`, background: partyCss(two.a, pal) }} />
        <span style={{ width: `${pctB}%`, background: partyCss(two.b, pal) }} />
        <i data-ink={midlineInk(pal.party[two.pctA >= 50 ? two.a : two.b])} style={{ left: '50%' }} />
      </div>
    </div>
  )
}

function FirstPrefs({ p, labels }: { p: PlacePanel; labels: Partial<Record<PartyBucket, string>> }) {
  const pal = usePalette()
  const top = Math.max(1, ...p.fp.map((f) => f.pct))
  return (
    <div className="bp__two" data-testid="booth-fp">
      <h3 className="panel__h">First preferences</h3>
      <ol className="bp__fp">
        {p.fp.slice(0, 4).map((f) => (
          <li key={f.party}>
            <span>{labels[f.party] ?? PARTY_NAMES[f.party]}</span>
            <span className="bp__track">
              <i style={{ width: `${(100 * f.pct) / top}%`, background: partyCss(f.party, pal) }} />
            </span>
            <b>{pct1(f.pct)}</b>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Two labelled bars, here against the seat and similar. The one colour is the party named in the line above. */
function PairBars({ rows, colour }: { rows: { label: string; v: number }[]; colour: string }) {
  return (
    <div className="bp__pair">
      {rows.map((r) => (
        <div key={r.label} className="bp__pair-row">
          <span>{r.label}</span>
          <span className="bp__track">
            <i style={{ width: `${Math.max(0, Math.min(100, r.v))}%`, background: colour }} />
          </span>
          <b>{pct1(r.v)}</b>
        </div>
      ))}
    </div>
  )
}

/** Where this place sits among the seat's places on the leader's share. Each dot is a place, sized by votes; this one is dark. */
function DotStrip({ rank, name, party, maxFormal }: { rank: NonNullable<PlacePanel['rank']>; name: string; party: string; maxFormal: number }) {
  const W = 320
  const X0 = 10
  const X1 = 310
  const base = 62
  const vals = rank.dots.map((d) => d.pct)
  const lo = Math.max(0, Math.floor(Math.min(...vals) - 3))
  const hi = Math.min(100, Math.ceil(Math.max(...vals) + 3))
  const X = (v: number): number => X0 + ((v - lo) / Math.max(1, hi - lo)) * (X1 - X0)
  const radius = (f: number, extra: number): number => extra + 3 * Math.sqrt(Math.min(1, f / Math.max(1, maxFormal)))
  // Stack dots that would overlap, lowest share first, so the strip stays readable with 40 places.
  const placed: { x: number; y: number; r: number }[] = []
  const others = rank.dots.filter((d) => !d.here).sort((a, b) => a.pct - b.pct)
  const circles = others.map((d) => {
    const r = radius(d.formal, 2)
    const x = X(d.pct)
    let y = base - r - 1
    while (placed.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + r + 0.4)) y -= 1.5
    placed.push({ x, y, r })
    return { id: d.id, x, y, r }
  })
  const me = rank.dots.find((d) => d.here)!
  const rb = radius(me.formal, 4)
  const label = `${name} ${me.pct.toFixed(1)}%`
  return (
    <figure className="bp__strip">
      <svg viewBox={`0 0 ${W} 82`} role="img" aria-label={`Dot strip of the seat's polling places by ${party} share. This one is ${me.pct.toFixed(1)}%, ${rank.rank} of ${rank.of}.`}>
        <line x1={X0} x2={X1} y1={base} y2={base} className="bp__axis" />
        {/* The 50% mark is dropped when it would sit on an end label (within about 30 units of either). */}
        {lo < 50 && hi > 50 && (
          <>
            <line x1={X(50)} x2={X(50)} y1={8} y2={base} className="bp__mid" />
            {X(50) - X0 >= 30 && X1 - X(50) >= 30 && <text x={X(50)} y={79} textAnchor="middle">50%</text>}
          </>
        )}
        <text x={X0} y={79} textAnchor="start">{lo}%</text>
        <text x={X1} y={79} textAnchor="end">{hi}%</text>
        {circles.map((c) => (
          <circle key={c.id} cx={c.x} cy={c.y} r={c.r} className="bp__dot" />
        ))}
        <circle cx={X(me.pct)} cy={base - rb - 1} r={rb} className="bp__dot bp__dot--me" />
        <text x={Math.min(X1 - 30, Math.max(X0 + 30, X(me.pct)))} y={11} textAnchor="middle" className="bp__strong">{label}</text>
      </svg>
      <figcaption className="bp__cap">Each dot is a polling place; further right is more {party}. Bigger dot, more votes.</figcaption>
    </figure>
  )
}

/** Votes counted here at each tick so far: nothing, then up as the count came in. Spread over the whole night, as the seat's line is. */
function Spark({ series, total, start, end }: { series: number[]; total: number; start: string; end: string }) {
  const W = 320
  const X0 = 6
  const X1 = 314
  const T = 18
  const B = 50
  const maxV = Math.max(1, ...series)
  const X = (i: number): number => X0 + (i / Math.max(1, total - 1)) * (X1 - X0)
  const Y = (v: number): number => B - (v / maxV) * (B - T)
  let d = `M${X(0)} ${Y(series[0]!)}`
  for (let i = 1; i < series.length; i++) d += ` H${X(i)} V${Y(series[i]!)}`
  const firstAt = series.findIndex((v) => v > 0)
  const now = series[series.length - 1]!
  return (
    <figure className="bp__strip">
      <svg viewBox={`0 0 ${W} 70`} role="img" aria-label={`Votes counted here at each update, now ${num.format(now)}.`}>
        <line x1={X0} x2={X1} y1={B} y2={B} className="bp__axis" />
        <path d={d} className="bp__line-path" />
        {firstAt >= 0 && <circle cx={X(firstAt)} cy={Y(series[firstAt]!)} r={3.2} className="bp__first" />}
        <text x={X(series.length - 1)} y={T - 5} textAnchor={series.length > total * 0.6 ? 'end' : 'start'} className="bp__strong">{num.format(now)}</text>
        <text x={X0} y={67} textAnchor="start">{start}</text>
        <text x={X1} y={67} textAnchor="end">{end}</text>
      </svg>
    </figure>
  )
}

/**
 * Keeps the panel on screen for its leave animation, as the seat panel's host does, and hands focus back at once.
 * A different place swaps the content under the same panel (the heading cross-fades), not a second slide.
 */
export function BoothPanelHost(props: Omit<Props, 'closing' | 'motion' | 'data'> & { data: BoothPanelData | null }) {
  const [shown, setShown] = useState<BoothPanelData | null>(null)
  if (props.data && shown !== props.data) setShown(props.data)
  const motion = currentMotion()
  const { present, closing } = usePresence(props.data !== null, motion, props.handoff)
  useEffect(() => {
    if (!closing) return
    const a = document.activeElement
    if (a instanceof HTMLElement && a.closest('[data-testid="booth-panel"]')) a.blur()
  }, [closing])
  // Whether this panel arrived in place of the seat panel is fixed when it mounts: the frame must not slide later.
  const [swap, setSwap] = useState(false)
  const [was, setWas] = useState(false)
  if (present !== was) {
    setWas(present)
    setSwap(present && !!props.handoff)
  }
  if (!present || !shown) return null
  return <BoothPanel {...props} data={shown} closing={closing} motion={motion} handoff={swap} />
}
