/// <reference types="vite/client" />
/**
 * VE-254: the words after "Replay:" on the marker and in the "i" sheet. A simulated 2026 night can be played from a replay
 * folder (conference demo), so the year is not always 2022: VITE_REPLAY_LABEL overrides it, in the dev server only. Never
 * empty (hard rule 2: a replay is always marked), so an empty or blank value falls back to the default.
 */
export const DEFAULT_REPLAY_LABEL = '2022, not live'

export function replayLabel(raw: string | undefined, allowed: boolean): string {
  const v = allowed ? raw?.trim() : ''
  return v ? v : DEFAULT_REPLAY_LABEL
}

export const REPLAY_LABEL = replayLabel(import.meta.env?.VITE_REPLAY_LABEL, import.meta.env?.DEV === true)
