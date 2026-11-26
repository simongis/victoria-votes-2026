/**
 * VE-212 (FB-250): "How are seats like yours voting?" The words for the merged similar-places lens: a one-sentence count
 * out of five, and one status line per place. Counted votes only: a lead is a count, never a forecast, so none of these
 * lines predicts anything. Coalition parties are counted separately, as everywhere else in the app.
 */
import { PARTY_BUCKETS, type PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../parties'
import { gainShown } from './list'
import type { Seat } from './seats'

/** A party as a sentence's subject or object: Labor and One Nation stand alone, the others take "the" or are plural. */
const WHO: Record<PartyBucket, string> = {
  ALP: 'Labor',
  LIB: 'the Liberals',
  NAT: 'the Nationals',
  GRN: 'the Greens',
  ONP: 'One Nation',
  IND: 'Independents',
  OTH: 'Other parties',
}
const upFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const andList = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** Counts by party, largest first (ties in the schema's party order, so the words are stable). */
function groups(parties: readonly PartyBucket[]): { party: PartyBucket; n: number }[] {
  const n = new Map<PartyBucket, number>()
  for (const p of parties) n.set(p, (n.get(p) ?? 0) + 1)
  return [...n].map(([party, c]) => ({ party, n: c })).sort((a, b) => b.n - a.n || PARTY_BUCKETS.indexOf(a.party) - PARTY_BUCKETS.indexOf(b.party))
}

export interface LikeHeadline {
  /** The one sentence (two at Final when the picked seat has a winner). */
  headline: string
  /** The picked seat on its own short line once any of the five has a result; null before that and at Final. */
  picked: string | null
}

const stateWord = (s: Seat): string => (s.state === 'won' ? 'won' : 'leading')

/**
 * The headline for the five seats most like `pickedId`. `final` is every seat declared (the app's isFinal).
 * Three states: no result in any of the five (the 2022 holders), some counted (leads, with how many are not in), final.
 */
function countsHeadline(pickedId: number, five: readonly number[], seats: ReadonlyMap<number, Seat>, final: boolean): LikeHeadline {
  const me = seats.get(pickedId)
  const name = me?.name ?? 'this seat'
  const places = five.map((id) => seats.get(id)).filter((s): s is Seat => s !== undefined)
  const total = five.length
  const leaders = places.filter((s) => s.leader !== null).map((s) => s.leader!)

  if (leaders.length === 0) {
    const held = groups(places.filter((s) => s.base !== null).map((s) => s.base!))
    if (held.length === 0) return { headline: `No 2022 result to show for the seats most like ${name}.`, picked: null }
    const top = held.filter((g) => g.n === held[0]!.n)
    if (top.length > 1) {
      // "2 of the 5 ... were won by Labor and 2 by the Nationals": the count leads once, then each further group repeats its own.
      const parts = top.map((g, i) => (i === 0 ? WHO[g.party] : `${g.n} by ${WHO[g.party]}`))
      return { headline: `In 2022, ${top[0]!.n} of the ${total} seats most like ${name} were won by ${andList(parts)}.`, picked: null }
    }
    return { headline: `In 2022, ${top[0]!.n} of the ${total} seats most like ${name} were won by ${WHO[top[0]!.party]}.`, picked: null }
  }

  const lead = groups(leaders)
  const top = lead.filter((g) => g.n === lead[0]!.n)
  const verb = final ? 'won' : 'lead'
  const subject = top.length > 1 ? `${upFirst(andList(top.map((g) => WHO[g.party])))} each` : upFirst(WHO[top[0]!.party])
  const prep = final ? '' : 'in '
  const uncounted = total - leaders.length
  const tail = !final && uncounted > 0 ? `, ${uncounted} not counted yet` : ''
  let headline = `${subject} ${verb} ${prep}${top[0]!.n} of the ${total} seats most like ${name}${tail}.`
  if (final) {
    if (me?.leader) headline += ` ${name} went to ${WHO[me.leader]}.`
    return { headline, picked: null }
  }
  const gain = me && me.leader && gainShown(me) && me.base ? `, wins it from ${WHO[me.base]}` : ''
  const picked = me ? (me.leader ? `${name}: ${PARTY_NAMES[me.leader]} ${stateWord(me)}${gain}` : `${name}: not counted yet`) : null
  return { headline, picked }
}

export interface LikePlaceRow {
  /** The party whose dot colours the line; null when nothing is counted. */
  party: PartyBucket | null
  line: string
  /** Muted text under "Not counted yet": the 2022 holder. Null once counted or with no holder. */
  held: string | null
}

/** One place's line in the app's standard words: "Nationals leading, 62%", or "Not counted yet" over "Held by Nationals". */
export function likePlaceRow(s: Seat): LikePlaceRow {
  if (!s.leader) return { party: null, line: 'Not counted yet', held: s.base ? `Held by ${PARTY_NAMES[s.base]}` : null }
  // The leader's share: the two-candidate figure when there is one, else the first-preference share of the leading party.
  const raw = s.tcp ? s.tcp.pctA : (s.fp.find((f) => f.party === s.leader)?.pct ?? null)
  const pct = raw !== null && Number.isFinite(raw) ? `, ${Math.round(raw)}%` : ''
  return { party: s.leader, line: `${PARTY_NAMES[s.leader]} ${stateWord(s)}${pct}`, held: null }
}

/**
 * VE-213 (FB-252): the app's "keeps it" and "wins it from" words for a row, the same ones the rail uses for a declared seat (list.ts
 * resultWords), but for a lead too. A change of holder is worded only once it shows (gainShown), so an early lead never
 * gives a seat away; null where there is nothing counted, no holder to compare with, or the change is still too early.
 */
export function changeWords(s: Seat): string | null {
  if (!s.leader || !s.base) return null
  if (s.leader === s.base) return 'keeps it'
  return gainShown(s) ? `wins it from ${PARTY_NAMES[s.base]}` : null
}

const countWord = (n: number): string => (n === 1 ? 'One' : String(n))
/** The swing is Labor's two-candidate swing (swingShown), in points; positive is towards Labor. A swing that rounds to nothing is flat and ignored. */
const direction = (pts: number | null): 'away' | 'towards' | null => {
  if (pts === null || Math.round(Math.abs(pts) * 10) === 0) return null
  return pts < 0 ? 'away' : 'towards'
}
/** Fewer than this many of the five past the swing threshold and the group says nothing. */
const SWING_MIN_PLACES = 3

/**
 * The words for the five seats most like `pickedId`, with where they are changing hands and which way they are swinging.
 * `swing` gives a seat's Labor swing as the seat panel shows it (swingShown: null under the counted threshold or with a
 * changed pairing); leave it out and no swing is said. Counts only, no percentages, and no forecast: "would change hands"
 * counts leads that are on show as gains.
 */
export function likePlacesHeadline(pickedId: number, five: readonly number[], seats: ReadonlyMap<number, Seat>, final: boolean, swing?: (id: number) => number | null): LikeHeadline {
  const base = countsHeadline(pickedId, five, seats, final)
  const places = five.map((id) => seats.get(id)).filter((s): s is Seat => s !== undefined)
  const sentences: string[] = []

  const moving = places.filter((s) => gainShown(s)).length
  if (moving > 0) sentences.push(`${countWord(moving)} ${final ? 'changed' : 'would change'} hands.`)

  let group: 'away' | 'towards' | null = null
  if (swing) {
    const dirs = five.map((id) => swing(id))
    const past = dirs.filter((d) => d !== null).length
    const away = dirs.filter((d) => direction(d) === 'away').length
    const towards = dirs.filter((d) => direction(d) === 'towards').length
    if (past >= SWING_MIN_PLACES && away !== towards && Math.max(away, towards) >= SWING_MIN_PLACES) {
      group = away > towards ? 'away' : 'towards'
      // Only "2022" is worded: Prahran and Narracan measure against another contest, so a mixed five leaves the date out.
      const notes = new Set(places.map((s) => s.baseNote ?? '2022'))
      const since = notes.size === 1 && notes.has('2022') ? ' since 2022' : ''
      sentences.push(`${Math.max(away, towards)} of the ${five.length} have swung ${group === 'away' ? 'away from' : 'towards'} Labor${since}.`)
    }
  }

  const headline = [base.headline, ...sentences].join(' ')
  let picked = base.picked
  if (picked && group && swing) {
    const mine = direction(swing(pickedId))
    if (mine) picked += mine === group ? `. It has swung ${group === 'away' ? 'away from' : 'towards'} Labor too.` : '. It is moving the other way.'
  }
  return { headline, picked }
}
