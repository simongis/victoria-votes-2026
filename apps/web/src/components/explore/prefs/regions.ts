import type { PartyBucket } from '@vic26/schema'
import type { PrefsPoint } from '../../../derive/prefs'

/**
 * Plain words for the eight upper-house regions the rows group seats by. The app is Assembly-only, so the name alone
 * means little: the hint says where the group of seats is.
 */
const HINTS: Record<string, string> = {
  'Eastern Metropolitan': 'east Melbourne',
  'North-Eastern Metropolitan': 'north-east Melbourne',
  'Northern Metropolitan': 'inner north Melbourne',
  'South-Eastern Metropolitan': 'south-east Melbourne',
  'Southern Metropolitan': 'inner south Melbourne',
  'Western Metropolitan': 'west Melbourne',
  'Eastern Victoria': 'country east',
  'Northern Victoria': 'country north',
  'Western Victoria': 'country west',
}

export const regionHint = (region: string): string => HINTS[region.replace(/ Region$/, '')] ?? ''

/** VE-215 A22: the row's name in plain words ("North-east Melbourne"), not the upper-house region's name. Falls back to the region's own name. */
export const regionTitle = (region: string): string => {
  const hint = regionHint(region)
  return hint ? hint.charAt(0).toUpperCase() + hint.slice(1) : region.replace(/ Region$/, '')
}

/** The parties that lead at least one seat, for the one-line key: most seats first, ties by party code. */
export function partyKey(points: readonly PrefsPoint[]): { party: PartyBucket; n: number }[] {
  const n = new Map<PartyBucket, number>()
  for (const p of points) n.set(p.party, (n.get(p.party) ?? 0) + 1)
  return [...n.entries()].map(([party, c]) => ({ party, n: c })).sort((a, b) => b.n - a.n || a.party.localeCompare(b.party))
}
