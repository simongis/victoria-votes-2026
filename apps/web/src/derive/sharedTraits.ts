/**
 * VE-213 (FB-251): "What they share" for the places-like-yours lens. The ranking comes from a place model whose
 * dimensions are not labelled, so these six Census and SEIFA measures did not create the match. This only reports,
 * as observed fact, where the picked seat and its five sit in the same third of the 88. It never says why.
 */
export interface TraitMeasure {
  key: string
  /** Column heading in the "i" table. */
  label: string
  high: string
  low: string
  fmt: (n: number) => string
}

const whole = (n: number) => `${Math.round(n)}%`
const perKm = (n: number) => (n >= 100 ? `${Math.round(n).toLocaleString('en-AU')} per km2` : `${n.toFixed(1)} per km2`)

/** The six measures the retired Like lens used, with the plain words for each end. Order breaks ties between equally tight ones. */
export const TRAIT_MEASURES: readonly TraitMeasure[] = [
  { key: 'pct_bachelor_plus', label: 'Adults with a degree', high: 'many university degrees', low: 'few university degrees', fmt: whole },
  { key: 'pct_born_overseas', label: 'Born overseas', high: 'many born overseas', low: 'few born overseas', fmt: whole },
  { key: 'pct_renting', label: 'Households renting', high: 'many renters', low: 'few renters', fmt: whole },
  { key: 'pct_trades_labour', label: 'Jobs in trades or labouring', high: 'more trades jobs', low: 'fewer trades jobs', fmt: whole },
  { key: 'people_per_km2', label: 'People per square kilometre', high: 'built-up', low: 'spread out', fmt: perKm },
  { key: 'pct_irsd_q1', label: 'In the most disadvantaged fifth', high: 'more disadvantage', low: 'less disadvantage', fmt: whole },
]

export type TraitTable = ReadonlyMap<number, Readonly<Record<string, number | null>>>

export interface SharedTrait {
  key: string
  label: string
  side: 'high' | 'low'
  phrase: string
  /** Spread of the six seats' positions (0 to 1) on this measure: smaller is tighter. */
  spread: number
  /** The picked seat first, then the five in order; null where a seat has no figure. */
  values: { id: number; value: number | null; text: string | null }[]
}

/** How many of the five must sit with the picked seat. */
const NEED = 4
const MAX_ITEMS = 3

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Each seat's position from 0 (lowest) to 1 (highest) among the seats with a figure; ties share the middle of their run. */
function positions(all: readonly number[]): (v: number) => number {
  const sorted = [...all].sort((a, b) => a - b)
  const n = sorted.length
  return (v) => {
    if (n < 2) return 0.5
    let less = 0
    let equal = 0
    for (const x of sorted) {
      if (x < v) less++
      else if (x === v) equal++
    }
    return (less + (equal - 1) / 2) / (n - 1)
  }
}

const sideOf = (p: number): 'high' | 'low' | null => (p > 2 / 3 ? 'high' : p < 1 / 3 ? 'low' : null)

/**
 * The measures the picked seat and at least four of its five matches share, as a third of the 88 (top or bottom; the
 * middle never counts). Tightest first, at most three. A seat with no figure never counts as sharing.
 */
export function sharedTraits(pickedId: number, five: readonly number[], table: TraitTable): SharedTrait[] {
  const out: SharedTrait[] = []
  for (const m of TRAIT_MEASURES) {
    const all = [...table.values()].map((r) => num(r[m.key])).filter((v): v is number => v !== null)
    const pos = positions(all)
    const mine = num(table.get(pickedId)?.[m.key])
    if (mine === null) continue
    const side = sideOf(pos(mine))
    if (!side) continue
    const ids = [pickedId, ...five]
    const vals = ids.map((id) => num(table.get(id)?.[m.key]))
    const together = five.filter((_, i) => {
      const v = vals[i + 1]
      return v !== null && v !== undefined && sideOf(pos(v)) === side
    })
    if (together.length < NEED) continue
    const ps = vals.filter((v): v is number => v !== null).map(pos)
    out.push({
      key: m.key,
      label: m.label,
      side,
      phrase: m[side],
      spread: Math.max(...ps) - Math.min(...ps),
      values: ids.map((id, i) => ({ id, value: vals[i] ?? null, text: vals[i] == null ? null : m.fmt(vals[i]!) })),
    })
  }
  // Array.sort is stable, so equal spreads keep the measure order above.
  return out.sort((a, b) => a.spread - b.spread).slice(0, MAX_ITEMS)
}

/** "What they share: a, b and c." or null when there is nothing clear to say (no filler). */
export function sharedLine(traits: readonly Pick<SharedTrait, 'phrase'>[]): string | null {
  if (traits.length === 0) return null
  const ph = traits.map((t) => t.phrase)
  const list = ph.length === 1 ? ph[0]! : `${ph.slice(0, -1).join(', ')} and ${ph[ph.length - 1]}`
  return `What they share: ${list}.`
}
