import type { ShareParty } from '@vic26/schema'

/**
 * The one polling line the lens's "i" carries before results arrive (VE-101g, FB-171). Only rows marked CONFIRMED in
 * docs/research/one-nation-polling-2026.md are listed; headline-only and search-summary rows are left out. Retire the
 * line (delete this file and its use) if the research file is superseded.
 */
export interface Poll {
  pollster: string
  /** As the sources give them: a published date or a fieldwork window. */
  dates: string
  /** One Nation's first-preference share, per cent. */
  onp: number
}

export const ONP_POLLS: readonly Poll[] = [
  { pollster: 'Freshwater Strategy', dates: '8 Jun', onp: 25 },
  { pollster: 'DemosAU', dates: '12 Jun', onp: 23 },
  { pollster: 'Resolve Strategic', dates: '14 Jul', onp: 22 },
  { pollster: 'RedBridge', dates: '4 Aug', onp: 22 },
  { pollster: 'Roy Morgan', dates: '26 to 29 Oct', onp: 22 },
]

export function pollsLine(polls: readonly Poll[]): string {
  if (polls.length === 0) return ''
  const lo = Math.min(...polls.map((p) => p.onp))
  const hi = Math.max(...polls.map((p) => p.onp))
  const range = lo === hi ? `${lo}%` : `${lo}% to ${hi}%`
  const each = polls.map((p) => `${p.pollster} ${p.onp}% (${p.dates})`).join(', ')
  return `Statewide polls this year put One Nation at ${range} of first preferences: ${each}. Polls are not results.`
}

/** Any counted first preference in any seat. Before this, the lens shows only the 2025 federal figures and the polls line. */
export function hasResults(seats: Iterable<{ fp: readonly { votes: number }[] }>): boolean {
  for (const s of seats) if (s.fp.some((f) => f.votes > 0)) return true
  return false
}

/** The polls are of One Nation only, so the line belongs to that party's chip and no other (FB-174). Empty for any other party. */
export function pollsLineFor(party: ShareParty, polls: readonly Poll[]): string {
  return party === 'ONP' ? pollsLine(polls) : ''
}
