/**
 * The party highlight (VE-57, FB-33, VE-83b): picking a party in the top tally, or just its strong (firm or won) or
 * pale (leading) part, lights those seats on the stage and takes the rest to a faded grey. Labor and the Coalition
 * are the big picks; the Coalition covers Liberal and Nationals, "Others" the independents and the small parties (One Nation is its own pick, VE-131).
 *
 * A pick is a short string so it compares and toggles like before: 'ALP', 'COA', 'XB', or with a part
 * ('ALP:pale', 'COA:strong').
 */
import type { PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../parties'
import type { RailFilter } from './list'
import type { Seat } from './seats'

export type FocusWho = PartyBucket | 'COA' | 'XB'
/** Strong is firm or won; pale is leading and could still change (the tally's and the map's own two tones). */
export type FocusPart = 'strong' | 'pale'
export type PartyFocus = FocusWho | `${FocusWho}:${FocusPart}`
/**
 * The second kind of pick (VE-105): the seats in doubt, whoever leads them. It rides on the same pick as a party, so it
 * wears the same outline and fade and nothing new is invented (ADR 0023).
 */
export const DOUBT = 'DOUBT'
export type Focus = PartyFocus | typeof DOUBT

export function parseFocus(f: PartyFocus): { who: FocusWho; part: FocusPart | null } {
  const [who, part] = f.split(':') as [FocusWho, FocusPart | undefined]
  return { who, part: part ?? null }
}

const GROUPS: Record<'COA' | 'XB', PartyBucket[]> = { COA: ['LIB', 'NAT'], XB: ['IND', 'OTH'] }

export const focusParties = (f: Focus): PartyBucket[] => {
  if (f === DOUBT) return []
  const { who } = parseFocus(f)
  return who === 'COA' || who === 'XB' ? GROUPS[who] : [who]
}

/**
 * No pick means every seat is in. Otherwise a seat is in when its leader is one of the picked parties and, if a part
 * was picked, its state matches it. Given a bare leader (the rail's filter) there is no state, so only the party counts.
 * The in-doubt pick looks at the seat's own flag; a bare leader cannot tell, so it passes and the rail's status chip,
 * which is set with it, does the narrowing.
 */
export function inFocus(f: Focus | null, seat: PartyBucket | null | Pick<Seat, 'leader' | 'state'> & Partial<Pick<Seat, 'inDoubt' | 'close'>>): boolean {
  if (f === null) return true
  // VE-226 (finding 7): the pick is the close seats, the same set the band's "N close" counts.
  if (f === DOUBT) return seat !== null && typeof seat === 'object' ? seat.close === true : true
  const leader = seat !== null && typeof seat === 'object' ? seat.leader : seat
  if (leader === null || !focusParties(f).includes(leader)) return false
  const { part } = parseFocus(f)
  if (part === null || seat === null || typeof seat !== 'object') return true
  const strong = seat.state === 'firm' || seat.state === 'won'
  return part === 'strong' ? strong : seat.state === 'leading'
}

/** Gap between one seat's pop and the next, so the eye follows them; capped so a long list still finishes quickly. */
export const POP_STAGGER_MS = 30
const POP_MAX_STEPS = 14

/** The custom properties the pop animation reads (effects.css): its start delay and how far it grows. */
export const popStyle = (index: number, scale: number): Record<string, string> => ({
  '--pop-delay': `${Math.min(index, POP_MAX_STEPS) * POP_STAGGER_MS}ms`,
  '--pop-scale': String(scale),
})

/** Choosing what is already picked clears it. */
export const toggleFocus = (current: Focus | null, next: Focus): Focus | null => (current === next ? null : next)

/**
 * The in-doubt pick has two switches that mean the same thing: the band's button and the rail's In doubt chip. They
 * move together so they cannot disagree; a party pick replaces it. The rail's other chips are separate filters.
 */
export interface Picks {
  focus: Focus | null
  status: RailFilter | null
}

export const withFocus = (p: Picks, focus: Focus | null): Picks => ({
  focus,
  status: focus === DOUBT ? 'doubt' : p.status === 'doubt' ? null : p.status,
})

export const withStatus = (p: Picks, status: RailFilter | null): Picks => ({
  status,
  focus: status === 'doubt' ? DOUBT : p.focus === DOUBT ? null : p.focus,
})

const whoName = (who: FocusWho): string => (who === 'COA' ? 'Coalition' : who === 'XB' ? 'All others' : PARTY_NAMES[who])
const PART_NAMES: Record<FocusPart, string> = { strong: 'certain', pale: 'leading' }

export const focusName = (f: Focus): string => {
  if (f === DOUBT) return 'Close seats'
  const { who, part } = parseFocus(f)
  return part === null ? whoName(who) : `${whoName(who)}, ${PART_NAMES[part]}`
}

export interface FocusDetail {
  name: string
  /** Seats the pick leads or holds: declared, firm and leading together. */
  total: number
  /** Declared by VEC. */
  declared: number
  /** Firm leads that VEC has not declared. */
  firm: number
  /** Leading, could still change. */
  leading: number
  /** Close seats (VE-226, finding 7: a real count under 52% after preferences, or withheld); seats waiting for preferences are not. */
  inDoubt: number
}

export function focusDetail(seats: Map<number, Seat>, f: Focus): FocusDetail {
  const d: FocusDetail = { name: focusName(f), total: 0, declared: 0, firm: 0, leading: 0, inDoubt: 0 }
  for (const s of seats.values()) {
    if (!inFocus(f, s)) continue
    d.total += 1
    if (s.state === 'won') d.declared += 1
    else if (s.state === 'firm') d.firm += 1
    else if (s.state === 'leading') d.leading += 1
    if (s.close) d.inDoubt += 1
  }
  return d
}

/** The line under the band for a pick. Close seats is one plain phrase; a party keeps its breakdown (VE-109). */
export function focusSummary(f: Focus, d: FocusDetail): string {
  if (f === DOUBT) return `${d.total} close ${d.total === 1 ? 'seat' : 'seats'}`
  if (d.total > 0 && d.declared === d.total) return `${d.name} won ${d.total} ${d.total === 1 ? 'seat' : 'seats'}`
  return `${d.name} ${d.total} seats: ${d.declared} declared, ${d.firm} certain, ${d.leading} leading, ${d.inDoubt} close`
}
