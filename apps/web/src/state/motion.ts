// VE-115 (ADR 0027): the one place that decides whether the app moves. Motion is on by default; the visitor turns it off
// with the Animations switch (remembered in local storage), and `?motion=1` or `?motion=0` forces it for tests and demos.
// The device's reduced-motion setting is only a hint (it prompts a one-time note), so this is the one file that reads it.
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { MotionMode } from '../transitions/timeline'

export const MOTION_KEY = 'vic26.motion'
export type MotionChoice = 'on' | 'off'

/** The slice of Storage used here, so tests can pass a fake (and a throwing one). */
export interface StoreLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Local storage can throw (private windows, blocked site data) or be absent, so every access is guarded. */
const browserStore = (): StoreLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readChoice(store: StoreLike | null = browserStore()): MotionChoice | null {
  try {
    const v = store?.getItem(MOTION_KEY)
    return v === 'on' || v === 'off' ? v : null
  } catch {
    return null
  }
}

export function writeChoice(choice: MotionChoice, store: StoreLike | null = browserStore()): void {
  try {
    store?.setItem(MOTION_KEY, choice)
  } catch {
    // Not remembered; the switch still works for this visit.
  }
}

/** URL beats storage, storage beats the default (on). */
export function resolveMotion(search: string, choice: MotionChoice | null): MotionMode {
  const url = new URLSearchParams(search).get('motion')
  if (url === '1') return 'full'
  if (url === '0') return 'reduced'
  return choice === 'off' ? 'reduced' : 'full'
}

/** The one-time note: the device asks for less motion and the visitor has not chosen either way. */
export const showDeviceNote = (deviceAsksLess: boolean, choice: MotionChoice | null): boolean => deviceAsksLess && choice === null

/** The device's setting, read for the note only. */
function deviceAsksForLess(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Plain getter for callers outside React (the transition runner, the tour, event handlers). */
export function getMotion(): MotionMode {
  return resolveMotion(typeof location === 'undefined' ? '' : location.search, readChoice())
}

/** CSS keys on `:root[data-motion="off"]`; one attribute for every stylesheet. */
function syncAttr(): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.motion = getMotion() === 'full' ? 'on' : 'off'
}
syncAttr() // at import, so the first paint already has it

const listeners = new Set<() => void>()
const emit = () => {
  syncAttr()
  listeners.forEach((l) => l())
}

export function setMotionChoice(choice: MotionChoice): void {
  writeChoice(choice)
  emit()
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  // Another tab changing the choice.
  const onStorage = (e: StorageEvent) => {
    if (e.key === MOTION_KEY || e.key === null) emit()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

// A primitive snapshot keeps useSyncExternalStore from re-rendering on every read.
const snapshot = (): string => `${getMotion()}|${readChoice() ?? ''}|${deviceAsksForLess() ? 1 : 0}`

export interface MotionState {
  mode: MotionMode
  /** What the switch shows: whether animations are on (a forcing URL counts). */
  on: boolean
  /** Whether to show the one-time "your device asks for less motion" note. */
  note: boolean
  /** VE-312: the device asks for less motion (a hint only; the Leader chips hold still on it, nothing else does). */
  deviceLess: boolean
  setOn: (on: boolean) => void
}

export function useMotion(): MotionState {
  const snap = useSyncExternalStore(subscribe, snapshot, () => 'full||0')
  const [mode, choice, device] = snap.split('|')
  useEffect(syncAttr, [snap])
  const setOn = useCallback((on: boolean) => setMotionChoice(on ? 'on' : 'off'), [])
  return {
    mode: mode as MotionMode,
    on: mode === 'full',
    note: showDeviceNote(device === '1', (choice || null) as MotionChoice | null),
    deviceLess: device === '1',
    setOn,
  }
}
