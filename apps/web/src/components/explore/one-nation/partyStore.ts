import { useSyncExternalStore } from 'react'
import type { OneNationAsset, ShareParty } from '@vic26/schema'
import { DEFAULT_PARTY, validateAsset } from '../../../derive/oneNation'
import type { SeatFlow } from './flow'

/**
 * The chosen party, shared by the lens (which draws it) and the side panel (which ranks it). The lens owns the setting;
 * the panel only reads it. A tiny module store keeps App.tsx free of the choice.
 */
let current: ShareParty = DEFAULT_PARTY
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setParty(p: ShareParty): void {
  if (p === current) return
  current = p
  listeners.forEach((fn) => fn())
}
/** The lens opens on One Nation each time (FB-162), so closing it puts the choice back. */
export const resetParty = () => setParty(DEFAULT_PARTY)
export const useParty = (): ShareParty => useSyncExternalStore(subscribe, () => current, () => DEFAULT_PARTY)

/** The asset, imported once (its own chunk) and checked against the district statics every time (hold last good). `null` means it would not load or would not validate. */
export async function loadPartyAsset(ids: ReadonlySet<number>): Promise<OneNationAsset | null> {
  try {
    const m = await import('./one-nation.json')
    return validateAsset(m.default, ids)
  } catch {
    return null
  }
}

/**
 * The other-votes split on show (VE-101g), published by the lens while its Other votes view is open and null otherwise.
 * The side panel reads it to rank seats by that split instead of by the party's federal share. Same one-way pattern as the party choice.
 */
let flow: readonly SeatFlow[] | null = null
const flowListeners = new Set<() => void>()
const subscribeFlow = (fn: () => void) => {
  flowListeners.add(fn)
  return () => flowListeners.delete(fn)
}
export function setFlow(rows: readonly SeatFlow[] | null): void {
  if (rows === flow) return
  flow = rows
  flowListeners.forEach((fn) => fn())
}
export const useFlow = (): readonly SeatFlow[] | null => useSyncExternalStore(subscribeFlow, () => flow, () => null)
