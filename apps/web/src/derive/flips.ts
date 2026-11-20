import type { Seat } from './seats'

/**
 * Districts whose leader changed from one tick to the next: both ticks had a leader and they differ. A seat going
 * from no figures to a first leader is not a flip, and neither is a lead that only firmed up.
 */
export function flippedIds(prev: ReadonlyMap<number, Seat>, next: ReadonlyMap<number, Seat>): number[] {
  const out: number[] = []
  for (const [id, s] of next) {
    const was = prev.get(id)?.leader ?? null
    if (was !== null && s.leader !== null && was !== s.leader) out.push(id)
  }
  return out
}
