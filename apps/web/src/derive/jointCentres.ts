/**
 * Joint voting centres (VE-292): one building that serves several districts is one record per district in the booth layer,
 * same name, under a metre apart (VE-288 found 191 on the 2026 set-up). They draw as stacked dots; the panel groups them
 * so a tap on any dot can switch between the districts' results. Pure, computed once from the booth statics.
 */

export interface CentreMember {
  id: number
  name: string
  districtId: number
}

/** Same building if within this many metres (the records sit under 1 m apart; a few metres of slack for rounding). */
export const SAME_SPOT_M = 5

/** Case, punctuation and spacing folded away so "St. Mary's Hall" matches "ST MARYS HALL". */
export const normaliseName = (s: string): string => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Booth id to its centre's members (sorted by district id, the booth itself included). Only centres of two or more
 * districts appear, so a lone booth is absent and its panel keeps no switch. Two records in one district never group.
 */
export function jointCentres(booths: readonly (CentreMember & { e: number; n: number })[]): Map<number, CentreMember[]> {
  const cell = SAME_SPOT_M
  const cells = new Map<string, typeof booths[number][]>()
  const key = (cx: number, cy: number): string => `${cx}:${cy}`
  for (const b of booths) {
    const k = key(Math.floor(b.e / cell), Math.floor(b.n / cell))
    const l = cells.get(k)
    if (l) l.push(b)
    else cells.set(k, [b])
  }
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  for (const b of booths) parent.set(b.id, b.id)
  for (const b of booths) {
    const cx = Math.floor(b.e / cell)
    const cy = Math.floor(b.n / cell)
    const nm = normaliseName(b.name)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const o of cells.get(key(cx + dx, cy + dy)) ?? []) {
          if (o.id <= b.id || o.districtId === b.districtId || normaliseName(o.name) !== nm) continue
          if (Math.hypot(o.e - b.e, o.n - b.n) > SAME_SPOT_M) continue
          parent.set(find(o.id), find(b.id))
        }
  }
  const groups = new Map<number, CentreMember[]>()
  for (const b of booths) {
    const r = find(b.id)
    const m = { id: b.id, name: b.name, districtId: b.districtId }
    const l = groups.get(r)
    if (l) l.push(m)
    else groups.set(r, [m])
  }
  const out = new Map<number, CentreMember[]>()
  for (const g of groups.values()) {
    // A chain that reaches the same district twice is not a joint centre of distinct districts: leave it out rather than guess.
    if (g.length < 2 || new Set(g.map((m) => m.districtId)).size !== g.length) continue
    g.sort((a, b) => a.districtId - b.districtId)
    for (const m of g) out.set(m.id, g)
  }
  return out
}

export interface ColocatedMember extends CentreMember {
  isEvc: boolean
}

/** Places this close count as one spot for the panel's switch (VE-301: all the real cases are under 4 m). */
export const COLOCATED_M = 10

/**
 * VE-301: places at one spot whatever their names (an early voting centre and an election day booth at one address, or
 * centres for neighbouring districts). Unlike `jointCentres` this feeds only the panel's "Results for:" switch, not the
 * stacked-dot badge. Booth id to its group (sorted by district, then name); lone places are absent.
 */
export function colocatedPlaces(places: readonly (ColocatedMember & { e: number; n: number })[]): Map<number, ColocatedMember[]> {
  const cell = COLOCATED_M
  const cells = new Map<string, (typeof places)[number][]>()
  const key = (cx: number, cy: number): string => `${cx}:${cy}`
  for (const b of places) {
    if (!Number.isFinite(b.e) || !Number.isFinite(b.n)) continue
    const k = key(Math.floor(b.e / cell), Math.floor(b.n / cell))
    const l = cells.get(k)
    if (l) l.push(b)
    else cells.set(k, [b])
  }
  const parent = new Map<number, number>(places.map((b) => [b.id, b.id]))
  const find = (x: number): number => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  for (const b of places) {
    const cx = Math.floor(b.e / cell)
    const cy = Math.floor(b.n / cell)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const o of cells.get(key(cx + dx, cy + dy)) ?? []) {
          if (o.id <= b.id || Math.hypot(o.e - b.e, o.n - b.n) > COLOCATED_M) continue
          parent.set(find(o.id), find(b.id))
        }
  }
  const groups = new Map<number, ColocatedMember[]>()
  for (const b of places) {
    if (!Number.isFinite(b.e) || !Number.isFinite(b.n)) continue
    const r = find(b.id)
    const m = { id: b.id, name: b.name, districtId: b.districtId, isEvc: b.isEvc }
    const l = groups.get(r)
    if (l) l.push(m)
    else groups.set(r, [m])
  }
  const out = new Map<number, ColocatedMember[]>()
  for (const g of groups.values()) {
    if (g.length < 2) continue
    g.sort((a, b) => a.districtId - b.districtId || a.name.localeCompare(b.name, 'en-AU'))
    for (const m of g) out.set(m.id, g)
  }
  return out
}
