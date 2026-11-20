import type { PartyBucket } from '@vic26/schema'

/**
 * Where the seats land in the Tally: slot layouts for the bar and the arc, and which seat takes which slot.
 * Pure, in canvas pixels. Slots run left to right, sorted by party, so Labor grows from the left and the
 * Coalition from the right with undecided seats between (the same order as the prototype).
 */

export const SEATS = 88
/** Seats needed for a majority of `total`. */
export const majorityOf = (total: number): number => Math.floor(total / 2) + 1

/** Left to right in the tally. null = no leader yet. */
export const PARTY_ORDER: (PartyBucket | null)[] = ['ALP', 'GRN', 'IND', 'OTH', null, 'ONP', 'NAT', 'LIB']
export const partyRank = (p: PartyBucket | null): number => {
  const i = PARTY_ORDER.indexOf(p)
  return i < 0 ? PARTY_ORDER.indexOf(null) : i
}

export interface Slot {
  cx: number
  cy: number
  w: number
  h: number
}

export interface TallyLayout {
  key: string
  slots: Slot[]
  /** Majority marker lines: 45 from the left and 45 from the right, as [x1, y1, x2, y2]. */
  lines: [number, number, number, number][]
  majX: number
  majY: number
  numL: { x: number; y: number }
  numR: { x: number; y: number }
  minorsY: number
  centreX: number
}

export type TallyKind = 'bar' | 'arc'

export function layoutBar(w: number, h: number, total = SEATS): TallyLayout {
  const maj = majorityOf(total)
  const barW = Math.min(w - 32, 1000)
  const x0 = (w - barW) / 2
  const sw = barW / total
  const bh = w < 600 ? 34 : 44
  const y = h * 0.5 - bh / 2
  const slots = Array.from({ length: total }, (_, i): Slot => ({ cx: x0 + (i + 0.5) * sw, cy: y + bh / 2, w: sw, h: bh }))
  const xa = x0 + maj * sw
  const xb = x0 + (total - maj) * sw
  return {
    key: `bar${w}x${h}`,
    slots,
    lines: [
      [xa, y - 7, xa, y + bh + 7],
      [xb, y - 7, xb, y + bh + 7],
    ],
    majX: (xa + xb) / 2,
    majY: y + bh + 12,
    numL: { x: x0, y: y - 62 },
    numR: { x: x0 + barW, y: y - 62 },
    minorsY: y + bh + 40,
    centreX: w / 2,
  }
}

export function layoutArc(w: number, h: number, total = SEATS): TallyLayout {
  const maj = majorityOf(total)
  const cx = w / 2
  const base = h * 0.6
  const R = Math.min(w * 0.46, h * 0.5)
  const rows = 4
  const rIn = R * 0.5
  const rs = Array.from({ length: rows }, (_, k) => rIn + ((R - rIn) * k) / (rows - 1))
  const sum = rs.reduce((a, b) => a + b, 0)
  const counts = rs.map((r) => Math.round((total * r) / sum))
  counts[rows - 1]! += total - counts.reduce((a, b) => a + b, 0)
  const pts: { ang: number; r: number }[] = []
  rs.forEach((r, k) => {
    const n = counts[k]!
    for (let j = 0; j < n; j++) pts.push({ ang: Math.PI - (Math.PI * (j + 0.5)) / n, r })
  })
  pts.sort((a, b) => b.ang - a.ang || a.r - b.r)
  const rowGap = (R - rIn) / (rows - 1)
  const c = Math.max(6, 0.82 * Math.min(rowGap, (Math.PI * rs[0]!) / counts[0]!))
  const slots = pts.map((p): Slot => ({ cx: cx + Math.cos(p.ang) * p.r, cy: base - Math.sin(p.ang) * p.r, w: c, h: c }))
  const angAt = (i: number) => (pts[i - 1]!.ang + pts[i]!.ang) / 2
  const line = (ang: number): [number, number, number, number] => [
    cx + Math.cos(ang) * (rIn - c),
    base - Math.sin(ang) * (rIn - c),
    cx + Math.cos(ang) * (R + c),
    base - Math.sin(ang) * (R + c),
  ]
  return {
    key: `arc${w}x${h}`,
    slots,
    lines: [line(angAt(maj)), line(angAt(total - maj))],
    majX: cx,
    majY: base - rIn * 0.45,
    numL: { x: cx - R, y: base + 12 },
    numR: { x: cx + R, y: base + 12 },
    minorsY: base + 78,
    centreX: cx,
  }
}

export const layoutFor = (kind: TallyKind, w: number, h: number, total = SEATS): TallyLayout =>
  kind === 'bar' ? layoutBar(w, h, total) : layoutArc(w, h, total)

export interface SeatSlot {
  /** Index into the layout's slots. */
  slot: number
  /** Position within the seat's party block (0 first): drives the flight stagger. */
  rank: number
}

export interface TallyCounts {
  alp: number
  coalition: number
  minor: Map<PartyBucket, number>
  undecided: number
}

export interface TallyAssignment {
  bySeat: Map<number, SeatSlot>
  counts: TallyCounts
}

/**
 * Within a party block, firm seats sit at the outer end (left edge for Labor and the left-hand parties, right
 * edge for the Coalition) and leading seats inside them, like the top-band bar. Lower sorts first.
 */
export const blockSub = (party: PartyBucket | null, firm: boolean): number =>
  party === 'LIB' || party === 'NAT' ? (firm ? 1 : 0) : firm ? 0 : 1

/**
 * One slot per seat, sorted by party order, then firm before leading (see blockSub), then by the seat's hex x (so a block keeps its geography and
 * the assignment is stable between ticks). The id breaks any remaining tie.
 */
export function assignSlots(seats: { id: number; party: PartyBucket | null; x: number; sub?: number }[]): TallyAssignment {
  const order = [...seats].sort((a, b) => partyRank(a.party) - partyRank(b.party) || (a.sub ?? 0) - (b.sub ?? 0) || a.x - b.x || a.id - b.id)
  const bySeat = new Map<number, SeatSlot>()
  const seen = new Map<number, number>()
  const counts: TallyCounts = { alp: 0, coalition: 0, minor: new Map(), undecided: 0 }
  order.forEach((s, slot) => {
    const r = partyRank(s.party)
    const rank = seen.get(r) ?? 0
    seen.set(r, rank + 1)
    bySeat.set(s.id, { slot, rank })
    if (s.party === 'ALP') counts.alp++
    else if (s.party === 'LIB' || s.party === 'NAT') counts.coalition++
    else if (s.party) counts.minor.set(s.party, (counts.minor.get(s.party) ?? 0) + 1)
    else counts.undecided++
  })
  return { bySeat, counts }
}

/** Slot geometry at a fractional slot index (a tick re-sort glides between two slots). */
export function slotAt(slots: Slot[], f: number): Slot {
  const a = slots[Math.max(0, Math.min(slots.length - 1, Math.floor(f)))]!
  const b = slots[Math.max(0, Math.min(slots.length - 1, Math.ceil(f)))]!
  const k = f - Math.floor(f)
  return { cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k }
}
