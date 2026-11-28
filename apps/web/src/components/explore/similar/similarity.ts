/**
 * VE-209 (FB-243): "Which places are alike, far apart?" Pure logic for the Similar lens. The data is place-similarity
 * ranks only: for each seat, the other 87 from most to least alike (similarity.json, built by scripts/build-similarity.mjs).
 * There are no scores, so nothing here says how alike two places are, only the order. The ranks describe places, not how anyone
 * votes; the lens (VE-212) then shows the counted votes beside them, and nothing here is a forecast.
 */
import raw from './similarity.json'

/** How many seats the lens threads to. */
export const NEAREST = 5

/** The data's credit: always shown behind the "i", whatever the forecast-link switch says (it is the data's credit, not the link's). */
/** VE-312 (Simon): the credit's lead words; SimilarLens follows them with the site's name (CREDIT_NAME), linked. */
export const SIMILAR_CREDIT = 'Place similarity:'

export type Order = Readonly<Record<string, readonly number[]>>

export const loadOrder = (): Order => (raw as { order: Order }).order

/**
 * The seat the lens opens on when none is selected on the stage, chosen at build time (scripts/build-similarity.mjs): the
 * seat whose five matches are on average furthest away, which suits "alike, far apart". Today that is Lowan.
 */
export const FEATURED: number = (raw as { featured: number }).featured

/** A fault in the ranks (every seat must rank each other seat exactly once), or null. Read once at load in tests, not on the page. */
export function validateOrder(order: Order): string | null {
  const ids = Object.keys(order).map(Number)
  const set = new Set(ids)
  for (const id of ids) {
    const o = order[String(id)]!
    if (o.length !== ids.length - 1) return `seat ${id}: expected ${ids.length - 1} ranks, got ${o.length}`
    if (new Set(o).size !== o.length || o.includes(id) || !o.every((x) => set.has(x))) return `seat ${id}: ranks are not each other seat once`
  }
  return null
}

const ORDER: Order = loadOrder()

/** The `n` seats most alike this one, most alike first. Empty for a seat the ranks do not know. */
export const nearest = (id: number, n: number = NEAREST): number[] => (ORDER[String(id)] ?? []).slice(0, n)

/** 1 for the most alike seat, up to 87; null for the seat itself or an unknown seat. */
export function rankOf(id: number, other: number): number | null {
  const at = (ORDER[String(id)] ?? []).indexOf(other)
  return at < 0 ? null : at + 1
}

/** The source map's four bands by rank: the nearest 5, then the next 15, 25 and 42. */
export const bandOf = (rank: number): 1 | 2 | 3 | 4 => (rank <= 5 ? 1 : rank <= 20 ? 2 : rank <= 45 ? 3 : 4)

/** Straight-line distance between two seat centres (map ticks of `tickMetres`), to the nearest 5 km and never under 5. */
export function kmBetween(a: { x: number; y: number }, b: { x: number; y: number }, tickMetres: number): number {
  return Math.max(5, Math.round((Math.hypot(a.x - b.x, a.y - b.y) * tickMetres) / 1000 / 5) * 5)
}

/** "315 km away": always shown once the map's seat centres have loaded, else null. */
export const awayLine = (km: number | null): string | null => (km === null ? null : `${km} km away`)

/** The row's spoken name: rank, place, distance, the vote line (VE-212), then what a press does. */
export const rowLabel = (rank: number, name: string, away: string | null, status: string): string =>
  `${[`${rank}. ${name}`, away, status].filter(Boolean).join(', ')}. Make it the picked seat`
