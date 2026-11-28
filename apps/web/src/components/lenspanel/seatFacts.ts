/**
 * VE-282: the facts behind the seat panel on "Where is each party strongest?". Pure logic: the party across 2022 (state),
 * 2025 (federal) and tonight, its place in the seat, the three seats the Similar lens ranks nearest, and a few Census 2021
 * measures with the middle Victorian seat beside each. Everything here reads static assets or the lens's own rows; nothing is fetched.
 */
import type { PartyBucket } from '@vic26/schema'
import { partyLabel, type LensParty } from '../../derive/oneNation'
import type { FpShare } from '../../derive/seats'
import { PARTY_NAMES } from '../../parties'
import { BUCKETS, type LiveRow } from '../explore/one-nation/live'
import { nearest } from '../explore/similar/similarity'

/** One point on the over-time line. `wait` is a seat below the count gate; `none` is a party that did not stand. */
export type Point = { kind: 'pct'; pct: number } | { kind: 'none' } | { kind: 'wait' } | { kind: 'others' }
export type TonightPoint = { kind: 'pct'; pct: number; counted: number | null } | { kind: 'none' } | { kind: 'wait' }

export interface OverTime {
  /** null while the 2022 asset is loading. */
  y2022: Point | null
  fed2025: Point
  /** null before any figures: there is nothing to show yet. */
  tonight: TonightPoint | null
}

export interface OverTimeInput {
  /** The seat's 2022 first preferences by party bucket, or null while the asset loads. */
  fp2022: Readonly<Partial<Record<PartyBucket, number>>> | null
  /** The seat's 2025 row (what the lens drew before counting). */
  federal: LiveRow
  /** The seat's row on tonight's count, when the lens has one. */
  live?: LiveRow
  /** Per cent of the seat's enrolment counted, for the "% counted" label. */
  counted: number | null
}

export function overTime(party: LensParty, i: OverTimeInput): OverTime {
  const want = BUCKETS[party]
  let y2022: Point | null = null
  // VE-320: the 2022 asset is by party bucket, where Victorian Socialists are inside Others, so there is no figure of theirs (they did stand).
  if (i.fp2022 && party === 'VS') y2022 = { kind: 'others' }
  else if (i.fp2022) {
    const have = want.filter((b) => i.fp2022![b] !== undefined)
    y2022 = have.length === 0 ? { kind: 'none' } : { kind: 'pct', pct: have.reduce((n, b) => n + (i.fp2022![b] ?? 0), 0) }
  }
  const fed2025: Point = i.federal.notStanding ? { kind: 'none' } : { kind: 'pct', pct: i.federal.pct }
  let tonight: TonightPoint | null = null
  const l = i.live
  if (l?.noFigures) tonight = { kind: 'wait' }
  else if (l?.live) tonight = l.notStanding ? { kind: 'none' } : { kind: 'pct', pct: l.pct, counted: i.counted }
  return { y2022, fed2025, tonight }
}

export interface Place {
  place: number
  of: number
  /** Who leads on first preferences. */
  leader: string
}

/** The party's place among those with votes on first preferences, with Liberal and National as one Coalition entry. Null when it has no votes. */
export function placeIn(fp: readonly FpShare[], party: LensParty): Place | null {
  const merge = party === 'COA'
  const entries: { key: string; label: string; pct: number }[] = []
  for (const f of fp) {
    const coa = merge && (f.party === 'LIB' || f.party === 'NAT')
    const key = coa ? 'COA' : f.party
    const at = entries.find((e) => e.key === key)
    if (at) at.pct += f.pct
    else entries.push({ key, label: coa ? partyLabel('COA') : PARTY_NAMES[f.party], pct: f.pct })
  }
  entries.sort((a, b) => b.pct - a.pct)
  const mine = entries.findIndex((e) => (party === 'COA' ? e.key === 'COA' : e.key === party))
  if (mine < 0) return null
  return { place: mine + 1, of: entries.length, leader: entries[0]!.label }
}

export const ordinal = (n: number): string => {
  const t = n % 100
  if (t >= 11 && t <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

export interface LikeSeat {
  id: number
  name: string
  /** The party's share in that seat, in words: tonight's count where counted, else 2025 (before the count starts). */
  text: string
}

const f1 = (n: number) => n.toFixed(1)

/** The three seats most alike, from the same ranks the Similar lens uses, each with the party's share in the lens's own rows. */
export function mostLike(id: number, rows: ReadonlyMap<number, LiveRow>, names: ReadonlyMap<number, string>, n = 3): LikeSeat[] {
  return nearest(id, n).map((other) => {
    const r = rows.get(other)
    const text = !r ? '' : r.noFigures ? 'no figures yet' : r.notStanding ? 'did not stand' : r.live ? `${f1(r.pct)}%` : `${f1(r.pct)}% (2025)`
    return { id: other, name: names.get(other) ?? r?.name ?? String(other), text }
  })
}

// ---- demographics ----

/** The slice of the static one-nation asset this reads (ABS Census 2021 measures by seat). */
export interface DemoSources {
  districts: readonly { district_id: number; pct_year12?: number | null; pct_own_home?: number | null; pct_trades_labour?: number | null; people_per_km2?: number | null }[]
}

export interface DemoFact {
  key: string
  label: string
  value: string
  /** The middle (median) of the 88 seats, as the Victorian figure beside it. */
  vic: string
}

const whole = (n: number) => `${Math.round(n)}%`
const perKm = (n: number) => `${n >= 100 ? Math.round(n).toLocaleString('en-AU') : n.toFixed(1)} per km2`

/**
 * Four plain measures that already ship as a static asset (nothing new is fetched): schooling, home ownership, trades jobs
 * and how built-up the seat is. "Vic" is the middle of the 88 seats, not a population figure, and the panel says so.
 */
const MEASURES: readonly { key: 'pct_year12' | 'pct_own_home' | 'pct_trades_labour' | 'people_per_km2'; label: string; fmt: (n: number) => string }[] = [
  { key: 'pct_year12', label: 'Finished Year 12', fmt: whole },
  { key: 'pct_own_home', label: 'Own their home', fmt: whole },
  { key: 'pct_trades_labour', label: 'Jobs in trades or labouring', fmt: whole },
  { key: 'people_per_km2', label: 'People per square kilometre', fmt: perKm },
]

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function demoFacts(id: number, src: DemoSources): DemoFact[] {
  const mine = src.districts.find((d) => d.district_id === id)
  if (!mine) return []
  const out: DemoFact[] = []
  for (const m of MEASURES) {
    const v = mine[m.key]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const all = src.districts.map((d) => d[m.key]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    out.push({ key: m.key, label: m.label, value: m.fmt(v), vic: m.fmt(median(all)) })
  }
  return out
}

/**
 * The place sentence under the party's chart (VE-291). Each claim says which count it is about: the place is on first
 * preferences, and "leading" or "ahead" is only ever after preferences, as on the map and the seat panel, so the two never
 * read as one leader against another. `after` is the seat's leader after preferences (null when there is none yet).
 */
export function placeWords(p: Place, o: { party: LensParty; after: PartyBucket | null; final: boolean }): { rank: string; rest: string } {
  const when = o.final ? 'in the final count' : 'tonight'
  const coa = (q: PartyBucket) => q === 'LIB' || q === 'NAT'
  const mine = o.after !== null && (o.party === 'COA' ? coa(o.after) : o.after === o.party)
  const afterName = o.after === null ? null : PARTY_NAMES[o.after]
  // The first-preference leader's label is "Coalition" when Liberal and Nationals are merged.
  const afterIsFirst = afterName !== null && (afterName === p.leader || (p.leader === partyLabel('COA') && o.after !== null && coa(o.after)))
  let rest = ` on first preferences ${when}`
  if (p.place === 1) rest += mine ? ', leading.' : afterName ? `. ${afterName} ahead after preferences.` : '.'
  else rest += `. ${p.leader} first.${afterName && !afterIsFirst ? ` ${afterName} ahead after preferences.` : ''}`
  return { rank: `${ordinal(p.place)} of ${p.of}`, rest }
}
