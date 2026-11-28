import type { BoothRow, BoothStatic } from './model'

/** One physical early voting centre: it may serve several seats, but it is one dot. */
export interface EvcGroup {
  key: string
  name: string
  e: number
  n: number
  /** The feed's ids for the centre (one per seat it serves). */
  ids: number[]
  districtIds: number[]
  /** Each centre record and the seat it belongs to (ids and districtIds do not line up, since districtIds are distinct). */
  members?: { id: number; districtId: number }[]
}

/** Coordinates within this many metres count as the same place (the feed repeats a centre once per seat). */
const SAME_PLACE_M = 25

/**
 * Groups centres by name and place. Centres with no usable coordinates are left out (hidden until the live set-up
 * gives them), never drawn at 0,0.
 */
export function groupEvcs(evc: readonly BoothStatic[]): EvcGroup[] {
  const groups: EvcGroup[] = []
  for (const b of evc) {
    if (!Number.isFinite(b.e) || !Number.isFinite(b.n)) continue
    const g = groups.find((x) => x.name === b.name && Math.hypot(x.e - b.e, x.n - b.n) <= SAME_PLACE_M)
    if (g) {
      g.ids.push(b.id)
      g.members?.push({ id: b.id, districtId: b.districtId })
      if (!g.districtIds.includes(b.districtId)) g.districtIds.push(b.districtId)
    } else groups.push({ key: `${b.name}@${Math.round(b.e)},${Math.round(b.n)}`, name: b.name, e: b.e, n: b.n, ids: [b.id], districtIds: [b.districtId], members: [{ id: b.id, districtId: b.districtId }] })
  }
  return groups
}

/** Centres are drawn only when the source has results for them: none on the 2022 replay. */
export const hasEvcResults = (evc: readonly BoothStatic[], byBooth: ReadonlyMap<number, readonly BoothRow[]>): boolean =>
  evc.some((b) => (byBooth.get(b.id)?.length ?? 0) > 0)

/** A ringed dot: bigger than a booth of the same votes, a heavy outline, a lighter fill. */
export function evcRing(r0: number): { radius: number; strokeWidth: number; fillOpacity: number } {
  return { radius: r0 + 1.5, strokeWidth: 2.2, fillOpacity: 0.55 }
}
