import type { PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../../parties'
import type { HexLabelText } from '../../derive/hexLabel'
import type { Focus } from '../../derive/focus'
import { evcRing } from './evc'
import { centresOf } from './panelInput'
import type { EvcGroup } from './evc'
import { boothAt, boothInFocus, boothSummary, dotRadius, type BoothRow, type BoothStatic } from './model'

/** The biggest dot's radius in pixels at the whole-state zoom; the smallest is the floor. A waiting booth is a speck. */
/** Largest to smallest counted dot is 4.2 / 2.7 in radius, so about 2.4 times in area (VE-153, FB-186; was 2.75 in radius, 7.6 in area). */
export const R_MAX = 4.2
export const R_FLOOR = 2.7
export const R_WAITING = 1.3

export interface BoothDot {
  id: number
  /** The place its panel opens (VE-208): its own id, or a centre's first id (a centre's `id` is only a draw key, below zero). */
  pick: number
  name: string
  districtId: number
  seatName: string
  e: number
  n: number
  state: 'waiting' | 'counted'
  leader: PartyBucket | null
  formal: number
  /** Leader's share of the booth's first preferences, whole per cent. */
  share: number
  /** Radius in pixels at the whole-state zoom; the pane scales it with the zoom. */
  r0: number
  /** In the tally pick (or no pick): drawn at full strength. */
  lit: boolean
  /** Another seat is picked and this booth is not in it: drawn faint so the picked seat's booths stand out (VE-153). */
  faded: boolean
  /** In the picked seat: wears an outline. */
  outlined: boolean
  /** An early voting centre: drawn as a ringed dot. */
  evc?: true
  /** VE-301: an early voting centre whose point is outside every district it serves (the VEC places some so). */
  outside?: true
  /** A joint voting centre (VE-292): how many districts this building serves, when two or more. */
  joint?: number
}

export interface DotInput {
  booths: readonly BoothStatic[]
  byBooth: ReadonlyMap<number, readonly BoothRow[]>
  maxFormal: number
  /** The time shown, epoch ms. */
  at: number
  focus: Focus | null
  seats: ReadonlyMap<number, { name: string; close: boolean }>
  selected: number | null
  /** Early voting centres grouped to one per physical centre; drawn only when they have results (none on the 2022 replay). */
  evc?: readonly EvcGroup[]
  /**
   * Rewind (VE-153): draw only the booths that had reported by `at`, so they appear as the scrubber moves on. At the
   * live edge the waiting booths stay as faint specks, which tell the viewer what is still to come.
   */
  reportedOnly?: boolean
  /** VE-301: ids of places whose point is outside their own district. Absent where the shapes are not known. */
  outside?: ReadonlySet<number>
}

/**
 * Every booth as a dot for one moment. Order is the paint order: waiting booths first, then big booths before small,
 * so a small dot is never buried under a big one.
 */
export function buildDots(i: DotInput): BoothDot[] {
  const centres = centresOf(i.booths)
  const out = i.booths.map((b): BoothDot => {
    const s = boothSummary(boothAt(i.byBooth.get(b.id) as BoothRow[] | undefined, i.at))
    const seat = i.seats.get(b.districtId)
    const counted = s.state === 'counted'
    const leader = counted ? s.leader : null
    return {
      id: b.id,
      pick: b.id,
      name: b.name,
      districtId: b.districtId,
      seatName: seat?.name ?? `Seat ${b.districtId}`,
      e: b.e,
      n: b.n,
      state: s.state,
      leader,
      formal: counted ? s.formal : 0,
      share: counted ? s.share : 0,
      r0: counted ? dotRadius(s.formal, i.maxFormal, R_MAX, R_FLOOR) : R_WAITING,
      lit: boothInFocus(i.focus, leader, seat),
      outlined: i.selected !== null && b.districtId === i.selected,
      faded: i.selected !== null && b.districtId !== i.selected,
      ...(centres.has(b.id) ? { joint: centres.get(b.id)!.length } : {}),
    }
  })
  for (const [k, g] of (i.evc ?? []).entries()) {
    const rows = g.ids.map((id) => boothAt(i.byBooth.get(id) as BoothRow[] | undefined, i.at)).filter((r): r is BoothRow => r !== null)
    if (rows.length === 0) continue
    const fp = { ...rows[0]!.fp }
    for (const r of rows.slice(1)) for (const p of Object.keys(fp) as (keyof typeof fp)[]) fp[p] += r.fp[p]
    const s = boothSummary({ at: i.at, fp })
    if (s.state !== 'counted') continue
    // VE-301: a centre serving several seats opens the record whose own district holds the point, so the panel's seat is one
    // the dot sits in. Where none does, it opens the first and says the centre is outside.
    const members = g.members ?? g.ids.map((id, x) => ({ id, districtId: g.districtIds[x] ?? g.districtIds[0]! }))
    const inside = i.outside ? members.find((m) => !i.outside!.has(m.id)) : undefined
    const chosen = inside ?? members[0] ?? { id: g.ids[0]!, districtId: g.districtIds[0]! }
    const isOutside = i.outside !== undefined && inside === undefined && i.outside.has(chosen.id)
    const seat = i.seats.get(chosen.districtId)
    out.push({
      id: -(k + 1), pick: chosen.id, name: g.name, districtId: chosen.districtId, seatName: isOutside || g.districtIds.length <= 1 ? (seat?.name ?? '') : 'Several seats',
      ...(isOutside ? { outside: true as const } : {}),
      e: g.e, n: g.n, state: 'counted', leader: s.leader, formal: s.formal, share: s.share,
      r0: evcRing(dotRadius(s.formal, i.maxFormal, R_MAX, R_FLOOR)).radius,
      lit: boothInFocus(i.focus, s.leader, seat), outlined: g.districtIds.includes(i.selected ?? -1), faded: i.selected !== null && !g.districtIds.includes(i.selected), evc: true,
    })
  }
  const shown = i.reportedOnly ? out.filter((d) => d.state === 'counted') : out
  return shown.sort((a, b) => (a.state !== b.state ? (a.state === 'waiting' ? -1 : 1) : b.formal - a.formal || a.id - b.id))
}

/** VE-301: the one phrase for a centre placed outside the district it serves, shared by the hover label and the panel. */
export const outsideWords = (seat: string): string => `Early voting centre for ${seat} voters, located outside the district`

const votes = (n: number): string => n.toLocaleString('en-AU')

/** The words on a dot's hover or focus label: booth, leader and share, then seat and votes. */
export function boothLabel(d: BoothDot): HexLabelText {
  // A stacked dot: name the centre and how many districts it serves; the panel has each district's result (VE-292).
  if (d.joint) return { name: d.name, leader: d.leader, lead: `Joint voting centre, serves ${d.joint} districts`, extra: 'Tap for each district' }
  if (d.state === 'waiting' || d.leader === null) return { name: d.name, leader: null, lead: 'No figures yet', extra: d.seatName }
  if (d.outside) return { name: d.name, leader: d.leader, lead: `${PARTY_NAMES[d.leader]} ${d.share}%`, extra: `${outsideWords(d.seatName)}, ${votes(d.formal)} votes` }
  return { name: d.name, leader: d.leader, lead: `${PARTY_NAMES[d.leader]} ${d.share}%`, extra: `${d.seatName}, ${votes(d.formal)} votes` }
}
