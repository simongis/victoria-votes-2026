import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { IN_DOUBT_TCP_PCT, type PartyBucket } from '@vic26/schema'
import { FIRM_RULE, MAJORITY, SEATS, SIDE_NAMES, headlineOf, sideTotals, type Seat, type Side, type Tally } from '../derive/seats'
import { DOUBT, focusDetail, focusName, focusSummary, parseFocus, type Focus, type FocusPart } from '../derive/focus'
import { OTHERS_KEY, keyOthers } from '../derive/tallyKey'
import { HEADLINE_MIN_PCT, declaredOf, headlineParts, headlineText, legibleOn, shortHeadlineParts } from '../derive/headline'
import { DECLARED_NOTICE, PROVISIONAL_NOTICE } from '../footer'
import { PARTY_NAMES } from '../parties'
import { css, usePalette } from '../theme/theme'
import { countedShare, countedWord } from '../derive/turnout'
import { LEAD_STEP_WORDS, allDeclared, leadStep, partyCss, stepRgb, type LeadStep } from '../views/encoding'
import { Roll, useRoll } from './Effects'
import { InfoButton } from './InfoButton'
import { setPhoneBit, usePhoneBits } from '../state/phoneBits'
import { pillWords, type TimeState } from '../state/timeState'
import { openTour } from '../tour'
import { useMotion } from '../state/motion'
import '../styles/topband.css'
import '../styles/leader.css'


export interface TopBandProps {
  headline: string
  tally: Tally
  seats: Map<number, Seat>
  inDoubt: number
  /** VE-226 (finding 7): seats close on a real count (under 52% after preferences) or withheld; what "N close" says. */
  close: number
  /** Picks the in-doubt seats (the rail's In doubt filter and the stage's pick, ADR 0023); the colour stays Leader (VE-127). */
  onShowDoubt?: () => void
  countedPct: number
  /** "9:05 pm": when the figures shown are from. */
  asAt: string | null
  /** The derived time state (live, paused, final or rewinding): the pill's wording and colour (ADR 0024). */
  timeState: TimeState
  dataLabel: string | null
  sourceNote: string | null
  /** What is picked in the tally (a party, or its strong or pale part): lit on the stage and filtered in the seats rail. */
  focus: Focus | null
  onFocus: (f: Focus | null) => void
  /** What the pointer or keyboard is resting on in the tally, for a live preview on the stage; null when it leaves. */
  onPreview?: (f: Focus | null) => void
  /** Quiet status from the poll loop ("Retrying shortly"); null when all is well. Shown small and muted in the "i". */
  pollNote?: string | null
  /** What the stage colour means, first in the "i" sheet (VE-141). */
  colourInfo?: ReactNode
}

/** The bar's parts, left to right: Labor, Greens and the crossbench on the left, a gap for seats with no figures, the Coalition against the right edge. */
const LEFT: PartyBucket[] = ['ALP', 'GRN', 'IND', 'OTH', 'ONP']
const COALITION: PartyBucket[] = ['NAT', 'LIB']
const OTHERS: PartyBucket[] = OTHERS_KEY

/** A party's seats at each Leader step: early lead, likely, solid (firm or won). */
type Steps = [number, number, number]

interface Seg {
  key: string
  party: PartyBucket
  n: number
  /** Parts in drawing order, outer end first for the left side and mirrored for the Coalition. */
  steps: Steps
}

/** Per party, how many seats sit at each step; the bar draws the same three tones the map does (VE-127). */
function stepCounts(seats: Map<number, Seat>): Map<PartyBucket, Steps> {
  const out = new Map<PartyBucket, Steps>()
  for (const s of seats.values()) {
    const step = leadStep(s)
    if (step === null || !s.leader) continue
    const row = out.get(s.leader) ?? [0, 0, 0]
    row[step] += 1
    out.set(s.leader, row)
  }
  return out
}

/** Within a party the solid part sits against the outer end and the faint part towards the middle (the Coalition mirrors it, so its faint seats sit next to the 45 line's gap). */
function segsOf(seats: Map<number, Seat>): { left: Seg[]; right: Seg[] } {
  const counts = stepCounts(seats)
  const seg = (party: PartyBucket): Seg => {
    const steps = counts.get(party) ?? [0, 0, 0]
    return { key: party, party, steps, n: steps[0] + steps[1] + steps[2] }
  }
  return { left: LEFT.map(seg), right: COALITION.map(seg) }
}

/** The step counts in words for a name: "6 won or firm, 3 likely, 2 early lead" (only the parts that exist). */
const stepWords = (steps: Steps, declared = false): string =>
  [
    steps[2] > 0 ? `${steps[2]} ${declared ? 'won' : 'won or certain'}` : null,
    steps[1] > 0 ? `${steps[1]} likely` : null,
    steps[0] > 0 ? `${steps[0]} ${LEAD_STEP_WORDS[0].toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(', ')

const seatsOf = (tally: Tally, p: PartyBucket): number => tally.firm[p] + tally.leading[p]

/** A count that rolls, with a "+n" (or "-n") chip beside it for a moment when it changes (VE-60). */
function Count({ value, testId }: { value: number; testId?: string }) {
  const { valueRef, chipRef } = useRoll(value, 0, true)
  return (
    <>
      <b data-testid={testId}>
        <span ref={valueRef} />
      </b>
      <span ref={chipRef} className="fx-chip" aria-hidden />
    </>
  )
}

/** The "i": how to read the colours and the counts, and where the figures came from (ADR 0017: the attribution lives here). */
export function ReadingKey({ sourceNote, className, pollNote, colourInfo, holding, final }: { sourceNote: string | null; /** Every seat is declared (VE-166): no tick is drawn, so the key does not explain one. */ final?: boolean; className?: string; /** VE-149: the holding page has no results to read, so only the notice, source and settings show. */ holding?: boolean; /** What the stage colour means (VE-141): first in the sheet, so there is one "i", not two. */ colourInfo?: ReactNode; /** The quiet poll note (VE-54): set while retrying or on the backup check. */ pollNote?: string | null }) {
  const motion = useMotion()
  // VE-144a: what left the phone's stage (the votes still to come) is the first thing in the sheet.
  const { stillLine } = usePhoneBits()
  return (
    <InfoButton label="How to read this" className={className}>
      {!holding && stillLine && (
        <div className="key__counts" data-testid="info-counts">
          {stillLine && <p data-testid="info-still">{stillLine}</p>}
        </div>
      )}
      {!holding && colourInfo && <div className="key__colour" data-testid="colour-info">{colourInfo}</div>}
      {/* VE-221 (B3): the one line on when seats settle; at Final there is nothing left to settle. */}
      {!holding && !final && <p data-testid="info-settle">Most seats are clear on the night; close ones can take weeks.</p>}
      {/* VE-118 (FB-119): a few plain lines at rest; the detail folds away. */}
      {/* VE-170: the colour rule is said once, in colourInfo above; the tick key below is all this adds. */}
      {!holding && !final && (
      <ul className="key">
        <li><span className="key__tick" aria-hidden>&#10003;</span> Declared by the VEC</li>
        <li><span className="sq sq--none" /> No result yet</li>
      </ul>
      )}
      {!holding && (
      <details className="key__more">
        <summary>More detail</summary>
        <p><b>The top bar</b> is the key: tap a party to light its seats. A dark outline marks seats you picked.</p>
        <p><b>Night</b> is each seat&apos;s lead through the night. Above the dashed line, the 2022 holder leads.</p>
        <p>
          {!final && <><b>Close</b>: not declared, and the leader has under {IN_DOUBT_TCP_PCT}% after preferences, or the VEC is still working out the final two. </>}<b>{final ? 'Turnout' : 'Counted'}</b>: the share of enrolled voters counted. {MAJORITY} of {SEATS} seats wins. Small squares are crossbench seats.
        </p>
        <p>{FIRM_RULE}</p>
      </details>
      )}
      {sourceNote && <p>{sourceNote}</p>}
      {pollNote && <p className="key__poll" data-testid="poll-note">{pollNote}</p>}
      <p className="key__notice" data-testid="provisional">{final ? DECLARED_NOTICE : PROVISIONAL_NOTICE}</p>
      {/* VE-89: the way back to the guided tour. */}
      <p><button type="button" className="link-btn" data-testid="tour-open" onClick={() => void openTour()}>Show me around</button></p>
      {/* VE-115 (ADR 0027): motion is on unless the visitor turns it off; the device setting only prompts the note. */}
      <div className="motion-switch">
        <span id="motion-label">Animations</span>
        <button
          type="button"
          role="switch"
          aria-checked={motion.on}
          aria-labelledby="motion-label"
          className="switch"
          data-testid="motion-switch"
          onClick={() => motion.setOn(!motion.on)}
        >
          <span className="switch__state" aria-hidden>{motion.on ? 'On' : 'Off'}</span>
        </button>
      </div>
      {motion.note && <p className="motion-note" data-testid="motion-note">Your device asks for less motion. Turn animations off?</p>}
    </InfoButton>
  )
}

/** A side's colour for its name in the headline: the Coalition is shown as Liberal blue, the bigger partner. */
const sideParty = (s: Side): PartyBucket => (s === 'COA' ? 'LIB' : s)

/**
 * The top band (VE-83b, ADR 0023): one row up top (title and Replay marker, the "as at" time, counted and in-doubt
 * figures, the "i"), the headline (who leads whom, party names in party colour), then the tally. The tally is a calm
 * stacked bar in exactly the map's colours (strong is firm or won, pale is leading), the 45 line through it, and the
 * names and counts below, with the Coalition partners (and the crossbench) bracketed. It is the map's legend and its
 * control: point at a party or one of its parts to preview, tap to keep it lit, tap again (or Clear, or Escape) to
 * reset. The attribution lives behind the "i", never on the page (ADR 0017); the Replay or Trial marker stays on screen.
 */
export function TopBand(p: TopBandProps) {
  const pal = usePalette()
  const { focus, onFocus, onPreview } = p
  const [hover, setHover] = useState<Focus | null>(null)
  const sides = sideTotals(p.tally)
  const aria = (Object.keys(sides) as Side[]).filter((s) => sides[s].all > 0).map((s) => `${SIDE_NAMES[s]} ${sides[s].all} (${sides[s].firm} certain)`)
  const majority = `${(MAJORITY / SEATS) * 100}%`
  const { left, right } = useMemo(() => segsOf(p.seats), [p.seats])
  const counts = useMemo(() => stepCounts(p.seats), [p.seats])
  // VE-142: once every seat is declared the tally says "won", not the three steps.
  const declared = useMemo(() => allDeclared(p.seats.values()), [p.seats])
  const none = SEATS - [...left, ...right].reduce((a, x) => a + x.n, 0)
  const shown = hover ?? focus
  const detail = shown ? focusDetail(p.seats, shown) : null
  // The party name and count stay bold; the breakdown after it is plain. In doubt is one bold phrase.
  const summary = (() => {
    if (!shown || !detail) return { head: '', rest: '' }
    const text = focusSummary(shown, detail)
    const cut = text.indexOf(' seats:')
    return cut < 0 ? { head: text, rest: '' } : { head: text.slice(0, cut), rest: text.slice(cut) }
  })()
  const preview = (f: Focus | null) => {
    setHover(f)
    onPreview?.(f)
  }
  const clearAll = () => {
    preview(null)
    onFocus(null)
  }
  useEffect(() => {
    if (!focus && !hover) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) clearAll()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // clearAll only closes over the two callbacks and setHover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, hover, onFocus, onPreview])
  // Replay and trial figures are never called live (pillWords); the badge beside the title names them.
  const words = pillWords(p.timeState, p.dataLabel !== null)
  const showDot = p.timeState === 'live' && p.dataLabel === null
  const choose = (f: Focus) => {
    // The pointer is still over it: stop previewing so a second tap visibly puts the stage back.
    preview(null)
    onFocus(focus === f ? null : f)
  }
  /** Is this bit of the tally in what is shown (a pick, or the preview)? With nothing shown, everything is. */
  const inShown = (parties: readonly PartyBucket[], part: FocusPart | null): boolean => {
    // The in-doubt pick is not a party, so the tally keeps its full colour.
    if (shown === null || shown === DOUBT) return true
    const s = parseFocus(shown)
    const who = s.who === 'COA' ? COALITION : s.who === 'XB' ? OTHERS : [s.who]
    return parties.some((q) => who.includes(q)) && (s.part === null || part === null || s.part === part)
  }
  /** Everything that picks: a chip or a part of the bar. Real buttons (VE-93); on touch the app.css pseudo-element grows each to a 44 px target without changing how the bar looks. */
  const target = (f: Focus, label: string) => ({
    type: 'button' as const,
    'aria-pressed': focus === f,
    'aria-label': label,
    onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && preview(f),
    onPointerLeave: (e: PointerEvent) => e.pointerType === 'mouse' && preview(null),
    // Only a keyboard focus previews: a tap also focuses, and would otherwise leave the preview stuck after a second tap.
    onFocus: (e: { currentTarget: Element }) => e.currentTarget.matches(':focus-visible') && preview(f),
    onBlur: () => preview(null),
    onClick: () => choose(f),
  })
  const swatch = (parties: readonly PartyBucket[]): ReactNode => (
    <span className="tl__sw" aria-hidden>
      {parties.map((q) => (
        <span key={q} className="tl__swp">
          <i style={{ background: partyCss(q, pal) }} />
        </span>
      ))}
    </span>
  )
  const stepsFor = (parties: readonly PartyBucket[]): Steps => parties.reduce<Steps>((a, q) => { const c = counts.get(q); return c ? [a[0] + c[0], a[1] + c[1], a[2] + c[2]] : a }, [0, 0, 0])
  /** One name and count in the key. The phone shows the short name. */
  const chip = (f: Focus, full: string, short: string | null, parties: readonly PartyBucket[], n: number, opts: { testId?: string; head?: boolean; wideOnlyAtZero?: boolean }) => (
    <button
      key={f}
      className={`tl__chip${opts.head ? ' tl__chip--head' : ''}${opts.wideOnlyAtZero && n === 0 ? ' tl__chip--wide-only' : ''}`}
      data-dim={!inShown(parties, null)}
      data-focus={f}
      {...target(f, `${full}: ${n} seats${n > 0 ? ` (${stepWords(stepsFor(parties), declared)})` : ''}. Highlight on the views`)}
    >
      {swatch(parties)}
      <span className="tl__name">
        {short ? (
          <>
            <span className="tl__full">{full}</span>
            <span className="tl__short" aria-hidden>{short}</span>
          </>
        ) : (
          full
        )}
      </span>
      <Count value={n} testId={opts.testId} />
    </button>
  )

  const alp = seatsOf(p.tally, 'ALP')
  const grn = seatsOf(p.tally, 'GRN')
  const othersHeld = keyOthers((q) => seatsOf(p.tally, q)).others
  const onp = seatsOf(p.tally, 'ONP')
  const sum = (ps: readonly PartyBucket[], pick: (q: PartyBucket) => number) => ps.reduce((a, q) => a + pick(q), 0)
  const totalOf = (ps: readonly PartyBucket[]) => sum(ps, (q) => seatsOf(p.tally, q))
  const otherName = (q: PartyBucket, n: number): [string, string | null] =>
    q === 'IND' ? [n === 1 ? 'Independent' : 'Independents', 'Ind'] : q === 'ONP' ? ['One Nation', 'ON'] : [PARTY_NAMES[q], null]

  /** Coalition (and the crossbench) are bracketed: the group's name and total, then each partner. */
  const group = (f: Focus, name: string, parties: readonly PartyBucket[], testId?: string) => (
    <span key={f} className="tl__grp" role="group" aria-label={name} data-g={f}>
      {chip(f, name, null, parties, totalOf(parties), { testId, head: true })}
      <span className="tl__parts">
        {parties.map((q) => {
          const [full, short] = q === 'NAT' ? ['Nationals', 'Nats'] : q === 'LIB' ? ['Liberal', 'Lib'] : otherName(q, seatsOf(p.tally, q))
          return chip(q, full, short, [q], seatsOf(p.tally, q), {})
        })}
      </span>
    </span>
  )

  // The headline is richer than the old one-liner only when the app is showing results; "Results offline" and the like pass through.
  const rich = p.headline === headlineOf(p.tally)
  const bits = rich ? headlineParts(p.tally, p.inDoubt, declaredOf(p.seats.values()), p.countedPct) : [{ text: p.headline }]
  const pct = Math.max(0, Math.min(100, p.countedPct))
  // VE-166 (FB-194): no close-seat count before the headline names a leader; the count then is early-count noise.
  const closeShown = p.countedPct >= HEADLINE_MIN_PCT
  const closeCount = closeShown ? p.close : 0
  const closeAria = `${closeCount} close ${closeCount === 1 ? 'seat' : 'seats'}: show them`

  // VE-144a: the phone's sheet handle reads the short headline and carries the in-doubt button (it left the band). Published
  // only when the text, the side or the count changes, so a tick that changes nothing re-renders nothing.
  const shortBits = rich ? shortHeadlineParts(p.tally, p.inDoubt, declaredOf(p.seats.values()), p.countedPct) : [{ text: p.headline }]
  const shortText = headlineText(shortBits)
  const shortSide = shortBits.find((b) => b.side)?.side
  const handleCounted = `${countedShare(pct)} ${countedWord(declared)}`
  const doubtRef = useRef(p.onShowDoubt)
  useEffect(() => {
    doubtRef.current = p.onShowDoubt
  })
  useEffect(() => {
    setPhoneBit('handle', { parts: shortBits, counted: handleCounted, inDoubt: closeCount, showDoubt: () => doubtRef.current?.() })
    // shortBits is rebuilt every render; its text and side are the whole of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortText, shortSide, closeCount, handleCounted])
  useEffect(() => () => setPhoneBit('handle', null), [])

  return (
    <header className="band">
      <div className="band__top">
        <div className="band__id">
          <h1 className="band__title">Victoria Votes 2026</h1>
          {p.dataLabel && (
            <span className="badge badge--replay" data-testid="data-label" title="These are not live results">
              {p.dataLabel === 'Replay' ? (
                <>
                  Replay<span className="badge__more">: 2022, not live</span>
                </>
              ) : (
                <>
                  {p.dataLabel}
                  <span className="badge__more">: not real results</span>
                </>
              )}
            </span>
          )}
        </div>
        {p.asAt && (
          // One status pill (ADR 0024): the live region that tells Live, Paused, Final and Rewinding apart. It sits after a rule so it never reads as part of the Replay or Trial badge.
          <div className="band__state">
            <span className="state-pill" data-state={p.timeState} data-testid="as-at" role="status">
              {showDot && <span className="state-pill__dot" aria-hidden />}
              <span className="state-pill__long">{words.long}</span>
              <span className="state-pill__short">{words.short}</span>
              <b className="state-pill__time">{p.asAt}</b>
            </span>
          </div>
        )}
        {focus && (
          <button type="button" className="btn-ghost tally__clear" data-testid="tally-clear" aria-label={`Clear the ${focusName(focus)} highlight`} title="Clear highlight" onClick={clearAll}>
            <span aria-hidden>Clear</span>
          </button>
        )}
        {/* Phone only (CSS): the desktop figures above are hidden, so the in-doubt count rides as a pill hanging under the band, beside the "i" (VE-106). */}
        {closeCount > 0 && (
          <button type="button" className="band__doubt-pill" data-testid="band-doubt-pill" aria-label={closeAria} onClick={p.onShowDoubt}>
            <b>{closeCount}</b> close
          </button>
        )}
      </div>
      <p className="band__headline" data-testid="headline" aria-live="polite" aria-atomic="true">
        {bits.map((b, i) =>
          'side' in b && b.side ? (
            <b key={i} className="band__who" style={{ color: css(legibleOn(pal.party[sideParty(b.side)], pal.paper)) }}>{b.text}</b>
          ) : (
            <span key={i}>{b.text}</span>
          ),
        )}
      </p>
      {/* VE-118 (FB-120): on desktop the band is a grid; the stats span the title row and the headline row, so centring them puts them at the midpoint between the band's top and the tally bar, in CSS alone. */}
      <div className="band__stats band__desk">
        <span className="band__cell" title="Votes counted as a share of enrolment (turnout, once every seat is declared)"><b><Roll value={Math.round(p.countedPct)} />%</b> {countedWord(allDeclared(p.seats.values()))}</span>
        {closeShown && !(p.inDoubt === 0 && p.timeState === 'final') && <button type="button" className="band__cell band__cell--btn" data-testid="band-doubt" title="Close seats, out of 88: show them" aria-label={closeAria} onClick={p.onShowDoubt}><b><Roll value={p.close} /></b> close</button>}
      </div>
      <ReadingKey sourceNote={p.sourceNote} className="band__desk" pollNote={p.pollNote} colourInfo={p.colourInfo} final={declared} />
      {/* VE-227 (finding 6): before the first figures the party chips would read "Labor 0, Coalition 0"; CSS hides them and keeps the bar and the 45 mark. */}
      <div className="tl" data-nofigures={p.asAt === null || undefined}>
        <div className="tl__bar" role="group" aria-label={`${aria.join(', ') || 'No figures yet'}. ${MAJORITY} seats to win.`}>
          {left.map((x) => seg(x, 'left'))}
          <span className="tl__gap" aria-hidden style={{ flexGrow: none }} title={none > 0 ? `${none} seats with no figures yet` : undefined} />
          {right.map((x) => seg(x, 'right'))}
          <span className="tl__line" style={{ left: majority }} aria-hidden />
        </div>
        <span className="tl__maj" style={{ left: majority }} aria-hidden title={`${MAJORITY} seats to govern alone`}>{MAJORITY}</span>
        <div className="tl__key">
          {chip('ALP', 'Labor', null, ['ALP'], alp, { testId: 'tally-alp' })}
          {grn > 0 && chip('GRN', 'Greens', null, ['GRN'], grn, {})}
          {/* VE-131: One Nation has its own chip in its own orange, even on no seats; on a phone a zero chip would wrap the key onto a second line, so there it waits for a first seat, as the Greens do. */}
          {chip('ONP', 'One Nation', 'ON', ['ONP'], onp, { testId: 'tally-onp', wideOnlyAtZero: true })}
          {othersHeld.length === 1 && (() => {
            const q = othersHeld[0]!
            const [full, short] = otherName(q, seatsOf(p.tally, q))
            return chip(q, full, short, [q], seatsOf(p.tally, q), {})
          })()}
          {othersHeld.length > 1 && group('XB', 'Others', othersHeld)}
          <span className="tl__fill" />
          {group('COA', 'Coalition', COALITION, 'tally-coa')}
        </div>
      </div>
      {/* The counted share: a hairline along the bottom edge of the band. */}
      <span className="band__edge" aria-hidden title="Votes counted">
        <span style={{ width: `${pct}%` }} />
      </span>
      {/* The seats for the party under the pointer or chosen: a small card under the band, so the bar keeps its width. */}
      {detail && (
        <p className="tally__detail" data-testid="tally-detail" data-doubt={shown === DOUBT || undefined}>
          <b>{summary.head}</b>{summary.rest}
        </p>
      )}
    </header>
  )

  /** One party's part of the bar: its solid, likely and early seats in the three tones the map uses (VE-127). The whole part picks the party. */
  function seg(x: Seg, side: 'left' | 'right'): ReactNode {
    const name = x.party === 'IND' ? 'Independent' : PARTY_NAMES[x.party]
    const on = x.n > 0
    const Tag = on ? 'button' : 'span'
    // Solid sits at the outer end: first on the left, last on the right (mirrored).
    const order: LeadStep[] = side === 'left' ? [2, 1, 0] : [0, 1, 2]
    return (
      <Tag
        key={x.key}
        className="tl__seg tl__seg--steps"
        data-dim={!inShown([x.party], null)}
        data-empty={!on}
        data-focus={x.party}
        title={on ? `${name}: ${x.n} (${stepWords(x.steps, declared)})` : undefined}
        style={{ width: `${(x.n / SEATS) * 100}%` }}
        {...(on ? target(x.party, `${name} in the bar: ${x.n} seats (${stepWords(x.steps, declared)}). Highlight on the views`) : { 'aria-hidden': true })}
      >
        {on && order.filter((s) => x.steps[s] > 0).map((s) => <span key={s} className="tl__step" data-step={s} style={{ flexGrow: x.steps[s], background: css(stepRgb(x.party, s, pal)) }} />)}
      </Tag>
    )
  }
}
