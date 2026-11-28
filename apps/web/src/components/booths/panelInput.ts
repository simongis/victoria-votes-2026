import type { PlaceInput, SeatNow } from '../../derive/boothPanel'
import type { BoothData } from './data'
import type { BoothStatic } from './model'
import { colocatedPlaces, jointCentres, normaliseName, type CentreMember, type ColocatedMember } from '../../derive/jointCentres'
import { outsideOwnDistrict } from '../../derive/pointInDistrict'
import type { GeoCollection } from '../../data/types'
import { closedFor } from '../../data/closedPlaces'

const centreCache = new WeakMap<object, Map<number, CentreMember[]>>()
/** The joint voting centres in the booth set (VE-292), computed once per load. */
export function centresOf(booths: readonly BoothStatic[]): Map<number, CentreMember[]> {
  let c = centreCache.get(booths)
  if (!c) centreCache.set(booths, (c = jointCentres(booths)))
  return c
}

const colocatedCache = new WeakMap<object, WeakMap<object, Map<number, ColocatedMember[]>>>()
/** VE-301: every place (booth or early voting centre) with others at its spot, whatever their names. Computed once per load. */
export function colocatedOf(d: Pick<BoothData, 'booths' | 'evc'>): Map<number, ColocatedMember[]> {
  let byEvc = colocatedCache.get(d.booths)
  if (!byEvc) colocatedCache.set(d.booths, (byEvc = new WeakMap()))
  let c = byEvc.get(d.evc)
  if (!c) byEvc.set(d.evc, (c = colocatedPlaces([...d.booths.map((b) => ({ ...b, isEvc: false })), ...d.evc.map((b) => ({ ...b, isEvc: true }))])))
  return c
}

const outsideCache = new WeakMap<object, WeakMap<object, Set<number>>>()
/** VE-301: ids of places whose point is outside their own district, computed once per load and district file. */
export function outsideOf(d: Pick<BoothData, 'booths' | 'evc'>, districts: GeoCollection<{ district_id: number }>): Set<number> {
  let byEvc = outsideCache.get(districts)
  if (!byEvc) outsideCache.set(districts, (byEvc = new WeakMap()))
  let s = byEvc.get(d.evc)
  if (!s) byEvc.set(d.evc, (s = outsideOwnDistrict([...d.booths, ...d.evc], districts)))
  return s
}

/** The "Results for:" buttons: by district when the records share a name, by place name and district when they do not. */
export function centreButtons(members: readonly ColocatedMember[], seatNames: ReadonlyMap<number, string>): { id: number; districtId: number; seat: string }[] {
  const sameName = new Set(members.map((m) => normaliseName(m.name))).size === 1
  return members.map((m) => {
    const seat = seatNames.get(m.districtId) ?? `District ${m.districtId}`
    return { id: m.id, districtId: m.districtId, seat: sameName ? seat : `${m.name} (${seat})` }
  })
}

/** A place by id: an election-day polling place or an early voting centre. Null for an id the source does not have (a stale or mistyped link). */
export function findPlace(d: Pick<BoothData, 'booths' | 'evc'>, id: number): { place: BoothStatic; isEvc: boolean } | null {
  const b = d.booths.find((x) => x.id === id)
  if (b) return { place: b, isEvc: false }
  const e = d.evc.find((x) => x.id === id)
  return e ? { place: e, isEvc: true } : null
}

export interface PanelContext {
  /** The time the stage shows, epoch ms. The panel reads this and nothing else for "now", so Rewind and a ?now= link agree with the map. */
  at: number
  seats: ReadonlyMap<number, SeatNow>
  /** Snapshot times of the night so far. */
  ticks: readonly number[]
  /** The replay compares 2022 with 2022, so its swing means nothing. */
  sameElection: boolean
  /** VE-301: the district shapes, to tell whether a centre sits outside the district it serves. Absent: nothing is said. */
  districts?: GeoCollection<{ district_id: number }>
}

/** A seat's places by name, for the keyboard's "another place" list and the seat panel's "Polling places in <seat>" links. */
export function placesInSeat(d: Pick<BoothData, 'booths' | 'evc'>, districtId: number): { id: number; name: string }[] {
  return [...d.booths.map((p) => ({ p, isEvc: false })), ...d.evc.map((p) => ({ p, isEvc: true }))]
    .filter((x) => x.p.districtId === districtId)
    .map((x) => ({ id: x.p.id, name: x.isEvc && !/early|evc/i.test(x.p.name) ? `${x.p.name} (early voting)` : x.p.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-AU'))
}

/** What the panel derives from, and the seat's other places for the keyboard's "another place" list. Null when the place or its seat is unknown. */
export function placeInput(d: BoothData, id: number, c: PanelContext): { input: PlaceInput; others: { id: number; name: string }[]; centre: { id: number; districtId: number; seat: string }[]; outside: boolean; redirectId: number | null } | null {
  const found = findPlace(d, id)
  const seat = found ? c.seats.get(found.place.districtId) : undefined
  if (!found || !seat) return null
  const inSeat = [...d.booths.map((p) => ({ p, isEvc: false })), ...d.evc.map((p) => ({ p, isEvc: true }))].filter((x) => x.p.districtId === found.place.districtId)
  const mates = inSeat.filter((x) => x.p.id !== id)
  return {
    input: {
      place: found.place,
      isEvc: found.isEvc,
      rows: d.byBooth.get(id),
      at: c.at,
      seat,
      mates: mates.map((m) => ({ place: m.p, isEvc: m.isEvc, rows: d.byBooth.get(m.p.id) })),
      sameElection: c.sameElection,
      ticks: c.ticks,
    },
    others: placesInSeat(d, found.place.districtId),
    centre: centreButtons(colocatedOf(d).get(id) ?? [], new Map([...c.seats].map(([k, s]) => [k, s.name]))),
    redirectId: redirectOf(d, found.place),
    outside: found.isEvc && c.districts !== undefined && outsideOf(d, c.districts).has(id),
  }
}

/** VE-306: where a closed place's votes are counted, as a place id in the same district; null when the place is open or the redirect is not in the data. */
export function redirectOf(d: Pick<BoothData, 'booths'>, place: BoothStatic): number | null {
  const closed = closedFor(place.districtId, place.name)
  if (!closed) return null
  const want = normaliseName(closed.redirect.name)
  return d.booths.find((b) => b.districtId === place.districtId && normaliseName(b.name) === want)?.id ?? null
}
