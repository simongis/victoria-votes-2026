/**
 * Suburb and postcode lookup (VE-147): a reader who knows where they live but not their seat types it into the rail's
 * search and gets the seat. The data is a static asset built by `npm run build-lookup -w @vic26/demographics` from ABS
 * Mesh Blocks (ADR 0013, ADR 0025 pattern): lazy-loaded with the search, validated against the district statics, and
 * if it will not validate the search simply finds seats as before (hold last good).
 *
 * The row shape is documented here, beside the asset, rather than in packages/schema because it is not an AGOL layer.
 */

/** A row is [name, districtId, pct, districtId, pct, ...], biggest share first. */
export type PlaceRow = [name: string, ...shares: number[]]

export interface PlaceAsset {
  v: 1
  source: string
  suburbs: PlaceRow[]
  postcodes: PlaceRow[]
}

export interface PlaceShare {
  id: number
  pct: number
}

export interface Place {
  kind: 'suburb' | 'postcode'
  name: string
  /** Normalised once, for matching. */
  key: string
  shares: PlaceShare[]
}

export interface PlaceIndex {
  places: Place[]
}

/** Lowercase, no accents, no apostrophes, other punctuation as a space, single spaces. */
export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function parseRow(kind: Place['kind'], row: unknown, ids: ReadonlySet<number>): Place | null {
  if (!Array.isArray(row) || typeof row[0] !== 'string' || row[0] === '') return null
  const rest = row.slice(1)
  if (rest.length === 0 || rest.length % 2 !== 0) return null
  if (kind === 'postcode' && !/^\d{4}$/.test(row[0])) return null
  const shares: PlaceShare[] = []
  const seen = new Set<number>()
  let total = 0
  for (let i = 0; i < rest.length; i += 2) {
    const id = rest[i]
    const pct = rest[i + 1]
    if (typeof id !== 'number' || typeof pct !== 'number' || !ids.has(id) || seen.has(id)) return null
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) return null
    seen.add(id)
    total += pct
    shares.push({ id, pct })
  }
  if (total !== 100) return null
  return { kind, name: row[0], key: normalise(row[0]), shares }
}

/** Checks the whole asset; any bad row means no lookup at all rather than a wrong seat. */
export function validatePlaces(raw: unknown, ids: ReadonlySet<number>): PlaceIndex | null {
  if (typeof raw !== 'object' || raw === null) return null
  const a = raw as Partial<PlaceAsset>
  if (a.v !== 1 || !Array.isArray(a.suburbs) || !Array.isArray(a.postcodes)) return null
  const places: Place[] = []
  for (const [kind, rows] of [['suburb', a.suburbs], ['postcode', a.postcodes]] as const) {
    for (const r of rows) {
      const p = parseRow(kind, r, ids)
      if (!p) return null
      places.push(p)
    }
  }
  return { places }
}

let loading: Promise<unknown> | null = null
/** Imported once, in its own chunk, only when someone starts searching. Null means it would not load or would not validate. */
export async function loadPlaces(ids: ReadonlySet<number>): Promise<PlaceIndex | null> {
  try {
    loading ??= import('./places.json')
    const m = (await loading) as { default: unknown }
    return validatePlaces(m.default, ids)
  } catch {
    loading = null
    return null
  }
}

/** A letters query needs two characters, a postcode three digits, so one keystroke does not list half of Victoria. */
export function findPlaces(index: PlaceIndex, query: string, limit = 5): Place[] {
  const q = normalise(query)
  if (/^\d+$/.test(q)) {
    if (q.length < 3) return []
    return index.places.filter((p) => p.kind === 'postcode' && p.key.startsWith(q)).slice(0, limit)
  }
  if (q.length < 2) return []
  const ranked: { p: Place; rank: number }[] = []
  for (const p of index.places) {
    if (p.kind !== 'suburb') continue
    let rank = -1
    if (p.key === q) rank = 0
    else if (p.key.startsWith(q)) rank = 1
    else if (p.key.includes(` ${q}`)) rank = 2
    if (rank >= 0) ranked.push({ p, rank })
  }
  // Names within a rank stay in the asset's alphabetical order (Array.sort is stable).
  return ranked.sort((a, b) => a.rank - b.rank).slice(0, limit).map((r) => r.p)
}

/** Under this top share a place reads as a split, not as "mostly" one seat. */
const MOSTLY = 60

/** "Ballarat Central is in Wendouree" / "3350 is mostly Wendouree (70%), part Ripon (30%)" / "X is split between A (52%) and B (48%)". */
export function placeWords(place: Place, seatName: (id: number) => string): string {
  const [top, ...others] = place.shares
  if (!top) return place.name
  if (others.length === 0) return `${place.name} is in ${seatName(top.id)}`
  const part = (s: PlaceShare) => `${seatName(s.id)} (${s.pct}%)`
  if (top.pct >= MOSTLY) return `${place.name} is mostly ${part(top)}, ${others.map((s) => `part ${part(s)}`).join(', ')}`
  const all = place.shares.map(part)
  const last = all.pop()
  return `${place.name} is split between ${all.join(', ')} and ${last}`
}
