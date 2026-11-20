import { trustReady } from '../../derive/colour'
import { multiReady } from '../lenspanel/multi'
import { getNight } from './multiples/nightStore'

/**
 * Whether a lens has enough data to be worth offering (FB-148: "no one needs to know until there is enough data to make
 * the map interesting"). Swing arrows wait for the same 10 seats past the swing threshold that enable the Trust chip;
 * the other lenses say something from the first count. A `?explore=` link still opens any lens, with its own "too early" marks.
 */
export function lensReady(id: string, seats: ReadonlyMap<number, { pct: number | null }>): boolean {
  if (id === 'multiples') return multiReady(getNight().series, getNight().shownIdx)
  return id === 'arrows' ? trustReady(seats.values()) : true
}

export function readyLenses<T extends { id: string }>(lenses: readonly T[], seats: ReadonlyMap<number, { pct: number | null }>): T[] {
  return lenses.filter((l) => lensReady(l.id, seats))
}
