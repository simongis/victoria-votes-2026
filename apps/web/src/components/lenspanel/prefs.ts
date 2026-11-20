/**
 * The Preferences lens's panel (VE-125b): every seat ranked by its first-preference leader's share, closest to 50% first.
 * The share is Seat.fp[0].pct, already a share of the sum of party votes (VE-113), the same figure the lens plots.
 */
import type { PartyBucket } from '@vic26/schema'
import { OUTRIGHT_PCT } from '../../derive/prefs'
import { partyName, type Seat } from '../../derive/seats'

/** Under 50%: preferences decide. 50% or more: wins outright. */
export type PrefsFilter = 'decide' | 'outright'

export interface PrefsRow {
  id: number
  name: string
  seat: Seat
  party: PartyBucket | null
  /** The first-preference leader's share, percent; null without figures. */
  pct: number | null
  filter: PrefsFilter | null
}

export function prefsRows(seats: Iterable<Seat>): PrefsRow[] {
  return [...seats]
    .map((seat): PrefsRow => {
      const lead = seat.fp[0]
      return { id: seat.id, name: seat.name, seat, party: lead?.party ?? null, pct: lead?.pct ?? null, filter: lead ? (lead.pct < OUTRIGHT_PCT ? 'decide' : 'outright') : null }
    })
    .sort((a, b) => (a.pct === null ? 1 : 0) - (b.pct === null ? 1 : 0) || Math.abs((a.pct ?? 0) - OUTRIGHT_PCT) - Math.abs((b.pct ?? 0) - OUTRIGHT_PCT) || a.name.localeCompare(b.name))
}

/** `final`: every seat is declared, so the words match the lens title ("no one had 50% of first preferences"), not a forecast. */
export function prefsSummary(rows: readonly PrefsRow[], final = false): string {
  if (rows.every((r) => r.pct === null)) return 'No first preferences counted yet.'
  const n = rows.filter((r) => r.filter === 'decide').length
  if (final) return n === 0 ? 'Every seat had someone over 50% of first preferences.' : `${n} ${n === 1 ? 'seat' : 'seats'}: no one had 50% of first preferences.`
  if (n === 0) return 'No seat short of 50% yet.'
  return n === 1 ? '1 seat short of 50%: preferences decide it.' : `${n} seats short of 50%: preferences decide them.`
}

export function prefsCounts(rows: readonly PrefsRow[]): Record<PrefsFilter, number> {
  return { decide: rows.filter((r) => r.filter === 'decide').length, outright: rows.filter((r) => r.filter === 'outright').length }
}

export function filterPrefs(rows: readonly PrefsRow[], filter: PrefsFilter | null, query: string): PrefsRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => (filter === null || r.filter === filter) && (q === '' || r.name.toLowerCase().includes(q)))
}

export function prefsSentence(r: PrefsRow): string {
  if (r.pct === null) return `${r.name}: no first preferences counted yet.`
  return `${r.name}: ${partyName(r.party)} ${Math.round(r.pct)}% of first preferences. ${r.filter === 'decide' ? 'Preferences decide.' : 'Wins outright.'}`
}
