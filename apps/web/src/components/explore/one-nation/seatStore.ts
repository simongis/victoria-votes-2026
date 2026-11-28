import { useSyncExternalStore } from 'react'
import type { Seat } from '../../../derive/seats'

/**
 * VE-282: the seat picked on "Where is each party strongest?". The lens owns the pick (a click, tap or Enter on a seat); the
 * seat facts panel lives in the rail, outside the lens, so it reads the pick from here (the same pattern as the Multiples lens's
 * pickStore). `seats` is the night's seats at the time on show, for tonight's place and % counted; `clear` puts the pick down
 * and `show` sends the seat to the main map. `replay` is the lens's replay flag, so the panel marks replay data (hard rule 2).
 */
export interface SeatPick {
  id: number | null
  seats: ReadonlyMap<number, Seat>
  replay: boolean
  /** Every seat is declared, so words say "final count". */
  final: boolean
  /** The word for the replay or trial marker, when the data is not live. */
  notLive: string | null
  clear: (() => void) | null
  show: ((id: number) => void) | null
  /** Pick another seat (a "seats most like this one" row). */
  pickOther: ((id: number) => void) | null
}

const EMPTY: SeatPick = { id: null, seats: new Map(), replay: true, final: false, notLive: null, clear: null, show: null, pickOther: null }
let state: SeatPick = EMPTY
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setSeatPick(next: SeatPick): void {
  state = next
  listeners.forEach((fn) => fn())
}
export const clearSeatPick = (): void => setSeatPick(EMPTY)
export const useSeatPickStore = (): SeatPick => useSyncExternalStore(subscribe, () => state, () => EMPTY)
