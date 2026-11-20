import { useSyncExternalStore } from 'react'
import type { HeadlinePart } from '../derive/headline'

/**
 * What the phone's View sheet, the sheet handle and the "i" read from parts of the app that live elsewhere in the tree
 * (VE-144a). App.tsx hands each component only its own props, so each publishes the little the others need here when it
 * mounts and withdraws it when it goes: Rewind its toggle, Explore its sheet, the top band its short headline and in-doubt
 * button, the colour chips their "votes to come" line. A tiny external store, so nothing else about App changes.
 */
export interface PhoneBits {
  /** Explore's sheet of lenses: how many are offered, and the way to open it. */
  moreWays: { count: number; open: () => void } | null
  /** Rewind's pull-up: open or close it. */
  rewind: { toggle: () => void } | null
  /** The one-line headline and the in-doubt button for the sheet handle. */
  handle: { parts: readonly HeadlinePart[]; /** VE-221: "30% counted" ("turnout" at Final), the second line of the phone handle. */ counted: string; inDoubt: number; showDoubt: () => void } | null
  /** "About 2.3 million votes to come", for the "i" (it left the stage on a phone). */
  stillLine: string | null
  /** Where the colour chips are drawn while the View sheet is open (a portal target), else null. */
  colourSlot: HTMLElement | null
}

let bits: PhoneBits = { moreWays: null, rewind: null, handle: null, stillLine: null, colourSlot: null }
const listeners = new Set<() => void>()

/** Publishes one piece; a value the store already holds changes nothing (so an effect that re-runs does not re-render readers). */
export function setPhoneBit<K extends keyof PhoneBits>(key: K, value: PhoneBits[K]): void {
  if (Object.is(bits[key], value)) return
  bits = { ...bits, [key]: value }
  listeners.forEach((l) => l())
}

export function usePhoneBits(): PhoneBits {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => bits,
  )
}
