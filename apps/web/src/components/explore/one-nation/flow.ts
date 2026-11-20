/**
 * "Where did the other votes go?" (VE-101f): for each seat, how the votes of the candidates outside the top two split
 * between the top two. Election night only.
 *
 * The feed gives first preferences and the two-candidate count, not the full flow of preferences, so this is the honest
 * version of the sum: with first preferences A and B for the top two and O for everyone else, and two-candidate counts
 * A2 and B2 over the SAME votes, the others split (A2 - A) : (B2 - B), and the two gains add up to O. It is the split of
 * all the other candidates' votes together, not of any one party's voters.
 *
 * "The same votes" is the whole method. The two counts arrive at different times, so a booth only counts once it has
 * both, and each side is summed over those booths alone. Early and postal votes have no booth in the history, so they
 * are left out; the words say "polling places counted so far".
 */
import { PARTY_BUCKETS, type PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../../../parties'

/** A seat's matched booths must hold at least this many formal votes, or the split is too jumpy to show. */
export const MIN_BASE = 2000
/**
 * ...and at least this many votes for candidates outside the top two. 300 votes puts the split within about 3 points
 * (one standard error of a 50:50 split is 50/sqrt(300)), enough to place a dot on a 0 to 100 line.
 */
export const MIN_OTHERS = 300
/** The mode is offered once this many seats qualify: half of the 88, so the picture has a shape before it appears (on the 2022 replay, about 8 pm). */
export const MIN_SEATS = 44

/**
 * Buckets that can hold more than one candidate. If a finalist is an Independent or Other, the first preferences for
 * "that party" include candidates who are not in the top two, so the sum would be wrong. Those seats are left out.
 */
const AMBIGUOUS: readonly PartyBucket[] = ['IND', 'OTH']

export type Fp = Record<PartyBucket, number>
export interface BoothState {
  fp: Fp
  /** The booth's two-candidate pair leader and their percentage, null until the booth has a two-candidate count. */
  tcpA: PartyBucket | null
  tcpPctA: number | null
}
export interface FlowRow extends BoothState {
  at: number
}
/** District id, then booth id, then that booth's rows oldest first. */
export type FlowBooths = Map<number, Map<number, FlowRow[]>>

export interface Columns {
  fields: string[]
  rows: unknown[][]
}

const zero = (): Fp => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0 })
const formalOf = (fp: Fp): number => PARTY_BUCKETS.reduce((n, p) => n + fp[p], 0)

export function parseFlowHistory(cols: Columns): FlowBooths {
  const col = (name: string) => cols.fields.indexOf(name)
  const at = col('snapshot_at')
  const booth = col('booth_id')
  const district = col('district_id')
  const a = col('tcp_party_a')
  const pct = col('tcp_pct_a')
  const idx = PARTY_BUCKETS.map((p) => col(`fp_${p}`))
  const out: FlowBooths = new Map()
  for (const r of cols.rows) {
    const fp = zero()
    PARTY_BUCKETS.forEach((p, i) => {
      fp[p] = Number(r[idx[i]!]) || 0
    })
    const party = r[a]
    const pctA = r[pct]
    const row: FlowRow = {
      at: Number(r[at]),
      fp,
      tcpA: typeof party === 'string' && (PARTY_BUCKETS as readonly string[]).includes(party) ? (party as PartyBucket) : null,
      tcpPctA: typeof pctA === 'number' && Number.isFinite(pctA) ? pctA : null,
    }
    const d = Number(r[district])
    let booths = out.get(d)
    if (!booths) out.set(d, (booths = new Map()))
    const list = booths.get(Number(r[booth]))
    if (list) list.push(row)
    else booths.set(Number(r[booth]), [row])
  }
  for (const booths of out.values()) for (const list of booths.values()) list.sort((x, y) => x.at - y.at)
  return out
}

/** A booth's latest row at or before `at`, or null. */
function stateAt(rows: readonly FlowRow[], at: number): FlowRow | null {
  let found: FlowRow | null = null
  for (const r of rows) {
    if (r.at > at) break
    found = r
  }
  return found
}

export type Skip = 'pair' | 'base' | 'others' | 'negative'
export interface SeatFlow {
  id: number
  /** The top two, in the order the feed lists them (the leader first). */
  a: PartyBucket
  b: PartyBucket
  /** Of the votes for candidates outside the top two, the share (0 to 100) that went to `a`. `b` has the rest. */
  shareA: number
  /** Votes for candidates outside the top two, over the matched booths. */
  others: number
  /** All formal votes over the matched booths. */
  base: number
  booths: number
}
export type SeatFlowResult = ({ ok: true } & Omit<SeatFlow, 'id'>) | { ok: false; why: Skip }

/**
 * One seat's split over the booths that report both counts. A booth's two-candidate pair must be the seat's top two
 * (the other way round is fine). Skipped, with the reason, when a finalist's bucket is ambiguous, the matched votes are
 * too few, or a finalist lost votes between the two counts (the counts then do not describe the same votes).
 */
export function seatFlow(a: PartyBucket, b: PartyBucket, booths: readonly BoothState[]): SeatFlowResult {
  if (a === b || AMBIGUOUS.includes(a) || AMBIGUOUS.includes(b)) return { ok: false, why: 'pair' }
  let n = 0
  let base = 0
  let fpA = 0
  let fpB = 0
  let twoA = 0
  let twoB = 0
  for (const s of booths) {
    if (s.tcpA === null || s.tcpPctA === null) continue
    if (s.tcpA !== a && s.tcpA !== b) continue
    const formal = formalOf(s.fp)
    if (formal <= 0) continue
    // The two-candidate count covers every formal vote in the booth, so its size is the booth's formal votes.
    const pctForA = s.tcpA === a ? s.tcpPctA : 100 - s.tcpPctA
    n++
    base += formal
    fpA += s.fp[a]
    fpB += s.fp[b]
    twoA += (formal * pctForA) / 100
    twoB += (formal * (100 - pctForA)) / 100
  }
  if (n === 0 || base < MIN_BASE) return { ok: false, why: 'base' }
  const others = base - fpA - fpB
  if (others < MIN_OTHERS) return { ok: false, why: 'others' }
  const gainA = twoA - fpA
  const gainB = twoB - fpB
  // The feed rounds each booth's percentage to two places, worth well under a vote a booth; one vote a booth is generous.
  if (gainA < -n || gainB < -n) return { ok: false, why: 'negative' }
  const shareA = Math.min(100, Math.max(0, (100 * gainA) / (gainA + gainB)))
  return { ok: true, a, b, shareA, others, base, booths: n }
}

export interface FlowSeatInput {
  id: number
  /** The seat's current top two, or null when withheld or not yet known. */
  tcp: { a: PartyBucket; b: PartyBucket | null } | null
}

/** Every seat's split at a moment (epoch ms), and how many seats had to be left out. */
export function flowRows(seats: readonly FlowSeatInput[], history: FlowBooths, at: number): { rows: SeatFlow[]; skipped: number } {
  const rows: SeatFlow[] = []
  let skipped = 0
  for (const seat of seats) {
    if (!seat.tcp || seat.tcp.b === null) {
      skipped++
      continue
    }
    const states: BoothState[] = []
    for (const list of history.get(seat.id)?.values() ?? []) {
      const s = stateAt(list, at)
      if (s) states.push(s)
    }
    const r = seatFlow(seat.tcp.a, seat.tcp.b, states)
    if (r.ok) {
      rows.push({ id: seat.id, a: r.a, b: r.b, shareA: r.shareA, others: r.others, base: r.base, booths: r.booths })
    } else skipped++
  }
  return { rows, skipped }
}

export const flowReady = (rows: readonly unknown[]): boolean => rows.length >= MIN_SEATS

const pct0 = (v: number) => Math.round(v)
export function flowSentence(r: SeatFlow, name: string): string {
  const a = pct0(r.shareA)
  return `${name}: of ${r.others.toLocaleString('en-AU')} votes for candidates outside the top two, ${a}% went to ${PARTY_NAMES[r.a]} and ${100 - a}% to ${PARTY_NAMES[r.b]} (${r.booths} polling place${r.booths === 1 ? '' : 's'} counted so far).`
}

export interface LaneItem {
  id: number
  /** Share (0 to 100) of the other votes that went to the lane's first party. */
  shareX: number
}
export interface Lane {
  x: PartyBucket
  y: PartyBucket
  items: LaneItem[]
}

/**
 * One lane per pairing of finalists, the same party always first (Labor before Liberal before Nationals...), so the
 * left-right reading is the same in every lane. Biggest lanes first.
 */
export function flowLanes(rows: readonly SeatFlow[]): Lane[] {
  const order = (p: PartyBucket) => PARTY_BUCKETS.indexOf(p)
  const lanes = new Map<string, Lane>()
  for (const r of rows) {
    const swap = order(r.b) < order(r.a)
    const x = swap ? r.b : r.a
    const y = swap ? r.a : r.b
    const key = `${x}-${y}`
    let lane = lanes.get(key)
    if (!lane) lanes.set(key, (lane = { x, y, items: [] }))
    lane.items.push({ id: r.id, shareX: swap ? 100 - r.shareA : r.shareA })
  }
  return [...lanes.values()].sort((p, q) => q.items.length - p.items.length || order(p.x) - order(q.x) || order(p.y) - order(q.y))
}
