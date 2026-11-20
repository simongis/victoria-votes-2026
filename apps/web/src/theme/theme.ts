/**
 * Theme state. "civic" is the one look (the retro "console" skin of VE-49 was removed in VE-116). The machinery stays
 * so a later theme can return without rewiring views: a `[data-theme]` token block, and views that never hold colour
 * literals but get a Palette read from the CSS tokens, so map and hex renderers follow the theme.
 */
import { createContext, useContext, useSyncExternalStore } from 'react'
import { PARTY_BUCKETS, type PartyBucket } from '@vic26/schema'
import { PARTY_COLOURS } from '../parties'

export const THEMES = ['civic'] as const
export type Theme = (typeof THEMES)[number]
export const DEFAULT_THEME: Theme = 'civic'
/** localStorage key for the remembered choice (per viewer, never shared). */
export const THEME_KEY = 'vic26.theme'

export function applyTheme(theme: Theme = DEFAULT_THEME, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme
}

const isTheme = (v: string | null): v is Theme => v !== null && (THEMES as readonly string[]).includes(v)

/**
 * Which theme to open in. A known `?theme=` (shareable links) beats the remembered choice, which beats the default.
 * Anything unrecognised, including the retired `console` from old links and local storage, falls back to civic.
 */
export function resolveTheme(search: string, stored: string | null): Theme {
  const asked = new URLSearchParams(search).get('theme')
  if (isTheme(asked)) return asked
  return isTheme(stored) ? stored : DEFAULT_THEME
}

// localStorage can be absent or throw (private windows, blocked site data): the app must work without it.
function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
}
function writeStored(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* not remembered: fine */
  }
}

let current: Theme = DEFAULT_THEME
const listeners = new Set<() => void>()
export const getTheme = (): Theme => current
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
/** The current theme, re-rendering the caller when it changes. */
export const useTheme = (): Theme => useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME)

/** Fetches what a theme needs beyond the base CSS (civic needs nothing). A future skin would load its styles here, so nobody else pays for them. */
const loadThemeAssets = async (): Promise<void> => undefined

interface SetOptions {
  root?: HTMLElement
  /** Test seam for the asset loader. */
  load?: (theme: Theme) => Promise<void>
}

/**
 * Switches theme. Assets load first and the attribute is set afterwards, because the map palette is read from the
 * theme's CSS tokens at that moment and must see them.
 */
export async function setTheme(theme: Theme, { root = document.documentElement, load = loadThemeAssets }: SetOptions = {}): Promise<void> {
  try {
    await load(theme)
  } catch {
    // Assets failed (offline): stay on the theme we have rather than half-apply a skin with no tokens.
    return
  }
  applyTheme(theme, root)
  writeStored(theme)
  current = theme
  listeners.forEach((fn) => fn())
}

/** Called once before the first render so the palette is the chosen theme's. */
export async function initTheme(search = location.search): Promise<void> {
  const stored = readStored()
  const theme = resolveTheme(search, stored)
  if (theme === DEFAULT_THEME) {
    applyTheme(theme)
    current = theme
    // A retired value (console) left in storage is replaced, so it cannot linger.
    if (stored !== null && stored !== theme) writeStored(theme)
    return
  }
  await setTheme(theme)
}

export type Rgb = [number, number, number]

export interface Palette {
  party: Record<PartyBucket, Rgb>
  /** "Leading, could still change" tints mix the party colour this far towards `tintBase`. */
  tintBase: Rgb
  tintAmount: number
  /** Ground behind the map and hexes. */
  paper: Rgb
  /** A district with no figures yet. */
  noResult: Rgb
  /** Edges between districts and hexes. */
  edge: Rgb
  /** Selection outline, shared by every view. */
  selected: Rgb
}

export function parseColour(v: string): Rgb | null {
  const s = v.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!
    const n = parseInt(h, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

/** Civic values, used when a token is missing (tests, or a theme that leaves one out). Same as tokens.css. */
const FALLBACK = {
  '--map-paper': '#f6f4ef',
  '--map-no-result': '#ffffff',
  '--map-edge': '#ffffff',
  '--map-selected': '#003174',
  '--map-tint-base': '#ffffff',
}

export function readPalette(get: (name: string) => string): Palette {
  const colour = (name: string, fallback: string): Rgb => parseColour(get(name)) ?? parseColour(fallback)!
  const tok = (name: keyof typeof FALLBACK) => colour(name, FALLBACK[name])
  const amount = Number.parseFloat(get('--map-tint-amount'))
  return {
    party: Object.fromEntries(PARTY_BUCKETS.map((p) => [p, colour(`--party-${p.toLowerCase()}`, PARTY_COLOURS[p])])) as Record<PartyBucket, Rgb>,
    tintBase: tok('--map-tint-base'),
    tintAmount: Number.isFinite(amount) ? amount : 0.6,
    paper: tok('--map-paper'),
    noResult: tok('--map-no-result'),
    edge: tok('--map-edge'),
    selected: tok('--map-selected'),
  }
}

/** The palette for the document's current theme. */
export function documentPalette(root: HTMLElement = document.documentElement): Palette {
  const style = getComputedStyle(root)
  return readPalette((name) => style.getPropertyValue(name))
}

export const PaletteContext = createContext<Palette>(readPalette(() => ''))
export const usePalette = (): Palette => useContext(PaletteContext)

export const css = ([r, g, b]: Rgb): string => `rgb(${r}, ${g}, ${b})`
