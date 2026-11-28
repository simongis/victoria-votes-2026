import { useEffect, useRef, useState } from 'react'
import type { CandidateAttributes } from '@vic26/schema'
import type { PartyBucket } from '@vic26/schema'
import { WITHHELD_LINE, panelLeadLine, tcpBasisLine, type Seat } from '../derive/seats'
import { bucketLeadNote, bucketRowNames, fpDisclosureLabel, heldLine, nightSides } from '../derive/panel'
import { sparkPath } from '../derive/pulse'
import { gainShown, resultWords } from '../derive/list'
import { num, personName } from '../format'
import { PARTY_NAMES } from '../parties'
import { css, usePalette } from '../theme/theme'
import { getMotion } from '../state/motion'
import { leaderCss, partyCss, stepRgb } from '../views/encoding'
import { pairDoubtNote, pairDoubtTail } from '../derive/pairNote'
import { midlineInk } from '../derive/midline'
import { InfoButton } from './InfoButton'
import { fpChangeLine } from './swing/fpChange'
import { useFpBaseline } from './swing/useFpBaseline'
import { ProfileSection } from './ProfileSection'
import { FORECAST_BASE, forecastHref, seatLabel } from './explore/forecastLink'
import { FLOAT_ROW_PX, PANEL_HALF, sheetGrows } from './sheet/sheet'
import { PANEL_SHEET_QUERY, panelSheetMemory, useSheet } from './sheet/useSheet'
import '../styles/panel.css'

interface Props {
  seat: Seat
  /** null while loading or when the source cannot say (playing, or a past tick on AGOL). */
  candidates: CandidateAttributes[] | null
  onClose: () => void
  /** The leave animation is running: the panel is inert and no longer takes focus. */
  closing?: boolean
  /** 'full' plays the slide and fades; 'reduced' shows and hides at once (the CSS keys on this, not on the media query, so ?motion=1 and ?motion=0 agree with the JS). */
  motion?: 'full' | 'reduced'
  /** Labor's swing line, already through swingShown and swingLine (null hides it, VE-98). */
  swing?: string | null
  /** The seat's margin at every tick of the night, for the panel-width line. */
  night?: Night | null
  /** Informal votes as a share, when the source carries it. */
  informal?: number | null
  /** VE-165: every seat is declared (Final), so the share counted is called turnout. */
  turnout?: boolean
  /** VE-208b: this panel took over from the polling place panel, so it keeps the frame still (no slide) and takes focus. */
  handoff?: boolean
  /** VE-208b: under Polling places, the seat's places as links that open a place's panel. */
  places?: { id: number; name: string }[] | null
  onPickPlace?: (id: number) => void
  /** VE-226 (finding 13): a replay-only line for a seat the replay has no figures for (Narracan in 2022). */
  note?: string | null
}

export interface Night {
  series: readonly (number | null)[]
  /** Ticks in the whole night, the width the line is spread over. */
  total: number
  startLabel: string
  endLabel: string
}

/** Reads the current motion setting (the Animations switch, or the ?motion override the demo and e2e use). */
// Shared with Rewind; they belong in one small module, which is outside this brief's allow-list (controller to move).
// eslint-disable-next-line react-refresh/only-export-components
export function currentMotion(): 'full' | 'reduced' {
  return getMotion()
}

/** The exit duration from the token, so CSS stays the one place the number lives. */
function exitMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--motion-exit').trim()
  const n = parseFloat(raw)
  return Number.isFinite(n) ? (raw.endsWith('ms') ? n : n * 1000) : 200
}

/**
 * Keeps a panel mounted while its leave animation plays. `present` is whether to render; `closing` is the leave phase.
 * Reduced motion skips the phase. A timer rather than animationend, so a panel that never animates still goes.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePresence(open: boolean, motion: 'full' | 'reduced', instant = false) {
  const [done, setDone] = useState(!open)
  if (open && done) setDone(false)
  // VE-208b: another panel is taking this one's place, so it goes at once rather than playing a leave beside the arrival.
  if (!open && instant && !done) setDone(true)
  const leaving = !open && !done && motion === 'full'
  useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(() => setDone(true), exitMs() + 40)
    return () => window.clearTimeout(t)
  }, [leaving])
  return { present: open || leaving, closing: leaving }
}

/**
 * The panel as the app mounts it: stays on screen for its leave animation (the last seat's figures, not a blank), and
 * hands keyboard focus back at once so the seats rail can restore it to the row that opened the panel.
 */
export function DistrictPanelHost({ seat, candidates, onClose, swing, night, informal, turnout, handoff = false, places, onPickPlace, note = null }: { seat: Seat | null; candidates: CandidateAttributes[] | null; onClose: () => void; swing?: string | null; night?: Night | null; informal?: number | null; turnout?: boolean; handoff?: boolean; places?: { id: number; name: string }[] | null; onPickPlace?: (id: number) => void; note?: string | null }) {
  const [shown, setShown] = useState<{ seat: Seat; candidates: CandidateAttributes[] | null } | null>(null)
  if (seat && (shown?.seat !== seat || shown.candidates !== candidates)) setShown({ seat, candidates })
  const motion = currentMotion()
  const { present, closing } = usePresence(seat !== null, motion, handoff)
  useEffect(() => {
    if (!closing) return
    const a = document.activeElement
    if (a instanceof HTMLElement && a.closest('[data-testid="district-panel"]')) a.blur()
  }, [closing])
  // Whether this panel arrived in place of the polling place panel is fixed when it mounts: the frame must not slide later.
  const [swap, setSwap] = useState(false)
  const [was, setWas] = useState(false)
  if (present !== was) {
    setWas(present)
    setSwap(present && handoff)
  }
  if (!present || !shown) return null
  return <DistrictPanel {...shown} onClose={onClose} closing={closing} motion={motion} swing={swing} night={night} informal={informal} turnout={turnout} handoff={swap} places={places} onPickPlace={onPickPlace} note={note} />
}

const STATE_TEXT: Record<Seat['state'], string> = { none: 'No figures yet', leading: 'leading', firm: 'certain lead', won: 'won (VEC declared)' }

function Gauge({ label, value, parts, marker }: { label: string; value: string; parts: { pct: number; colour: string }[]; marker?: number }) {
  return (
    <div className="gauge">
      <div className="gauge__head"><span>{label}</span><b>{value}</b></div>
      <div className="gauge__bar">
        {parts.map((p, i) => (
          <span key={i} style={{ width: `${Math.max(0, Math.min(100, p.pct))}%`, background: p.colour }} />
        ))}
        {marker !== undefined && <span className="gauge__mark" style={{ left: `${marker}%` }} />}
      </div>
    </div>
  )
}

/** One side of the two-candidate count: name, party, share and (when the feed has them) votes. */
function Side({ name, party, pct, votes, end }: { name: string; party: string; pct: number; votes: number | null; end?: boolean }) {
  return (
    <div className={end ? 'tc__side tc__side--end' : 'tc__side'}>
      <b className="tc__name">{name}</b>
      <span className="tc__party">{party}</span>
      <span className="tc__pct">{pct.toFixed(1)}%</span>
      {votes !== null && <span className="tc__votes">{num.format(votes)} votes</span>}
    </div>
  )
}

/** The ABC-style seat card head: both candidates either end of one bar with the 50% tick. Leader strong, the other tinted. */
function TwoCandidate({ seat: s, candidates }: { seat: Seat; candidates: CandidateAttributes[] | null }) {
  const pal = usePalette()
  const tcp = s.tcp!
  // The feed's two-candidate votes pick the pair; without them (replay, past ticks) the parties stand in for names.
  const pair = (candidates ?? []).filter((c) => (c.tcp_votes ?? 0) > 0).sort((a, b) => (b.tcp_votes ?? 0) - (a.tcp_votes ?? 0))
  const ca = pair.find((c) => c.party === tcp.a) ?? null
  const cb = tcp.b ? pair.find((c) => c.party === tcp.b && c !== ca) ?? null : null
  const pctB = 100 - tcp.pctA
  // VE-284: the 50% line sits on the leader's fill, so its ink follows that colour.
  const midInk = tcp.pctA >= 50 || !tcp.b ? midlineInk(pal.party[tcp.a]) : midlineInk(pal.party[tcp.b])
  // VE-139: the final-two votes cover fewer booths than first preferences, so say how many votes this bar is built on.
  const formal = (candidates ?? []).reduce((n, c) => n + (c.fp_votes ?? 0), 0)
  const basis = tcpBasisLine((ca?.tcp_votes ?? 0) + (cb?.tcp_votes ?? 0), formal)
  return (
    <div className="tc" data-testid="panel-tcp">
      <h3 className="panel__h">After preferences</h3>
      <div className="tc__row">
        <Side name={ca ? personName(ca.candidate_name) : PARTY_NAMES[tcp.a]} party={PARTY_NAMES[tcp.a]} pct={tcp.pctA} votes={ca?.tcp_votes ?? null} />
        <Side name={cb ? personName(cb.candidate_name) : tcp.b ? PARTY_NAMES[tcp.b] : 'Other party'} party={tcp.b ? PARTY_NAMES[tcp.b] : 'Other party'} pct={pctB} votes={cb?.tcp_votes ?? null} end />
      </div>
      <div className="tc__bar" role="img" aria-label={`Two-candidate count: ${tcp.pctA.toFixed(1)}% to ${pctB.toFixed(1)}%, tick at 50%`}>
        <span style={{ width: `${tcp.pctA}%`, background: partyCss(tcp.a, pal) }} />
        <span style={{ width: `${pctB}%`, background: tcp.b ? partyCss(tcp.b, pal) : 'var(--color-border-strong)' }} />
        <span className="gauge__mark tc__mid" data-ink={midInk} style={{ left: '50%' }} />
      </div>
      {basis && <p className="tc__votes tc__basis" style={{ margin: 0 }} data-testid="panel-tcp-basis">{basis}</p>}
    </div>
  )
}

const NIGHT_W = 280
const NIGHT_H = 56
const NIGHT_RANGE = 30

/** The rail's count pulse at panel width: the dashed line is the 2022 holder's level; above it the holder is ahead. */
function NightLine({ seat: s, night }: { seat: Seat; night: Night }) {
  const pal = usePalette()
  const d = sparkPath(night.series, night.total, NIGHT_W, NIGHT_H, NIGHT_RANGE)
  const sides = nightSides(s.base ? PARTY_NAMES[s.base] : null)
  return (
    <figure className="night" data-testid="panel-night">
      <h3 className="panel__h">Lead through the night</h3>
      <div className="night__plot">
        {/* The axis in words: the dashed middle is level, above it the 2022 holder leads (VE-129, FB-145). */}
        <span className="night__axis" aria-hidden><span>{sides.above}</span><span>{sides.below}</span></span>
        <svg viewBox={`0 0 ${NIGHT_W} ${NIGHT_H}`} preserveAspectRatio="none" role="img" aria-label={`The seat's lead over the night. Above the dashed middle line ${sides.above}, below it ${sides.below}.`}>
          <line className="spark__mid" x1="0" x2={NIGHT_W} y1={NIGHT_H / 2} y2={NIGHT_H / 2} />
          {d && <path className="night__line" d={d} style={{ stroke: leaderCss(s, pal) }} />}
        </svg>
      </div>
      <figcaption><span>{night.startLabel}</span><span>{night.endLabel}</span></figcaption>
    </figure>
  )
}

/** The selected district: who is ahead, how far counted, the 2CP split and first preferences. */
export function DistrictPanel({ seat: s, candidates, onClose, closing = false, motion = 'full', swing = null, night = null, informal = null, turnout = false, handoff = false, places = null, onPickPlace, note = null }: Props) {
  const pal = usePalette()
  const root = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // A new seat starts at the top. Arriving from the polling place panel, the heading takes focus (screen readers and keyboard).
  useEffect(() => {
    if (root.current) root.current.scrollTop = 0
  }, [s.id])
  useEffect(() => {
    if (handoff) heading.current?.focus({ preventScroll: true })
  }, [handoff])
  // React 18 has no `inert` prop; a leaving panel must not be tabbable or clickable.
  useEffect(() => {
    const el = root.current
    if (!el) return
    if (closing) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [closing])
  // VE-228 (ADR 0035): on a phone the panel is the shared bottom sheet. It opens at half (or, taking over from the polling place
  // panel, at the height that one was left at); a drag well below peek closes it, as the X does.
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
  const { set: setSheet } = sheet
  useEffect(() => {
    panelSheetMemory.last = sheet.detent
  }, [sheet.detent])
  // A new seat (a tap on the map or a row) opens at half, the height the map frames it above (ADR 0032).
  const shownSeat = useRef(s.id)
  useEffect(() => {
    if (shownSeat.current === s.id) return
    shownSeat.current = s.id
    setSheet('half')
  }, [s.id, setSheet])
  // Every candidate now (they sit behind a disclosure); party buckets stand in when candidates are not available.
  const fpCands = candidates ? [...candidates].sort((a, b) => (b.fp_votes ?? 0) - (a.fp_votes ?? 0)).filter((c) => (c.fp_votes ?? 0) > 0) : []
  // VE-111: one row per candidate, named with the party in words; the two still in the count at the end are marked.
  // Party buckets stand in (no names, no pair) when the source carries no candidates.
  const fpRows: { key: string | number; party: PartyBucket; name: string; partyText: string | null; pct: number | null; votes: number | null; pair: boolean }[] = fpCands.length
    ? fpCands.map((c) => ({ key: c.candidate_id, party: c.party, name: personName(c.candidate_name), partyText: c.party === 'OTH' && c.affiliation_name ? c.affiliation_name : PARTY_NAMES[c.party], pct: c.fp_pct, votes: c.fp_votes, pair: !s.tcpWithheld && (c.tcp_votes ?? 0) > 0 }))
    : s.fp.map((f) => ({ key: f.party, party: f.party, ...bucketRowNames(f.party), pct: f.pct, votes: f.votes, pair: false }))
  const fpTop = Math.max(1, ...fpRows.map((r) => r.pct ?? 0))
  // VE-254 (F3): with party bars only, say why the leader (one candidate) can sit below a group's total.
  const fpNote = fpCands.length ? null : bucketLeadNote(s.leader, fpRows)
  // VE-226 (finding 4): the two candidates' votes after preferences, so the lead line can say how much of the count it rests on.
  const pairVotes = (p: PartyBucket | null | undefined) => (p ? fpCands.find((c) => c.party === p && (c.tcp_votes ?? 0) > 0)?.tcp_votes ?? null : null)
  const va = pairVotes(s.tcp?.a)
  const vb = pairVotes(s.tcp?.b)
  const leadLine = panelLeadLine(s, va !== null && vb !== null ? { a: va, b: vb } : null, fpCands.length ? fpCands.reduce((n, c) => n + (c.fp_votes ?? 0), 0) : null)
  const doubtNote = pairDoubtNote(s)
  const hasNight = !!night && night.series.some((v) => v !== null)
  // VE-234: first-preference change leads the swing section; it exists in every seat, the two-candidate swing only in some.
  const fpBase = useFpBaseline()
  const fpChange = fpChangeLine(s, fpBase)
  return (
    <aside ref={root} className="panel" aria-label={`${s.name} district`} data-testid="district-panel" data-motion={motion} data-state={closing ? 'closing' : 'open'} data-handoff={handoff || undefined}>
      <button type="button" className="panel__grip" data-testid="panel-grip" aria-expanded={sheet.detent !== 'peek'} aria-label={sheetGrows(sheet) ? 'Show more' : 'Show less'} onClick={sheet.step} {...sheet.zone} />
      <div className="panel__head" {...sheet.zone}>
        {/* Keyed by seat: switching seats cross-fades the name rather than re-sliding the panel. */}
        <h2 key={s.id} ref={heading} tabIndex={-1}>{s.name}</h2>
        <span className="panel__tools">
          {hasNight && (
            <InfoButton label="About the night line">
              <p>The line shows how far ahead each side was through the night. On the dashed line they are level. Above it the 2022 holder leads; below it they trail.</p>
            </InfoButton>
          )}
          <button type="button" className="icon-btn" aria-label="Close district panel" onClick={onClose}>
            ✕
          </button>
        </span>
      </div>
      <div className="panel__body" key={s.id}>
      <div className="panel__status" data-sheet-peek>
        <p className="panel__lead">
          <span className="sq" style={{ background: leaderCss(s, pal) }} />
          {s.leader ? (resultWords(s) ?? `${PARTY_NAMES[s.leader]} ${STATE_TEXT[s.state]}`) : STATE_TEXT.none}
          {gainShown(s) && <span className="flag">{turnout || s.state === 'won' ? 'Changed hands' : 'Changing hands'}</span>}
        </p>
        <p className="panel__held" data-testid="panel-held">{heldLine(s.base ? PARTY_NAMES[s.base] : null, s.baseNote)}</p>
        {doubtNote && (
          <p className="panel__note panel__pairnote" data-testid="panel-pair-note">
            VEC counting <b style={{ color: css(stepRgb(doubtNote.a, 2, pal)) }}>{PARTY_NAMES[doubtNote.a]}</b> v <b style={{ color: css(stepRgb(doubtNote.b, 2, pal)) }}>{PARTY_NAMES[doubtNote.b]}</b>. <b style={{ color: css(stepRgb(doubtNote.outsider, 2, pal)) }}>{PARTY_NAMES[doubtNote.outsider]}</b>{pairDoubtTail(doubtNote)}
          </p>
        )}
      </div>
      {note && <p className="panel__note" data-testid="panel-replay-note">{note}</p>}
      {s.tcpWithheld ? (
        <p className="panel__note" data-testid="panel-tcp">{WITHHELD_LINE}</p>
      ) : s.tcp ? (
        <TwoCandidate seat={s} candidates={candidates} />
      ) : s.leader ? (
        <p className="panel__note" data-testid="panel-tcp">Two-candidate count not in yet</p>
      ) : null}
      {leadLine && (
        <p className="panel__line" data-testid="panel-margin">
          {leadLine}
        </p>
      )}
      {fpChange && <p className="panel__line" data-testid="panel-fpchange">{fpChange}</p>}
      {swing && <p className="panel__line" data-testid="panel-swing">{swing}</p>}
      <Gauge label={turnout ? 'Turnout' : 'Counted'} value={s.pct === null ? '-' : `${Math.round(s.pct)}%`} parts={[{ pct: s.pct ?? 0, colour: 'var(--color-text-subtle)' }]} />
      {fpRows.length > 0 && (
        <section className="panel__fp" data-testid="panel-fp" aria-label="First preferences">
          <h3 className="panel__h">{fpDisclosureLabel(fpCands.length)}</h3>
          <ol className="cands" aria-label={fpCands.length ? 'First preferences, candidates' : 'First preferences, by party'}>
            {fpRows.map((r) => (
              <li key={r.key} className="cand" data-testid="cand" data-pair={r.pair || undefined}>
                <span className="cand__top">
                  <span className="cands__name">
                    <b>{r.name}</b>
                    {r.partyText && <span className="cand__party">{r.partyText}</span>}
                    {/* VE-226 (finding 5): the pair is the VEC's pick before the count, and can be wrong, so it is named as the VEC's count. */}
                    {r.pair && <span className="flag cand__pair" title="The VEC picks the two it expects to finish first and second and counts preferences between them. Its pick can be wrong.">VEC&apos;s two-candidate count</span>}
                  </span>
                  <span className="cands__v">{r.pct === null ? '-' : `${r.pct.toFixed(1)}%`}</span>
                  {r.votes !== null && <span className="cand__votes">{num.format(r.votes)}</span>}
                </span>
                <span className="cand__bar" aria-hidden>
                  <span style={{ width: `${r.pct === null ? 0 : (100 * r.pct) / fpTop}%`, background: partyCss(r.party, pal) }} />
                </span>
              </li>
            ))}
          </ol>
          {fpNote && <p className="panel__fpnote" data-testid="panel-fp-note">{fpNote}</p>}
        </section>
      )}
      {hasNight && night && <NightLine seat={s} night={night} />}
      {places && places.length > 0 && onPickPlace && (
        <section className="panel__places" data-testid="seat-places" aria-label={`Polling places in ${s.name}`}>
          <h3 className="panel__h">Polling places in {s.name}</h3>
          <ul>
            {places.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => onPickPlace(o.id)}>{o.name}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {informal !== null && <p className="panel__line" data-testid="panel-informal">Informal {informal.toFixed(1)}%</p>}
      <ProfileSection districtId={s.id} />
      {/* VE-201: a forecast is not a result, so this is the very last line, small and muted, away from the votes. */}
      {FORECAST_BASE && (
        <a
          className="panel__forecast"
          data-testid="panel-forecast"
          href={forecastHref(FORECAST_BASE, s.name)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Polling model forecast for ${seatLabel(s.name)}. A forecast, not results, on another site. Opens in a new tab.`}
        >
          Polling model forecast for {seatLabel(s.name)} ↗
        </a>
      )}
      </div>
    </aside>
  )
}
