import type { PlaceInput, SeatNow } from '../../derive/boothPanel'
import type { BoothData } from './data'
import type { BoothStatic } from './model'

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
}

/** A seat's places by name, for the keyboard's "another place" list and the seat panel's "Polling places in <seat>" links. */
export function placesInSeat(d: Pick<BoothData, 'booths' | 'evc'>, districtId: number): { id: number; name: string }[] {
  return [...d.booths.map((p) => ({ p, isEvc: false })), ...d.evc.map((p) => ({ p, isEvc: true }))]
    .filter((x) => x.p.districtId === districtId)
    .map((x) => ({ id: x.p.id, name: x.isEvc && !/early|evc/i.test(x.p.name) ? `${x.p.name} (early voting)` : x.p.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-AU'))
}

/** What the panel derives from, and the seat's other places for the keyboard's "another place" list. Null when the place or its seat is unknown. */
export function placeInput(d: BoothData, id: number, c: PanelContext): { input: PlaceInput; others: { id: number; name: string }[] } | null {
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
  }
}
