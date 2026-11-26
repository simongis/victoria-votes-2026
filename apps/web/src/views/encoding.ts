/**
 * The one colour encoding every view uses, keyed by district_id, so the Map and Seats views (and a later
 * morph between them) always agree on what a district looks like. Colours come from the theme palette.
 */
import type { PartyBucket } from '@vic26/schema'
import { LIKELY_FROM_PCT, type Seat } from '../derive/seats'
import { PARTY_NAMES } from '../parties'
import { css, type Palette, type Rgb } from '../theme/theme'

export type { Rgb }

/** Party colour mixed towards the tint base: "leading, could still change". */
export function tintRgb(p: PartyBucket, pal: Palette): Rgb {
  const [r, g, b] = pal.party[p]
  const [br, bg, bb] = pal.tintBase
  const mix = (c: number, base: number) => Math.round(c + (base - c) * pal.tintAmount)
  return [mix(r, br), mix(g, bg), mix(b, bb)]
}

/** Firm or won: full party colour. Leading: tint. No figures: the no-result colour. */
export function seatRgb(s: Seat | undefined, pal: Palette): Rgb {
  if (!s || !s.leader) return pal.noResult
  return s.state === 'leading' ? tintRgb(s.leader, pal) : pal.party[s.leader]
}

/** A seat outside the highlighted party: the same colour a quarter of the way out of the paper, so it recedes but still reads as a seat. */
export const DIM_KEEP = 0.25
export function dimRgb(rgb: Rgb, pal: Palette): Rgb {
  const [pr, pg, pb] = pal.paper
  const mix = (c: number, base: number) => Math.round(base + (c - base) * DIM_KEEP)
  return [mix(rgb[0], pr), mix(rgb[1], pg), mix(rgb[2], pb)]
}

/** Seat colour with the party highlight applied: seats not in focus are dimmed. */
export const focusSeatRgb = (s: Seat | undefined, pal: Palette, inFocus: boolean): Rgb => (inFocus ? seatRgb(s, pal) : dimRgb(seatRgb(s, pal), pal))

export const partyCss = (p: PartyBucket, pal: Palette): string => css(pal.party[p])
export const tintCss = (p: PartyBucket, pal: Palette): string => css(tintRgb(p, pal))
export const seatCss = (s: Seat | undefined, pal: Palette): string => css(seatRgb(s, pal))
/** The count floor of the Likely step (VE-127). ADR 0033 adds a margin and a preference floor; the rule lives in seats.ts. */
export { LIKELY_FROM_PCT }
/** Leader's three steps of a party colour: 0 early lead, 1 likely, 2 solid (firm or won). */
export type LeadStep = 0 | 1 | 2
export const LEAD_STEP_WORDS = ['Early lead', 'Likely', 'Won or certain'] as const

/** A seat's step, or null with no figures. Firm and won are solid; a leading seat is early until it is Likely (ADR 0033, `Seat.likely`). */
export function leadStep(s: Seat | undefined): LeadStep | null {
  if (!s || !s.leader) return null
  if (s.state === 'firm' || s.state === 'won') return 2
  return s.likely ? 1 : 0
}

/**
 * True once every leading seat is declared (the count is at Final, VE-142, FB-176). The early/likely/solid steps say how
 * sure a lead is, so they have no job when nothing is left to be sure of: the key and the tally then show plain party
 * colours and a "Won" tick. Derived from the seats, so Rewind to an earlier moment brings the steps back by itself.
 */
export function allDeclared(seats: Iterable<Seat | undefined>): boolean {
  let any = false
  for (const s of seats) {
    // A seat with no results or no leader is not declared (VE-254): skipping it said "Every seat declared" with 87 of 88 done.
    if (!s?.leader || s.state !== 'won') return false
    any = true
  }
  return any
}

/** How far Likely sits from the tint toward full colour: far enough from Early to read as a separate step. */
export const LIKELY_MIX = 0.67
/** A party's colour at a step: the tint, two thirds of the way to full, then full. */
export function stepRgb(p: PartyBucket, step: LeadStep, pal: Palette): Rgb {
  if (step === 2) return pal.party[p]
  const tint = tintRgb(p, pal)
  if (step === 0) return tint
  const full = pal.party[p]
  return [0, 1, 2].map((i) => Math.round(tint[i]! + (full[i]! - tint[i]!) * LIKELY_MIX)) as Rgb
}

/** The Leader colour (VE-127, replacing FB-129's solid): faint, mid or solid party colour; no figures is the no-result colour. */
export function leaderRgb(s: Seat | undefined, pal: Palette): Rgb {
  const step = leadStep(s)
  return step === null ? pal.noResult : stepRgb(s!.leader!, step, pal)
}
export const leaderCss = (s: Seat | undefined, pal: Palette): string => css(leaderRgb(s, pal))

export function seatLabel(s: Seat): string {
  if (!s.leader) return `${s.name}: no figures yet`
  const what = s.state === 'won' ? 'won' : s.state === 'firm' ? 'certain lead' : 'leading'
  return `${s.name}: ${PARTY_NAMES[s.leader]} ${what}`
}
