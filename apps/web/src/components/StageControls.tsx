import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CountBadge } from './CountBadge'
import { createPortal } from 'react-dom'
import type { PartyBucket } from '@vic26/schema'
import { usePhoneBits, setPhoneBit } from '../state/phoneBits'
import { useMotion } from '../state/motion'
import { COLOURS, lvcRgb, EMPTY_ALPHA, EMPTY_STRIPE, HATCH_BASE, HATCH_BASE_ALPHA, HATCH_STRIPE, SWING_MIN_PCT, TRUST_NA, TRUST_NA_ALPHA, TRUST_PALETTE } from '../derive/colour'
import { PARTY_NAMES } from '../parties'
import { signedNet, type PartyNet } from '../derive/gains'
import { netChip, netSentence } from '../derive/netChange'
import { usePalette } from '../theme/theme'
import { LEAD_STEP_WORDS, partyCss, stepRgb, type LeadStep } from '../views/encoding'
import { css } from '../theme/theme'
import type { Colour, Shape } from '../state/view'
import { PlacesInfo, PlacesKey } from './booths/PlacesKey'
import type { Tally } from '../derive/seats'
import type { Focus } from '../derive/focus'
import { cycleIndex, cycleStep, keyParties, msToNextStep } from './leaderKeyParties'
import { GainsArt, LeaderArt, LvcArt, PlacesArt, SwingArt } from './info/MapLegendArt'
import { artFor } from './info/legendArt'
import '../styles/leader.css'


const SHAPES: readonly { shape: Shape; label: string }[] = [
  { shape: 'map', label: 'Map' },
  { shape: 'hex', label: 'Hex' },
]

interface Props {
  shape: Shape
  onShape: (s: Shape) => void
}

/**
 * The shape control at the stage's top left (ADR 0018): what the 88 seats are drawn as. A radio group, so one stop
 * in the tab order (on the chosen shape) and the arrow keys move and choose, as a screen reader user expects.
 * The colour chips (ColourChips, below) sit at the stage's bottom left.
 */
export function StageControls({ shape, onShape }: Props) {
  const group = useRef<HTMLDivElement>(null)

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const at = SHAPES.findIndex((s) => s.shape === shape)
    const next = SHAPES[(at + step + SHAPES.length) % SHAPES.length]!
    onShape(next.shape)
    group.current?.querySelector<HTMLButtonElement>(`[data-shape="${next.shape}"]`)?.focus()
  }

  // The inset's own switch is gone (VE-119): the inset minimises to an icon in its own corner (HexInset).
  return (
    <div ref={group} className="segmented stage-controls" role="radiogroup" aria-label="Shape" onKeyDown={onKey}>
      {SHAPES.map((s) => (
        <button key={s.shape} type="button" role="radio" data-shape={s.shape} aria-checked={shape === s.shape} tabIndex={shape === s.shape ? 0 : -1} onClick={() => onShape(s.shape)}>
          {s.label}
        </button>
      ))}
    </div>
  )
}

/** VE-153: the Leader colour once the count is over. */
const COLOUR_INFO_FINAL = 'Each seat takes the colour of the party that won it. Every seat has been declared by the VEC.'

/** VE-156: what counts as changing hands, in plain words. Three short lines in the "i" (ColourInfo); the first is the colour's own sentence. */
const GAINS_INFO = 'A seat whose leader differs from the 2022 winner.'
const GAINS_MORE = [
  'Prahran and Narracan are compared with their later contests (the 2025 by-election and the 2023 supplementary election).',
  'Until the VEC declares a seat its lead can still change. A paler colour means the lead is not yet certain.',
]

const COLOUR_INFO: Record<Colour, string> = {
  // VE-303: the legend above draws the tick (Declared), so the sentence no longer repeats it.
  leader: 'Each seat takes its leader’s colour: faint early, stronger once likely, solid once certain or won.',
  trust: `Colour is the swing to or from Labor since 2022, set against how close the seat is. Swing shows once ${SWING_MIN_PCT}% of a seat is counted.`,
  gains: GAINS_INFO,
  lvc: 'Labor against the Liberals or Nationals: red where Labor leads, blue where the Coalition leads, darker the bigger the lead (under 2, 2 to 6, 6 to 12, 12 to 20, 20 points or more). Pale seats are not Labor v Coalition: another pair is in the final two, or that pair may be wrong.',
  certainty: "How sure we are of each seat's leader. Blurred seats have little counted yet. Votes to come include early and postal votes, which arrive later.",
}

/** Why a chip is switched off (VE-104): its title, and what a screen reader hears. */
export const TRUST_WAIT = 'Swing shows from about 9 pm, once seats are half counted'
// S3 (VE-165): the reason is no longer a standing line; it shows on hover (title) and when the greyed chip is tapped.
const COLOUR_KEY_CERTAINTY = 'Blurred = little counted · ✓ = declared'

/**
 * Leader's key (VE-127, FB-126): the three steps of one party ramp (early lead, likely, won). The party swatches left in
 * VE-166 (FB-196): the tally above is the party key. The ramp is drawn in Labor's colour so it never reshuffles through the night.
 * Once every seat is declared there is nothing to explain (the steps and the tick both go, FB-195), so the key renders
 * nothing and ColourChips drops its line, leaving no empty box.
 */
const STEP_LABELS: readonly { step: LeadStep; text: string }[] = [
  { step: 0, text: LEAD_STEP_WORDS[0] },
  { step: 1, text: LEAD_STEP_WORDS[1] },
  { step: 2, text: LEAD_STEP_WORDS[2] },
]
/** VE-273: how long each party's ramp stays on the key (VE-308: 4 s, Simon); the colour cross-fades in leader.css. */
export const KEY_CYCLE_MS = 4000


/**
 * The party whose ramp the Leader key shows now. VE-312: the step comes from the wall clock (one change every
 * KEY_CYCLE_MS on the same boundary), so every copy of the key, the desktop strip and the phone sheet alike, and one
 * mounted mid-cycle, changes in step. A timeout re-arms to the next boundary; a hidden tab skips its renders.
 */
function useKeyParty(parties: readonly PartyBucket[]): PartyBucket {
  const [step, setStep] = useState(() => cycleStep(Date.now(), KEY_CYCLE_MS))
  const n = parties.length
  useEffect(() => {
    if (n < 2) return
    let id = 0
    const arm = () => {
      id = window.setTimeout(() => {
        if (!document.hidden) setStep(cycleStep(Date.now() + 1, KEY_CYCLE_MS))
        arm()
      }, msToNextStep(Date.now(), KEY_CYCLE_MS))
    }
    arm()
    return () => window.clearTimeout(id)
  }, [n])
  return parties[cycleIndex(step, n)] ?? 'ALP'
}

function LeaderKey({ noFigures, earlyOnly, tally, pick }: { noFigures?: boolean; earlyOnly?: boolean; tally?: Tally; pick?: Focus | null }) {
  const pal = usePalette()
  // VE-312 (Simon): the chips cycle the main parties; reduced motion (the device's setting or the Animations switch) holds Labor.
  const motion = useMotion()
  const still = motion.mode === 'reduced' || motion.deviceLess
  const parties = tally ? keyParties(tally, pick ?? null, still) : (['ALP'] as PartyBucket[])
  const party = useKeyParty(parties)
  return (
    <>
      {STEP_LABELS.map(({ step, text }) => (
        <span key={step} className={`lkey__item lkey__step${earlyOnly && step > 0 ? ' lkey__item--late' : ''}`} data-step={step}>
          <i className="lkey__sw lkey__sw--ramp" data-party={party} style={{ background: css(stepRgb(party, step, pal)) }} aria-hidden />
          {text}
        </span>
      ))}
      {/* VE-226 (finding 6): the tick means declared everywhere, so it has its own entry rather than sitting beside "certain". */}
      <span className={`lkey__item lkey__tick${earlyOnly ? ' lkey__item--late' : ''}`} data-testid="key-declared">
        <b className="lkey__ticksym" aria-hidden>{'✓'}</b> declared
      </span>
      {/* VE-254 (F2): grey at rest was unnamed. A striped pale swatch, drawn as the seats are, says "No figures yet" while any seat has none. */}
      {noFigures && (
        <span className="lkey__item" data-testid="key-no-figures">
          <i className="lkey__sw lkey__sw--empty" style={{ backgroundColor: `color-mix(in srgb, var(--map-no-result) ${EMPTY_ALPHA * 100}%, var(--map-paper))`, backgroundImage: `repeating-linear-gradient(45deg, ${EMPTY_STRIPE} 0 1.5px, transparent 1.5px 4px)` }} aria-hidden />
          No figures yet
        </span>
      )}
    </>
  )
}

/**
 * Swing's key at rest (FB-127, FB-128): the three swing colours in a row with plain ends, and what depth means. The full
 * 3 x 3 grid and the "shows once 50% is counted" rule are behind the "i".
 */
/** The at-rest key's three swatches, left to right: toward Labor, little change (paler neutral), toward the Coalition. */
const SWING_KEY_SWATCHES = [TRUST_PALETTE[2]![2]!, TRUST_PALETTE[1]![1]!, TRUST_PALETTE[2]![0]!]
/** A seat that is not Labor v Coalition: very pale paper, as the map draws it (derive/colour.ts trustNaRgb). */
const NA_SWATCH = `color-mix(in srgb, ${TRUST_NA} ${TRUST_NA_ALPHA * 100}%, var(--map-paper))`

/** VE-297: Labor v Coalition's key. A light, middle and dark step of each ramp; the five cuts are on the map's seats and in the "i" sentence. */
function LvcKey() {
  const pal = usePalette()
  const ramp = (labor: boolean) => (
    <span className="lkey__item" aria-hidden>
      {([0, 2, 4] as const).map((s) => (
        <i key={s} className="lkey__sw" style={{ background: css(lvcRgb(labor, s, pal)) }} />
      ))}
    </span>
  )
  return (
    <>
      <span className="lkey__item" data-testid="key-lvc-labor">Labor ahead</span>
      {ramp(true)}
      <span className="lkey__item" data-testid="key-lvc-coalition">Coalition ahead</span>
      {ramp(false)}
      <span className="lkey__item">darker = larger margin</span>
      <span className="lkey__item" data-testid="key-other-contest" title="Another pair is in the final two">
        <i className="lkey__sw lkey__sw--empty" style={{ backgroundColor: NA_SWATCH }} aria-hidden />
        Not Labor v Coalition
      </span>
      {/* Always named: App's "no figures" flag counts seats with no leader, not seats with no two-candidate count. */}
      <span className="lkey__item" data-testid="key-no-figures">
          <i className="lkey__sw lkey__sw--empty" style={{ backgroundColor: `color-mix(in srgb, var(--map-no-result) ${EMPTY_ALPHA * 100}%, var(--map-paper))`, backgroundImage: `repeating-linear-gradient(45deg, ${EMPTY_STRIPE} 0 1.5px, transparent 1.5px 4px)` }} aria-hidden />
          No figures yet
      </span>
    </>
  )
}

function SwingKey({ tooEarly }: { tooEarly?: boolean }) {
  // VE-142 (FB-184): two plain ends and the swatches; "darker = safer" lives in the 3 x 3 key behind the "i". The hatch is keyed only while a hatched seat is on screen.
  return (
    <>
      <span className="lkey__item">Toward Labor</span>
      {/* VE-293 (FB-289): the arrows lens's order and words, red then a clearly paler middle (little change) then blue. */}
      <span className="lkey__item" aria-hidden>
        {SWING_KEY_SWATCHES.map((c) => (
          <i key={c} className="lkey__sw" style={{ background: c }} />
        ))}
      </span>
      <span className="lkey__item">Toward the Coalition</span>
      {/* VE-224: about half the seats may not be Labor v Coalition on the night, so grey is named at rest. */}
      <span className="lkey__item" data-testid="key-other-contest">
        <i className="lkey__sw lkey__sw--empty" style={{ backgroundColor: NA_SWATCH }} aria-hidden />
        Not Labor v Coalition
      </span>
      {/* VE-221 (B5): one scale at rest. "Little change" (VE-168) and the safe-or-close axis are in the "i" (TrustKey). */}
      {tooEarly && (
        <span className="lkey__item" data-testid="key-too-early">
          <i className="lkey__sw" style={{ backgroundColor: `color-mix(in srgb, ${HATCH_BASE} ${HATCH_BASE_ALPHA * 100}%, transparent)`, backgroundImage: `repeating-linear-gradient(45deg, ${HATCH_STRIPE} 0 2px, transparent 2px 5px)` }} aria-hidden />
          Too early
        </span>
      )}
    </>
  )
}

/** The 3 x 3 Swing key: how close the seat is down, the swing across, in plain words. Cells use the same palette as the seats. */
function TrustKey() {
  return (
    <div className="ckey">
      <div className="ckey__plot">
        <div className="ckey__yaxis" aria-hidden>
          <span>Safe seat</span>
          <span>Close seat</span>
        </div>
        <div>
          <div className="ckey__grid" aria-hidden>
            {[2, 1, 0].flatMap((m) => [2, 1, 0].map((s) => <span key={`${m}${s}`} style={{ background: TRUST_PALETTE[m]![s] }} />))}
          </div>
          <div className="ckey__xaxis" aria-hidden>
            <span>Toward Labor</span>
            <span>Toward the Coalition</span>
          </div>
        </div>
      </div>
      <ul className="ckey__list">
        <li>Across: Labor gained votes since 2022 (red), little change (pale), or lost votes to the Coalition (blue). Down: how close the contest is.</li>
        <li>
          <span className="ckey__sw ckey__sw--hatch" style={{ backgroundColor: `color-mix(in srgb, ${HATCH_BASE} ${HATCH_BASE_ALPHA * 100}%, transparent)`, backgroundImage: `repeating-linear-gradient(45deg, ${HATCH_STRIPE} 0 2px, transparent 2px 5px)` }} aria-hidden /> Hatched: too early to compare.
        </li>
        <li>
          <span className="ckey__sw" style={{ backgroundColor: NA_SWATCH, border: '1px solid var(--color-border-strong)' }} aria-hidden /> Pale, outlined: not Labor v Coalition, so no swing to show.
        </li>
      </ul>
    </div>
  )
}

interface GainsProps {
  /** Net change per party over the seats that changed hands, biggest first (derive/gains.ts). */
  nets: readonly PartyNet[]
  /** The party tapped, or null: only its gains stay on the stage and in the cards. */
  party: PartyBucket | null
  onParty: (p: PartyBucket | null) => void
}

/**
 * Gains' key (VE-156, FB-188, FB-192): the net change per party in one line, each party a button. Tapping one keeps only the
 * seats it gained; tapping again clears. Losses are read from the net line, so a party with no gains says so in words.
 */
function GainsKey({ nets, party, onParty }: GainsProps) {
  const pal = usePalette()
  const tapped = party === null ? null : nets.find((n) => n.party === party)
  return (
    <>
      <span className="lkey__item gkey__lead">Net change since 2022:</span>
      {nets.map((n) => (
        <button key={n.party} type="button" className="lkey__item gnet" data-party={n.party} title={netSentence(n)} aria-label={`${netSentence(n)}, net ${signedNet(n.net)}`} data-sign={n.net > 0 ? 'up' : n.net < 0 ? 'down' : 'flat'} aria-pressed={party === n.party} onClick={() => onParty(party === n.party ? null : n.party)}>
          <i className="lkey__sw" style={{ background: partyCss(n.party, pal) }} aria-hidden />
          {PARTY_NAMES[n.party]} <b>{netChip(n)}</b>
        </button>
      ))}
      {/* VE-167: the panel's line ("Greens gained 4, lost 0") says what the filter shows; only a party with nothing to light needs words here, or a tap on a phone would seem to do nothing. */}
      {party !== null && !(tapped && tapped.gains > 0) && (
        <span className="lkey__item gkey__note" data-testid="gains-note" role="status">
          {PARTY_NAMES[party]} gained no seats.
        </span>
      )}
    </>
  )
}

function CertaintyKey() {
  return (
    <div className="ckey">
      <div className="ckey__chips" aria-hidden>
        <span className="ckey__chip ckey__chip--blur">Blurred</span>
        <span className="ckey__chip">Sharp</span>
      </div>
      <p>Under 30% counted is blurred, 30 to 70% softer, 70% and over sharp. Blur is not a win probability.</p>
    </div>
  )
}

/**
 * What the colour on the stage means, in a sentence and a tiny key. It sits first in the one "i" (VE-141), so the
 * stage has a single "i" instead of a colour one beside the reading key. VE-303: an illustrated legend leads it.
 */
export function ColourInfo({ colour, placesOn, final, noFaint, tally }: { colour: Colour; placesOn: boolean; /** Every seat is declared (VE-153): the Leader words talk of results, not leads. */ final?: boolean; /** No dot is waiting, or "faint" would mean another seat's (VE-168): Polling places says nothing about faint. */ noFaint?: boolean; /** VE-303: the Leader legend cycles the parties that lead, as the map key does. */ tally?: Tally }) {
  // VE-302: the "i" follows the colour, so it opens by naming the view (the chip's own word, so the two match).
  const view = placesOn ? 'Polling places' : colour === 'gains' && final ? 'Changed hands' : (COLOURS.find((c) => c.colour === colour)?.label ?? 'How sure')
  const heading = <p className="key__colour-h" data-testid="colour-info-heading"><b>About this map: {view}</b></p>
  const art = artFor(colour, placesOn, final === true)
  return placesOn ? (
    <>
      {heading}
      <PlacesArt final={noFaint ?? final} />
      <PlacesInfo />
    </>
  ) : (
    <>
      {heading}
      {art === 'leader' && <LeaderArt tally={tally} />}
      {art === 'swing' && <SwingArt />}
      {art === 'lvc' && <LvcArt />}
      {art === 'gains' && <GainsArt />}
      <p>{final && colour === 'leader' ? COLOUR_INFO_FINAL : COLOUR_INFO[colour]}</p>
      {colour === 'gains' && GAINS_MORE.map((t) => <p key={t}>{t}</p>)}
      {colour === 'trust' && <TrustKey />}
      {colour === 'certainty' && <CertaintyKey />}
    </>
  )
}

interface ColourProps {
  colour: Colour
  onColour: (c: Colour) => void
  /** Every leading seat is declared (VE-142, VE-166): the Leader key has nothing left to show and its line is not drawn. */
  declared?: boolean
  /** Polling places: no dot is waiting (Final, Rewind) or a seat is picked, so "Faint = none yet" is not drawn (VE-168, finding 17). */
  noFaint?: boolean
  /** A hatched (too early) seat is on screen, so the Swing key names the hatch. */
  tooEarly?: boolean
  /** VE-254 (F2): some seat has no figures yet, so the Leader key names the striped fill. */
  noFigures?: boolean
  /** VE-257: some seat has no figures and every lead is still an early lead. On a phone the Leader key then keeps "Early lead" (the one label saying the pale colours are not wins) and "No figures yet", and leaves out Likely, Won or certain and the tick, which name nothing on the map yet (CSS only, so desktop is unchanged). */
  earlyOnly?: boolean
  /** VE-221 (B8): the Hex is printing "% counted" figures, so the key says what the number is. */
  hexNumbers?: boolean
  /** "About 1.2 million votes to come": shown with How sure (VE-92). */
  stillLine?: string
  /** Chips that do not apply right now (VE-104): Swing until enough seats are far enough counted. (How sure is no longer a chip, VE-127.) */
  off?: { trust?: boolean; certainty?: boolean; gains?: boolean }
  /** Gains (VE-156): the net change line and the party tapped in it. Left out, the Gains key is empty. */
  gains?: GainsProps
  /**
   * The Polling places chip (VE-77c), beside the colour group. It is not a colour (the seats go quiet and the booths are
   * drawn over them), so it is its own toggle and the group keeps its two radios. Left out where there are no booth
   * results to draw (the live feed until the 2026 booth layer is published), so the chip is never offered empty.
   */
  places?: { on: boolean; onPick: () => void; parties?: readonly PartyBucket[] }
  /** VE-273: seat totals and the tally pick (or hover preview), so the Leader key shows every party's ramp in turn, or the picked one. */
  tally?: Tally
  pick?: Focus | null
}

/**
 * The colour chips at the stage's bottom left (ADR 0018): how the seats are filled, on either shape. Same radio-group
 * pattern as the shape control. The one "i" (ReadingKey) carries the active colour's text first (VE-141).
 */
export function ColourChips({ colour, onColour, declared, noFaint, tooEarly, noFigures, earlyOnly, hexNumbers, stillLine, off, gains, places, tally, pick }: ColourProps) {
  // VE-144a: on a phone the chips live in the View sheet. While it is open the row (and the reason a chip is off) is drawn
  // into its slot; the same component and handlers, so choosing, the arrow keys and Polling places work as on the stage.
  const { colourSlot, moreWays } = usePhoneBits()
  useEffect(() => {
    setPhoneBit('stillLine', !places?.on && colour === 'leader' && stillLine ? stillLine : null)
    return () => setPhoneBit('stillLine', null)
  }, [stillLine, colour, places?.on])
  const isOff = (c: Colour) => (c === 'trust' && !!off?.trust) || (c === 'gains' && !!off?.gains)
  // VE-196 (FB-227): a chip that cannot open yet is not drawn at all, so there is no greyed chip and no reason to give.
  const offered = COLOURS.filter((c) => !isOff(c.colour))
  const group = useRef<HTMLDivElement>(null)
  const placesOn = places?.on === true
  // VE-166 (FB-196): at Final the Leader key has no steps and no tick, so its line goes rather than leaving an empty box.
  const keyEmpty = !placesOn && colour === 'leader' && declared === true

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    // Chips that are not offered are not in the group, so the arrows only visit what is drawn.
    const on = offered
    const at = on.findIndex((c) => c.colour === colour)
    const next = on[(at + step + on.length) % on.length]
    if (!next) return
    onColour(next.colour)
    group.current?.querySelector<HTMLButtonElement>(`[data-colour="${next.colour}"]`)?.focus()
  }

  const row = (
      <div className="colour-chips__row">
        {/* While the dots are on, the colour underneath is kept but not shown as chosen (booths.css), so one thing reads as picked. */}
        <div ref={group} className="segmented" role="radiogroup" aria-label="Colour" data-muted={placesOn || undefined} onKeyDown={onKey}>
          {offered.map((c) => (
            <button key={c.colour} type="button" role="radio" data-colour={c.colour} aria-checked={colour === c.colour} tabIndex={colour === c.colour ? 0 : -1} onClick={() => onColour(c.colour)}>
              {c.colour === 'gains' && declared ? 'Changed hands' : c.label}
            </button>
          ))}
        </div>
        {places && (
          <div className="segmented segmented--one">
            <button type="button" data-places="" aria-pressed={placesOn} onClick={places.onPick}>
              Polling places
            </button>
          </div>
        )}
        {/* VE-210 (FB-248): a door to the other views, not a colour mode, so it is outlined, has a chevron and is never selected.
            On a phone the View sheet has its own row, so the chip is drawn on the stage only (colourSlot is null there). */}
        {moreWays && !colourSlot && (
          <button type="button" className="more-ways-chip" data-testid="more-ways-chip" aria-haspopup="dialog" aria-label={`More ways to see it, ${moreWays.count} views`} onClick={moreWays.open}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false">
              <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9" y="9" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span aria-hidden>More ways<CountBadge n={moreWays.count} /></span>
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden focusable="false"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>
  )
  return (
    <div className="colour-chips">
      {colourSlot ? createPortal(row, colourSlot) : row}
      {!keyEmpty && (
      <p className="colour-key" data-testid="colour-key">
        {placesOn ? <PlacesKey parties={places?.parties} final={noFaint ?? declared === true} /> : colour === 'leader' ? <LeaderKey noFigures={noFigures} earlyOnly={earlyOnly} tally={tally} pick={pick} /> : colour === 'trust' ? <SwingKey tooEarly={tooEarly} /> : colour === 'lvc' ? <LvcKey /> : colour === 'gains' ? <GainsKey nets={gains?.nets ?? []} party={gains?.party ?? null} onParty={gains?.onParty ?? (() => {})} /> : COLOUR_KEY_CERTAINTY}
        {/* VE-221 (B8): the hexes print a bare figure, so the key says what it is wherever one shows. */}
        {!placesOn && hexNumbers && <span className="lkey__item lkey__hexnum" data-testid="key-hex-number">Number: % counted</span>}
      </p>
      )}
      {!placesOn && colour === 'leader' && stillLine && (
        <p className="colour-key colour-key--still" data-testid="still-to-come">{stillLine}</p>
      )}
    </div>
  )
}

interface ViewProps {
  shape: Shape
  onShape: (s: Shape) => void
}

/**
 * Narrow screens (ADR 0018): one "View" button at the stage's top left stands in for the shape control, which would
 * otherwise crowd a phone. It opens a small popover (VE-144a) holding everything that left the stage: the shape radio group,
 * the colour chips (drawn in by ColourChips through a portal), "More ways to see it" and "Rewind the night".
 * Choosing, Escape or a tap outside closes it and focus goes back to the button. On desktop CSS hides the button, so
 * nothing changes there.
 */
export function ViewSheet({ shape, onShape }: ViewProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const { moreWays, rewind } = usePhoneBits()
  // The slot is a portal target, so a click inside it never reaches this component's React handlers: listen on the node.
  const slotRef = useCallback((el: HTMLDivElement | null) => setPhoneBit('colourSlot', el), [])

  // Focus goes back to the button after the sheet has unmounted: a radio's own arrow-key handler focuses its next
  // sibling after onChoose runs, and that would otherwise win and leave focus on a removed element.
  const refocus = useRef(false)
  const close = (andRefocus: boolean) => {
    refocus.current = andRefocus
    setOpen(false)
  }
  useEffect(() => {
    if (!open && refocus.current) {
      refocus.current = false
      btn.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    // Keyboard users land on the chosen shape; the radio group then has its usual one tab stop.
    wrap.current?.querySelector<HTMLButtonElement>('[role=radio][aria-checked=true]')?.focus()
    const slot = wrap.current?.querySelector('.view-sheet__colour')
    // Closed on the next task, not now: unmounting the sheet here would drop the click before React's own handler on the chip ran.
    const onPick = (e: Event) => {
      if ((e.target as Element).closest('button')) setTimeout(() => close(true), 0)
    }
    slot?.addEventListener('click', onPick)
    const onDown = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // An open "i" inside the sheet takes the first Escape; the next one closes the sheet.
      if (wrap.current?.querySelector('.info__pop')) return
      close(true)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      slot?.removeEventListener('click', onPick)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="view-sheet" ref={wrap}>
      <button ref={btn} type="button" className="view-sheet__btn" aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden focusable="false">
          <path d="M8 1.5 1.5 5 8 8.5 14.5 5 8 1.5ZM1.5 8 8 11.5 14.5 8M1.5 11 8 14.5 14.5 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        View
      </button>
      {open && (
        <div className="view-sheet__pop" id={id} role="dialog" aria-label="View">
          <h4 className="view-sheet__h">Shape</h4>
          <StageControls shape={shape} onShape={(s) => { onShape(s); close(true) }} />
          <h4 className="view-sheet__h">Colour</h4>
          {/* ColourChips draws its row in here; picking a colour or Polling places closes the sheet, as picking a shape does. */}
          <div className="view-sheet__colour" ref={slotRef} />
          <div className="view-sheet__more">
            {moreWays && (
              <button type="button" className="view-sheet__act view-sheet__act--more" data-testid="view-more-ways" aria-haspopup="dialog" onClick={() => { close(false); moreWays.open() }}>
                {/* VE-210 (phone): the chip strip left the phone's stage (VE-144a), so this row is the door; the grid icon and chevron make it read as one. */}
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden focusable="false">
                  <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <rect x="9" y="9" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                <span>More ways to see it ({moreWays.count})</span>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
            {rewind && (
              <button type="button" className="view-sheet__act" data-testid="view-rewind" onClick={() => { close(false); rewind.toggle() }}>
                Rewind the night
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
