/**
 * The stage's colour chips (ADR 0018): how the 88 seats are filled, whatever the shape. Leader is the shared party
 * encoding; Trust (M2) and Certainty (L1) come from the bake-off lenses in prototypes/lenses and keep their cuts so
 * the app and the prototypes agree. Everything here is pure: a seat in, a colour and a blur band out.
 */
import type { DistrictStatic, PartyBucket } from '@vic26/schema'
import { leaderRgb, leadStep, seatRgb, stepRgb, type Rgb } from '../views/encoding'
import type { Palette } from '../theme/theme'
import { GAINS_KEEP, gainShown, keptGain } from './gains'
import { swingOf } from './list'
import type { Colour } from '../state/view'
import type { Seat } from './seats'

export type { Colour }
export const COLOURS: readonly { colour: Colour; label: string }[] = [
  { colour: 'leader', label: 'Leader' },
  // The id stays `trust` (URL, state, types); only the word a viewer reads changed (FB-127).
  { colour: 'trust', label: 'Swing' },
  // VE-156: which seats changed hands. Offered once one has (StageControls, App); the id is the URL value too.
  { colour: 'gains', label: 'Changing hands' },
  // How sure is folded into Leader's three steps (VE-127, FB-143). The `certainty` colour and its blur stay in the code, reachable from state but not offered.
]

/** Counted steps (VE-97, prototype variant C): under 25%, 25 to 50, 50 to 75, 75 and over. A finished seat ends near 85 to 90%, so the top step is "most counted", never "all". */
export const COUNTED_EDGES = [25, 50, 75] as const
/** Strength of the Counted ink over the paper at each step. */
export const COUNTED_ALPHA = [0.3, 0.55, 0.8, 1] as const
export const COUNTED_LABELS = ['Under 25%', '25 to 50%', '50 to 75%', '75% or more'] as const
export type CountedStep = 0 | 1 | 2 | 3
export const countedStep = (pct: number | null | undefined, cuts: readonly [number, number, number] = COUNTED_EDGES): CountedStep | null =>
  pct === null || pct === undefined ? null : pct < cuts[0] ? 0 : pct < cuts[1] ? 1 : pct < cuts[2] ? 2 : 3

/** Where the four Counted steps cut, and what each is called (VE-170). */
export interface CountedScale {
  /** Compared with a seat's raw percentage, as COUNTED_EDGES is. */
  cuts: readonly [number, number, number]
  labels: readonly [string, string, string, string]
  /** The key's own short forms. */
  short: readonly [string, string, string, string]
}
export const NIGHT_SCALE: CountedScale = {
  cuts: COUNTED_EDGES,
  labels: COUNTED_LABELS,
  short: ['<25%', '25-50', '50-75', '75%+'],
}

const span = (from: number, to: number): string => (from === to ? `${from}%` : `${from} to ${to}%`)

/**
 * The Counted steps for the seats on show (VE-170, review finding 7). Through the night they are the fixed 25, 50, 75.
 * Once every seat is declared the figure is turnout and 87 of 88 seats sit above 75, so the steps are spread over the
 * range the seats really have: whole-number edges, four steps of about equal width, from the lowest seat to the highest.
 * A seat that rounds to zero is left out so one with no figures cannot stretch the range. A seat sorts by the number its
 * hex prints (the rounded percentage), so each cut sits half a point below its whole-number edge.
 */
export function countedScale(pcts: Iterable<number | null | undefined>, final: boolean): CountedScale {
  if (!final) return NIGHT_SCALE
  const whole: number[] = []
  for (const p of pcts) {
    const r = p === null || p === undefined || !Number.isFinite(p) ? 0 : Math.round(p)
    if (r > 0) whole.push(r)
  }
  if (whole.length === 0) return NIGHT_SCALE
  const lo = Math.min(...whole)
  const hi = Math.max(...whole)
  const width = hi - lo + 1
  // max(i, ...) keeps the edges strictly rising even when every seat has the same figure, so no step is ever empty or repeated.
  const edge = (i: number): number => lo + Math.max(i, Math.round((i * width) / 4))
  const [e1, e2, e3] = [edge(1), edge(2), edge(3)] as const
  const ranges: [number, number][] = [[lo, e1 - 1], [e1, e2 - 1], [e2, e3 - 1], [e3, hi]]
  const label = ([a, b]: [number, number]): string => (b < a ? `${a}% or more` : span(a, b))
  const shortOf = ([a, b]: [number, number]): string => (b < a ? `${a}%+` : a === b ? `${a}%` : `${a}-${b}`)
  const labels = ranges.map(label) as unknown as CountedScale['labels']
  return {
    cuts: [e1 - 0.5, e2 - 0.5, e3 - 0.5],
    labels,
    short: ranges.map(shortOf) as unknown as CountedScale['short'],
  }
}

/**
 * The Counted lens's one ink (VE-104). Strength of a party colour means "firm" only, so Counted never uses party
 * colour: a navy on a light paper, a light blue on a dark one, so the ramp reads on both themes.
 */
export const COUNTED_INK_LIGHT: Rgb = [24, 52, 98]
export const COUNTED_INK_DARK: Rgb = [150, 188, 235]
export function countedInk(pal: Palette): Rgb {
  const luma = 0.299 * pal.paper[0] + 0.587 * pal.paper[1] + 0.114 * pal.paper[2]
  return luma < 128 ? COUNTED_INK_DARK : COUNTED_INK_LIGHT
}
/** A seat's Counted fill: the ink at its step's strength over the paper, or the no-result fill with no count at all. */
export function countedRgb(pct: number | null | undefined, pal: Palette, cuts: readonly [number, number, number] = COUNTED_EDGES): Rgb {
  const step = countedStep(pct, cuts)
  return step === null ? pal.noResult : fade(countedInk(pal), COUNTED_ALPHA[step], pal.paper)
}

/** A swing within this many points of zero is "flat" (the prototype's district edge). */
export const SWING_EDGE = 0.75
/** 2CP margin cuts in points: tight under 10, mid under 25, safe beyond. */
export const MARGIN_EDGES = [10, 25] as const
/** [margin row][swing column]: tight to safe down the rows; against Labor (blue), flat (grey-violet), toward Labor (red) across. */
export const TRUST_PALETTE: readonly (readonly string[])[] = [
  ['#c9d6ee', '#e3e3e3', '#f2c4c6'],
  ['#8aa6d8', '#b9b4c4', '#e08a90'],
  ['#3f66b0', '#7d7487', '#c0313a'],
]
/** A seat with a leader but no margin or swing to show (no Labor candidate, a changed pairing, 2CP withheld). */
/** Darker than the flat-swing greys and the light no-result fill (VE-100): it was #d4d4d4, 1.15 against flat-tight and level with the new waiting fill. */
export const TRUST_NA = '#9a9a9a'
/**
 * Share counted below which a seat's swing is not shown (VE-98). Measured on the 2022 replay, where the baseline is the
 * 2022 result so every shown swing is early-count bias: the median error halves from 30 to 50% counted and then
 * plateaus (90th percentile 2.2 to 2.3 points from 50 to 70%). 50% of enrolment is about 57% of turnout, close to the
 * ABC and AP rule (70% of expected turnout, about 61% of enrolment); 70 would hatch nearly every seat all night, since
 * districts top out near 75% on the night. See docs/research/swing-threshold.md.
 */
export const SWING_MIN_PCT = 50
/** Hatched "too early to compare" seats: the stripe colour reads on light or dark paper; the base is a faint grey. */
export const HATCH_STRIPE = 'rgba(110, 110, 120, 0.7)'
export const HATCH_BASE = '#d4d4d4'
export const HATCH_BASE_ALPHA = 0.35
export const HATCH_ID = 'trust-hatch'
/** Share counted at which a Trust seat is fully opaque (districts top out near 75% of enrolment counted). */
export const TRUST_FULL_AT = 75
export const TRUST_MIN_ALPHA = 0.1

/** Blur radius in screen pixels for each Certainty band: under 30% counted, 30 to 70%, 70% and over. */
export const BLUR_PX = [14, 5, 0] as const
export type Band = 0 | 1 | 2
export const certaintyBand = (pct: number | null | undefined): Band => ((pct ?? 0) < 30 ? 0 : (pct ?? 0) < 70 ? 1 : 2)

/** The 2CP margin in points: the gap between the two candidates' shares. */
export const marginOfTcp = (pctA: number | null | undefined): number | null => (pctA === null || pctA === undefined ? null : Math.abs(2 * (pctA - 50)))

export interface TrustCell {
  /** 0 tight, 1 mid, 2 safe. */
  margin: 0 | 1 | 2
  /** 0 against Labor, 1 flat, 2 toward Labor. */
  swing: 0 | 1 | 2
}

export function trustCell(swing: number | null, margin: number | null): TrustCell | null {
  if (swing === null || margin === null) return null
  return {
    margin: margin < MARGIN_EDGES[0] ? 0 : margin < MARGIN_EDGES[1] ? 1 : 2,
    swing: swing < -SWING_EDGE ? 0 : swing > SWING_EDGE ? 2 : 1,
  }
}

/** Seats that must be past SWING_MIN_PCT before the Trust chip enables: fewer and the map is nearly all hatched (VE-104). */
export const TRUST_MIN_SEATS = 10
export const trustReady = (seats: Iterable<{ pct: number | null }>): boolean => {
  let n = 0
  for (const s of seats) if (!belowSwingMin(s.pct) && ++n >= TRUST_MIN_SEATS) return true
  return false
}

/** Whether a seat is too early for its swing to mean anything. */
export const belowSwingMin = (pct: number | null | undefined): boolean => (pct ?? 0) < SWING_MIN_PCT

export const trustAlpha = (pct: number | null | undefined): number =>
  TRUST_MIN_ALPHA + (1 - TRUST_MIN_ALPHA) * Math.min(1, Math.max(0, (pct ?? 0) / TRUST_FULL_AT))

/**
 * Labor's two-candidate swing since the baseline, in points. The history rows carry no first-preference swing, so
 * this is the 2CP swing measured from Labor's side; a seat with no Labor candidate (or no comparable baseline) has none.
 */
function rawLaborSwing(s: Seat, st: DistrictStatic | undefined): number | null {
  const sw = swingOf(s, st)
  if (!sw || !s.tcp) return null
  if (s.tcp.a === 'ALP') return sw.pts
  if (s.tcp.b === 'ALP') return -sw.pts
  return null
}

/**
 * How far, in points of first preferences, a party outside the VEC's pair must lead the weaker of the pair before the pair
 * is doubted (VE-226 tuning on the 2022 replay). The pairs the VEC later redid led by 6.2 to 18.9 points when flagged
 * (Albert Park, Melton, Brighton, Point Cook, Werribee; Shepparton's was wrong and never redone, 11.5 to 11.9). Right pairs
 * where the third overtook on preferences led by at most 2.1 (Kew, Hawthorn); South-West Coast, never redone, by up to 5.2.
 * One election, so a floor, not a law; a close three-way race is common and is not a wrong pair.
 */
export const PAIR_DOUBT_PTS = 6

/**
 * VE-224 pair check (docs/research/swing-three-way-2026-11-20.md, section 6): past the swing threshold, a party outside the
 * VEC's pair more than PAIR_DOUBT_PTS ahead of one member of it on first preferences means the VEC may be counting the
 * wrong two (Melton 2022: Labor v independent while the Liberal ran 7.4 points ahead of the independent). Such a seat's
 * swing is not comparable. The catch-all Other bucket is left out (it lumps unrelated candidates); a withheld count has its
 * own words. Leader and tally rules are untouched.
 */
export function pairInDoubt(s: Seat): boolean {
  const tcp = s.tcp
  if (belowSwingMin(s.pct) || !tcp || !tcp.b || s.tcpWithheld) return false
  // Seats built without first preferences (some views' fixtures, a source that has none) have nothing to check.
  const fp = s.fp ?? []
  const share = (p: PartyBucket): number => fp.find((f) => f.party === p)?.pct ?? 0
  const weaker = Math.min(share(tcp.a), share(tcp.b))
  return fp.some((f) => f.party !== 'OTH' && f.party !== tcp.a && f.party !== tcp.b && f.pct - weaker > PAIR_DOUBT_PTS)
}

/** Labor's swing, or null while too little is counted for it to mean anything (VE-98), or while the pair looks wrong (VE-224). Anything that shows swing goes through this. */
export function swingShown(s: Seat, st: DistrictStatic | undefined): number | null {
  return belowSwingMin(s.pct) || pairInDoubt(s) ? null : rawLaborSwing(s, st)
}
/** Kept as the name the Trust fill used; it is the honest swing. */
export const laborSwing = swingShown

const hexRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Opacity is baked in by mixing with the paper, so canvas, SVG and map fills all agree and stay opaque. */
const fade = (c: Rgb, alpha: number, paper: Rgb): Rgb => [0, 1, 2].map((i) => Math.round(paper[i]! + (c[i]! - paper[i]!) * alpha)) as Rgb

/** How much of a seat's colour a faded seat loses to grey (the pick's "desaturate"), and how much of the result stays out of the paper. */
export const PICK_DESATURATE = 0.8
export const PICK_KEEP = 0.15

/**
 * A seat outside the pick (ADR 0023): drained of most of its colour, then faded towards the paper. Simon asked for
 * the fade of the old dim plus a desaturate, so the shape still reads but the colour no longer competes with the picked seats.
 * The keep is small on purpose (VE-93): a firm fill is far from the paper, so a larger keep left it a mid grey that still
 * shouted; at 0.15 every faded seat lands in a narrow band near the paper and strong stays only slightly further out than pale.
 */
export function fadeGreyRgb(rgb: Rgb, pal: Palette): Rgb {
  const luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
  return [0, 1, 2].map((i) => {
    const grey = rgb[i]! + (luma - rgb[i]!) * PICK_DESATURATE
    return Math.round(pal.paper[i]! + (grey - pal.paper[i]!) * PICK_KEEP)
  }) as Rgb
}

/**
 * The old two-step fill: pale while a seat is only leading, full party colour once firm or won. Leader now uses three
 * steps (VE-127); this stays for the unoffered How sure colour, which adds blur on top.
 */
export const strengthRgb = (s: Seat | undefined, pal: Palette): Rgb => seatRgb(s, pal)

export interface SeatPaint {
  rgb: Rgb
  /** Certainty blur band; 2 (sharp) for every other colour. */
  band: Band
  /** Picked: a pick is in play and this seat is in it. Map and Hex outline exactly these seats (and nothing else at rest). */
  lit: boolean
  /** Trust only: too early to compare, so drawn as a light hatch over the paper rather than a swing colour. */
  hatch: boolean
  /** Gains only (VE-156): a seat that changed hands and is kept by the tapped party. Drawn lifted, with a heavier edge, above every other seat. Left out otherwise. */
  gain?: true
}

/** An unchanged seat under Gains: its holder's colour kept at GAINS_KEEP over the paper, so it still says who holds it but sits behind the changed seats. */
export function gainsTintRgb(p: PartyBucket, pal: Palette): Rgb {
  return [0, 1, 2].map((i) => Math.round(pal.paper[i]! + (pal.party[p][i]! - pal.paper[i]!) * GAINS_KEEP)) as Rgb
}

/**
 * `inFocus` is whether the seat is in the pick (or no pick); `picking` says a pick is actually in play, so a seat in
 * it is `lit` (outlined) and one outside it fades. Older callers pass only `inFocus`: seats outside still fade.
 */
export function seatPaint(s: Seat | undefined, st: DistrictStatic | undefined, colour: Colour, pal: Palette, inFocus: boolean, picking = false, gainsParty: PartyBucket | null = null): SeatPaint {
  let rgb: Rgb
  let band: Band = 2
  let hatch = false
  let gain = false
  if (colour === 'gains') {
    // VE-156: a changed seat keeps the Leader steps (a lead not yet won stays lighter); every other seat, and a changed seat the tapped party did not gain, is a light tint of its holder, not grey.
    if (s?.leader && keptGain(s, gainsParty)) {
      // Firm or won: full colour. An early lead or a likely one: the Likely step, never the faint Early step, so a changed seat stands out all night (the cards say "leads").
      rgb = leadStep(s) === 2 ? leaderRgb(s, pal) : stepRgb(s.leader, 1, pal)
      gain = true
    } else {
      // VE-166 (FB-193): a changed seat still below the bar (gainShown) is its holder's tint, so the early leader is not given away.
      // A seat that passes the bar but is outside the tapped party keeps today's tint by its leader.
      rgb = s?.leader ? gainsTintRgb(s.changing && !gainShown(s) ? s.base ?? s.leader : s.leader, pal) : pal.noResult
    }
  } else if (colour === 'trust' && s?.leader) {
    // Too early only when a swing could exist later: no 2CP yet, or a comparable pairing. A changed pairing never will, so it stays grey.
    hatch = belowSwingMin(s.pct) && (s.tcp === null || rawLaborSwing(s, st) !== null)
    const cell = trustCell(swingShown(s, st), marginOfTcp(s.tcp?.pctA))
    rgb = hatch ? fade(hexRgb(HATCH_BASE), HATCH_BASE_ALPHA, pal.paper) : fade(hexRgb(cell ? TRUST_PALETTE[cell.margin]![cell.swing]! : TRUST_NA), trustAlpha(s.pct), pal.paper)
  } else if (colour === 'leader') {
    // VE-127: faint (early lead), mid (likely), solid (firm or won); the tick marks won. No blur: nobody else blurs, and steps read at a glance.
    rgb = leaderRgb(s, pal)
  } else {
    rgb = strengthRgb(s, pal)
    if (colour === 'certainty' && s?.leader) band = certaintyBand(s.pct)
  }
  return { rgb: inFocus ? rgb : fadeGreyRgb(rgb, pal), band, lit: picking && inFocus, hatch: hatch && inFocus, ...(gain && inFocus ? { gain: true as const } : {}) }
}
