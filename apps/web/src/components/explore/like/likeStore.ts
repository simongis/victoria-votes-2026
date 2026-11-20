import { useMemo, useSyncExternalStore } from 'react'
import type { Seat } from '../../../derive/seats'
import { buildTable, likeRows, likeSummary, standardise, type LikeTable, type Profile } from '../../lenspanel/like'
import { loadPartyAsset } from '../one-nation/partyStore'
import { loadProfileData } from '../../../data/profileSource'
import { loadSeifa } from '../../profile/seifa'

/**
 * The picked seat and the standardised measures, shared by the lens (which draws them and owns the pick) and the side
 * panel (which ranks by them). A tiny module store, the same pattern as the party lens, keeps App.tsx free of both.
 */
export interface LikeData {
  table: LikeTable
  z: ReadonlyMap<number, Profile>
}
/** null: loading. 'failed': none of the three sources would load or validate. */
export type LikeState = LikeData | 'failed' | null

let picked: number | null = null
let data: LikeState = null
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const emit = () => listeners.forEach((fn) => fn())

export function setPicked(id: number | null): void {
  if (id === picked) return
  picked = id
  emit()
}
export function setLikeData(d: LikeState): void {
  if (d === data) return
  data = d
  emit()
}
export const usePicked = (): number | null => useSyncExternalStore(subscribe, () => picked, () => null)
export const useLikeData = (): LikeState => useSyncExternalStore(subscribe, () => data, () => null)

/**
 * The three sources, each checked against the 88 district ids; a source that will not load is left out and the measures it
 * carries are simply missing (seats still compare on the rest while they share enough). 'failed' only when all three fail.
 */
export async function loadLike(ids: ReadonlySet<number>): Promise<LikeData | 'failed'> {
  const [demos, party, seifa] = await Promise.all([
    loadProfileData().then((d) => d.demos, () => null),
    loadPartyAsset(ids),
    loadSeifa(ids),
  ])
  if (!demos && !party && !seifa) return 'failed'
  const table = buildTable(demos ?? [], party?.districts ?? [], seifa?.districts ?? [])
  return { table, z: standardise(table) }
}

/** The panel's summary line, also used by App for the rail's collapsed button on a phone. */
export function useLikeSummary(seats: ReadonlyMap<number, Seat>): string {
  const picked = usePicked()
  const data = useLikeData()
  return useMemo(() => {
    if (data === 'failed') return 'These figures are not available.'
    if (!data) return 'Loading...'
    return likeSummary(likeRows(seats.values(), data.z, picked), picked)
  }, [seats, data, picked])
}
