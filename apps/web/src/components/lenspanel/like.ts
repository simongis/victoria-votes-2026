/**
 * "Which seats are most like yours?" (VE-135, FB-174): pure logic for the Seats-like-this lens and its panel. Six plain
 * measures of the seat's residents (Census 2021 and SEIFA 2021, apportioned to the 2022 districts) are standardised across
 * the 88 seats and compared by distance. It says which seats are alike, never why anyone votes: a seat is not its people.
 */
import type { PartyBucket } from '@vic26/schema'
import type { Seat } from '../../derive/seats'
import { PARTY_NAMES } from '../../parties'

export interface LikeMeasure {
  key: 'pct_bachelor_plus' | 'pct_born_overseas' | 'pct_renting' | 'pct_trades_labour' | 'people_per_km2' | 'pct_irsd_q1'
  /** Plain words for the "i" and the measures table. */
  label: string
  /** Compare the log of the value: density runs from a few to thousands, and a few inner seats would otherwise swamp it. */
  log?: boolean
  fmt: (n: number) => string
}

const whole = (n: number) => `${Math.round(n)}%`
const perKm = (n: number) => (n >= 100 ? `${Math.round(n).toLocaleString('en-AU')} per km2` : `${n.toFixed(1)} per km2`)

export const LIKE_MEASURES: readonly LikeMeasure[] = [
  { key: 'pct_bachelor_plus', label: 'Adults with a degree', fmt: whole },
  { key: 'pct_born_overseas', label: 'Born overseas', fmt: whole },
  { key: 'pct_renting', label: 'Households renting', fmt: whole },
  { key: 'pct_trades_labour', label: 'Jobs in trades or labouring', fmt: whole },
  { key: 'people_per_km2', label: 'How crowded the seat is', log: true, fmt: perKm },
  { key: 'pct_irsd_q1', label: "Living in Victoria's most disadvantaged fifth", fmt: whole },
]

/** Seats are comparable only where they share at least this many of the six measures. */
export const MIN_SHARED = 4
/** How many seats the lens shows beside the picked one. */
export const NEAREST = 5

export type MeasureValues = Record<string, number | null>
/** Raw value per measure key, per district. */
export type LikeTable = ReadonlyMap<number, MeasureValues>
/** One z-score per LIKE_MEASURES entry, in that order; null where the seat has no figure. */
export type Profile = readonly (number | null)[]

interface DemoIn { district_id: number; pct_born_overseas: number | null; pct_renting: number | null; pct_bachelor_plus: number | null }
interface MoreIn { district_id: number; pct_trades_labour: number | null; people_per_km2: number | null }
interface SeifaIn { district_id: number; pct_irsd_q1: number | null }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Joins the three sources by district id. A seat missing from a source gets nulls for its measures; nothing is invented. */
export function buildTable(demos: readonly DemoIn[], more: readonly MoreIn[], seifa: readonly SeifaIn[]): LikeTable {
  const ids = new Set<number>([...demos, ...more, ...seifa].map((r) => r.district_id))
  const byId = <T extends { district_id: number }>(rows: readonly T[]) => new Map(rows.map((r) => [r.district_id, r as unknown as Record<string, unknown>]))
  const sources = [byId(demos), byId(more), byId(seifa)]
  const out = new Map<number, MeasureValues>()
  for (const id of ids) {
    const vals: MeasureValues = {}
    for (const k of LIKE_MEASURES) {
      let v: number | null = null
      for (const s of sources) {
        const found = num(s.get(id)?.[k.key])
        if (found !== null) v = found
      }
      vals[k.key] = v
    }
    out.set(id, vals)
  }
  return out
}

/** z-scores per measure across the seats that have it (population sd). A measure that does not vary gives everyone 0. */
export function standardise(table: LikeTable): Map<number, Profile> {
  const usable = (m: LikeMeasure, v: number | null): v is number => v !== null && (!m.log || v > 0)
  const stats = LIKE_MEASURES.map((m) => {
    const xs = [...table.values()]
      .map((r) => num(r[m.key]))
      .filter((v): v is number => usable(m, v))
      .map((v) => (m.log ? Math.log(v) : v))
    const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
    const sd = xs.length ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) : 0
    return { mean, sd }
  })
  const out = new Map<number, Profile>()
  for (const [id, r] of table) {
    out.set(
      id,
      LIKE_MEASURES.map((m, i) => {
        const v = num(r[m.key])
        if (!usable(m, v)) return null
        const { mean, sd } = stats[i]!
        return sd === 0 ? 0 : ((m.log ? Math.log(v) : v) - mean) / sd
      }),
    )
  }
  return out
}

/**
 * Root-mean-square gap over the measures both seats have. Averaging (not summing) means a seat with a gap in its data
 * does not look closer for having fewer terms. Null when they share too few to compare.
 */
export function distanceBetween(a: Profile, b: Profile): number | null {
  let sum = 0
  let n = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x == null || y == null) continue
    sum += (x - y) ** 2
    n++
  }
  return n < MIN_SHARED ? null : Math.sqrt(sum / n)
}

/** Every comparable seat but this one, nearest first; ties go to the lower id so the order never flickers between ticks. */
function ranked(id: number, z: ReadonlyMap<number, Profile>): { id: number; d: number }[] {
  const me = z.get(id)
  if (!me) return []
  const out: { id: number; d: number }[] = []
  for (const [other, p] of z) {
    if (other === id) continue
    const d = distanceBetween(me, p)
    if (d !== null) out.push({ id: other, d })
  }
  // Rounded so two seats the same distance away tie exactly, whatever the floating-point noise.
  const r = (d: number) => Math.round(d * 1e9)
  return out.sort((a, b) => r(a.d) - r(b.d) || a.id - b.id)
}

export function nearestIds(id: number, z: ReadonlyMap<number, Profile>, n = NEAREST): number[] {
  return ranked(id, z).slice(0, n).map((r) => r.id)
}

/** Tonight's leader where there is one, else the holder from the last election (2022). */
export const holderOf = (s: Seat): PartyBucket | null => s.leader ?? s.base
export const sameLeader = (a: Seat, b: Seat): boolean => {
  const x = holderOf(a)
  return x !== null && x === holderOf(b)
}

export interface LikeRow {
  id: number
  name: string
  seat: Seat
  /** Distance from the picked seat (smaller is more alike); null for the picked seat itself, or with nothing picked or comparable. */
  distance: number | null
  /** 1..n for the nearest seats; null for the rest. */
  rank: number | null
  isPicked: boolean
}

/** With nothing picked, every seat by name. With a seat picked, it first, then the rest nearest first (seats it cannot be compared with last, by name). */
export function likeRows(seats: Iterable<Seat>, z: ReadonlyMap<number, Profile>, picked: number | null, n = NEAREST): LikeRow[] {
  const list = [...seats]
  const byName = (a: Seat, b: Seat) => a.name.localeCompare(b.name)
  if (picked === null) return list.sort(byName).map((seat) => ({ id: seat.id, name: seat.name, seat, distance: null, rank: null, isPicked: false }))
  const order = ranked(picked, z)
  const dist = new Map(order.map((r) => [r.id, r.d]))
  const pos = new Map(order.map((r, i) => [r.id, i]))
  const near = new Set(order.slice(0, n).map((r) => r.id))
  const key = (s: Seat) => (s.id === picked ? -1 : pos.get(s.id) ?? Infinity)
  return list
    .sort((a, b) => (key(a) === key(b) ? 0 : key(a) < key(b) ? -1 : 1) || byName(a, b))
    .map((seat) => ({ id: seat.id, name: seat.name, seat, distance: dist.get(seat.id) ?? null, rank: near.has(seat.id) ? pos.get(seat.id)! + 1 : null, isPicked: seat.id === picked }))
}

export function likeSummary(rows: readonly LikeRow[], picked: number | null): string {
  const me = picked === null ? undefined : rows.find((r) => r.id === picked)
  if (!me) return 'Pick a seat to see the seats most like it.'
  const near = rows.filter((r) => r.rank !== null).sort((a, b) => a.rank! - b.rank!)
  if (near.length === 0) return `Not enough figures to compare ${me.name}.`
  const same = near.filter((r) => sameLeader(me.seat, r.seat)).length
  return `Most like ${me.name}: ${near.map((r) => r.name).join(', ')}. ${same} of ${near.length} ${same === 1 ? 'has' : 'have'} the same leader.`
}

/** One plain line for a card: tonight's two-candidate split, else the leader, else who held the seat at the last election. */
export function voteLine(s: Seat): string {
  if (s.tcp && s.tcp.b) return `${PARTY_NAMES[s.tcp.a]} ${Math.round(s.tcp.pctA)}% v ${PARTY_NAMES[s.tcp.b]} ${Math.round(100 - s.tcp.pctA)}%`
  if (s.leader) return `${PARTY_NAMES[s.leader]} leading`
  if (s.base) return `Held by ${PARTY_NAMES[s.base]} in ${s.baseNote || '2022'}`
  return 'No result yet'
}
