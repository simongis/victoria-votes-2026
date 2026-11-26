/**
 * The band's headline (ADR 0023, option C): who leads whom and what the leader needs, written from the
 * same tally the bar draws. It reports leads and never calls government (a lead is not a VEC result). VE-257: only seats
 * the VEC has declared can say "has a majority" (45 declared for one side); a seat we call "won or certain" never counts.
 * Pure: the band
 * sets each side's name in party colour so the words, the bar and the map read as one picture.
 */
import type { PartyBucket } from '@vic26/schema'
import { MAJORITY, SEATS, SIDE_NAMES, SIDES, sideTotals, type Seat, type Side, type Tally } from './seats'
import type { Rgb } from '../theme/theme'
import { agree } from '../parties'

export interface HeadlinePart {
  text: string
  /** Set on a side's name, so the band can colour it. */
  side?: Side
}

/**
 * VE-140: no side is named until this share of enrolment is counted. Evidence (2022 replay, 5-minute ticks): the
 * seat-count leader flips from Coalition to Labor at 1.4% counted and never changes again, with 50 seats reporting at
 * 1% and 78 at 4.9%; the two-candidate error is also still steep below 5% (median 4.6 points under 10%, docs/research/swing-threshold.md).
 * 5% is about 3.5 times the last flip, rounds to a figure easy to say, and arrives around 7:30 pm in the replay.
 */
export const HEADLINE_MIN_PCT = 5

const seats = (n: number): string => `${n} ${n === 1 ? 'seat' : 'seats'}`

const ZERO: Record<PartyBucket, number> = { ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0 }

/** Seats VEC has declared, by party: the only thing that lets the headline say "won" (a firm lead is still a lead). */
export function declaredOf(seats: Iterable<Seat>): Record<PartyBucket, number> {
  const out = { ...ZERO }
  for (const s of seats) if (s.state === 'won' && s.leader) out[s.leader] += 1
  return out
}

/**
 * `countedPct` is the statewide share of enrolment counted; below HEADLINE_MIN_PCT no leader is named (null skips the test).
 * `declared` is the VEC-declared wins by party (declaredOf), always the real counts. `final` is true only when every
 * seat is declared (allDeclared); "has won" and the no-majority result need it plus nothing in doubt. Before that, a side with
 * 45 or more declared "has a majority"; anything less is a lead. `final` defaults to false so a caller can never say "won" by omission.
 */
export function headlineParts(t: Tally, inDoubt: number, declared: Record<PartyBucket, number> = ZERO, countedPct: number | null = null, final = false): HeadlinePart[] {
  const sides = sideTotals(t)
  const finished = final && isFinished(t, inDoubt, declared)
  const ranked = [...SIDES].sort((a, b) => sides[b].all - sides[a].all)
  const first = ranked[0]!
  const second = ranked[1]!
  if (sides[first].all === 0) return [{ text: 'Waiting for the first figures' }]
  // A lead on a sliver of the count is a coin toss (VE-140): say counting has started and name no one.
  // VE-167: say what is on the map (seats with figures) so the line does not contradict the coloured seats; still no leader.
  if (countedPct !== null && countedPct < HEADLINE_MIN_PCT) {
    const withFigures = SIDES.reduce((a, s) => a + sides[s].all, 0)
    return [{ text: `First figures in ${seats(withFigures)}. Too early to call.` }]
  }
  const name = (s: Side): HeadlinePart => ({ text: SIDE_NAMES[s], side: s })
  // VE-226 (finding 17): "Greens lead", "Independents have won"; Labor and the Coalition are singular.
  const v = (one: string, many: string) => agree(SIDE_NAMES[first], one, many)
  // VE-165: the band's "N in doubt" says how many could still change, so the headline only says so when none can.
  const tail = (): HeadlinePart => ({ text: inDoubt === 0 ? '. No seats could still change.' : '.' })
  const n = sides[first].all
  const need = MAJORITY - n
  const more = `${need} more`
  // VE-153: every seat declared and nothing in doubt, but no majority: a result with no one to govern alone, not a lead.
  const noMajority = ' No party has the ' + MAJORITY + ' needed for a majority.'
  if (finished && n < MAJORITY) {
    if (n === sides[second].all) return [name(first), { text: ' and ' }, name(second), { text: ` won ${n} seats each.${noMajority}` }]
    return [name(first), { text: ` won ${seats(n)} and ` }, name(second), { text: ` ${sides[second].all}.${noMajority}` }]
  }
  const sideDeclared = declaredFor(first, declared)
  // VE-257: 45 declared for one side is a majority (45 + 45 > 88, so only the leader can have it). Before Final that is all we say.
  if (!finished && sideDeclared >= MAJORITY) return [name(first), { text: ` ${v('has', 'have')} a majority: ${seats(sideDeclared)} declared.` }]
  if (n === sides[second].all) return [name(first), { text: ' and ' }, name(second), { text: ` level on ${seats(n)}. Each needs ${more}` }, tail()]
  if (n >= MAJORITY) {
    const over = n - MAJORITY
    const margin = over === 0 ? `exactly the ${MAJORITY}` : `${over} more than the ${MAJORITY}`
    // Past tense once won: the 45 was what it needed, not what it needs (VE-167).
    if (finished && sideDeclared === n) return [name(first), { text: ` ${v('has', 'have')} won ${seats(n)}, ${margin} ${v('it', 'they')} needed.` }]
    return [name(first), { text: ` ${v('leads', 'lead')} in ${seats(n)}, ${margin} ${v('it needs', 'they need')}` }, tail()]
  }
  return [name(first), { text: ` ${v('leads', 'lead')} ` }, name(second), { text: ` by ${seats(n - sides[second].all)}. ${v('It needs', 'They need')} ${more}` }, tail()]
}

/** VE-153: every seat that has a leader is a VEC-declared win and none is in doubt (the count is over). */
function isFinished(t: Tally, inDoubt: number, declared: Record<PartyBucket, number>): boolean {
  const sum = (r: Record<PartyBucket, number>) => Object.values(r).reduce((a, b) => a + b, 0)
  const leading = sum(t.firm) + sum(t.leading)
  return inDoubt === 0 && leading > 0 && sum(declared) === leading
}

/** A side's declared wins: the Coalition is Liberal plus Nationals, as in the tally's side totals. */
const declaredFor = (s: Side, d: Record<PartyBucket, number>): number => (s === 'COA' ? d.LIB + d.NAT : d[s as PartyBucket])

export const headlineText = (parts: readonly HeadlinePart[]): string => parts.map((p) => p.text).join('')

const lin = (v: number): number => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (c: Rgb): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
const contrast = (a: Rgb, b: Rgb): number => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)

/**
 * A party colour fit to set bold text in on this ground: moved towards black (on a light ground) or white (on a dark
 * one) in small steps until it reaches 3:1, the WCAG bar for large or bold text. A colour that already reads is kept,
 * so Labor still looks like Labor and only the pale Greens green is deepened.
 */
export function legibleOn(c: Rgb, ground: Rgb): Rgb {
  const towards = luminance(ground) > 0.4 ? 0 : 255
  let out = c
  for (let k = 1; k <= 20 && contrast(out, ground) < 3; k++) {
    out = [0, 1, 2].map((i) => Math.round(c[i]! + (towards - c[i]!) * (k / 20))) as Rgb
  }
  return out
}

/**
 * VE-144a: the phone sheet handle's one-line headline ("Labor leads in 54 of 88"). The same rules as headlineParts (no
 * leader under HEADLINE_MIN_PCT, "has won" only when every seat is declared and none is in doubt, never a call of
 * government) in fewer words: no majority and no "could still change", because the tally's 45 mark and the in-doubt
 * button beside it already say those.
 */
export function shortHeadlineParts(t: Tally, inDoubt: number, declared: Record<PartyBucket, number> = ZERO, countedPct: number | null = null, final = false): HeadlinePart[] {
  const sides = sideTotals(t)
  const ranked = [...SIDES].sort((a, b) => sides[b].all - sides[a].all)
  const first = ranked[0]!
  const second = ranked[1]!
  if (sides[first].all === 0) return [{ text: 'Waiting for the first figures' }]
  // VE-215 A4: the same words as the desktop headline, so the phone handle says what is on the map instead of a vaguer line.
  if (countedPct !== null && countedPct < HEADLINE_MIN_PCT) {
    const withFigures = SIDES.reduce((a, s) => a + sides[s].all, 0)
    return [{ text: `First figures in ${seats(withFigures)}. Too early to call.` }]
  }
  const name = (s: Side): HeadlinePart => ({ text: SIDE_NAMES[s], side: s })
  const n = sides[first].all
  // VE-153: at Final the phone line says "won", with or without a majority (the tally's 45 mark shows whether there is one).
  const finished = final && isFinished(t, inDoubt, declared)
  if (n < MAJORITY && finished && n !== sides[second].all) return [name(first), { text: ` won ${n} of ${SEATS}` }]
  const v = (one: string, many: string) => agree(SIDE_NAMES[first], one, many)
  // VE-257: 45 declared for one side says "has a majority" (before Final); a "won or certain" seat is not declared and never counts.
  const sideDeclared = declaredFor(first, declared)
  if (!finished && sideDeclared >= MAJORITY) return [name(first), { text: ` ${v('has', 'have')} a majority: ${sideDeclared} declared` }]
  if (n === sides[second].all) return [name(first), { text: ' and ' }, name(second), { text: ` level on ${n}` }]
  const won = n >= MAJORITY && finished && sideDeclared === n
  return [name(first), { text: ` ${won ? `${v('has', 'have')} won` : `${v('leads', 'lead')} in`} ${n} of ${SEATS}` }]
}
