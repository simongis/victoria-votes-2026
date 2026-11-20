/** Screen state shared by every view: which tick is shown, which district is selected, and the stage's shape. */
export type Shape = 'map' | 'hex'
/** How the seats are filled (ADR 0018). Leader is the default and has no URL param. */
export type Colour = 'leader' | 'trust' | 'certainty' | 'gains'

/** Map is the default and has no URL param; any other value of ?shape= is ignored (ADR 0018). */
export function shapeFromSearch(search: string): Shape {
  return new URLSearchParams(search).get('shape') === 'hex' ? 'hex' : 'map'
}

/** The query string for a shape, keeping every other param (motion, theme, cadence). Returns '' or '?...'. */
export function withShape(search: string, shape: Shape): string {
  const q = new URLSearchParams(search)
  if (shape === 'hex') q.set('shape', 'hex')
  else q.delete('shape')
  const out = q.toString()
  return out ? `?${out}` : ''
}

// `?colour=certainty` is an old How sure link (VE-127): it is no longer offered, so it opens Leader.
const COLOUR_VALUES: readonly Colour[] = ['trust', 'gains']

export function colourFromSearch(search: string): Colour {
  const v = new URLSearchParams(search).get('colour')
  return COLOUR_VALUES.find((c) => c === v) ?? 'leader'
}

/** The query string for a colour, keeping every other param. Returns '' or '?...'. */
export function withColour(search: string, colour: Colour): string {
  const q = new URLSearchParams(search)
  if (colour === 'leader') q.delete('colour')
  else q.set('colour', colour)
  const out = q.toString()
  return out ? `?${out}` : ''
}

/**
 * Polling places (VE-77c) is a third choice beside Leader and Swing in the colour chips, but not a colour: the seats go
 * quiet and the booths are drawn over them. It lives apart from `colour` so going back to Leader or Swing restores the
 * seats as they were. It is Map only (the dots have no Hex), so a ?shape=hex link wins over ?places=1.
 */
export function placesFromSearch(search: string): boolean {
  const q = new URLSearchParams(search)
  // A ?booth= link (VE-208) is a polling place, so it opens Polling places by itself.
  return (q.get('places') === '1' || boothFromSearch(search) !== null) && q.get('shape') !== 'hex'
}

/** A polling place picked by link (?booth=<id>, VE-208). Whether the id exists is for the booth data to say; anything not a whole number is ignored. */
export function boothFromSearch(search: string): number | null {
  const v = new URLSearchParams(search).get('booth')
  return v !== null && /^-?\d+$/.test(v) ? Number(v) : null
}

/** The query string for the picked polling place, keeping every other param. Returns '' or '?...'. */
export function withBooth(search: string, id: number | null): string {
  const q = new URLSearchParams(search)
  if (id === null) q.delete('booth')
  else q.set('booth', String(id))
  const out = q.toString()
  return out ? `?${out}` : ''
}

/** The query string for polling places, keeping every other param. Returns '' or '?...'. */
export function withPlaces(search: string, on: boolean): string {
  const q = new URLSearchParams(search)
  if (on) q.set('places', '1')
  else q.delete('places')
  const out = q.toString()
  return out ? `?${out}` : ''
}

export interface ViewState {
  /** Latest tick index (the live head), -1 before any results. */
  nowIdx: number
  /** A past tick being viewed, or null when following live. */
  viewIdx: number | null
  selected: number | null
  /** What the one stage draws the 88 seats as. */
  shape: Shape
  /** How the one stage fills the seats. */
  colour: Colour
  /** Polling places on the Map (VE-77c). */
  places: boolean
  /** The polling place whose panel is open (VE-208), or null. Its seat is `selected`, so "See the seat" is just dropping this. */
  booth: number | null
  rewindOpen: boolean
  playing: boolean
  speed: number
}

export const initialView: ViewState = {
  nowIdx: -1,
  viewIdx: null,
  selected: null,
  shape: 'map',
  colour: 'leader',
  places: false,
  booth: null,
  rewindOpen: false,
  playing: false,
  speed: 1,
}

export type ViewAction =
  | { type: 'timeline'; nowIdx: number }
  | { type: 'select'; id: number | null }
  | { type: 'scrub'; idx: number }
  | { type: 'live' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'speed'; speed: number }
  | { type: 'shape'; shape: Shape }
  | { type: 'colour'; colour: Colour }
  | { type: 'places'; on: boolean }
  | { type: 'pickBooth'; id: number; seat: number }
  | { type: 'booth'; id: number | null }
  | { type: 'rewind'; open?: boolean }

export const shownIndex = (s: ViewState): number => s.viewIdx ?? s.nowIdx

/** A past index at or past the head means live. */
const past = (s: ViewState, idx: number): number | null => (idx >= s.nowIdx ? null : Math.max(0, idx))

export function viewReducer(s: ViewState, a: ViewAction): ViewState {
  switch (a.type) {
    case 'timeline': {
      const next = { ...s, nowIdx: a.nowIdx }
      return s.viewIdx === null ? next : { ...next, viewIdx: past(next, s.viewIdx) }
    }
    case 'select':
      return { ...s, selected: a.id === null || a.id === s.selected ? null : a.id, booth: null }
    case 'scrub':
      return { ...s, viewIdx: past(s, a.idx), playing: false }
    case 'live':
      // Back to now also tucks the panel away (FB-125): the pill has done its job once the viewer is back at the head.
      return { ...s, viewIdx: null, playing: false, rewindOpen: false }
    case 'play':
      if (s.nowIdx <= 0) return s
      return { ...s, playing: true, viewIdx: s.viewIdx ?? 0 }
    case 'pause':
      return { ...s, playing: false }
    case 'step': {
      const viewIdx = past(s, shownIndex(s) + 1)
      return { ...s, viewIdx, playing: viewIdx !== null && s.playing }
    }
    case 'speed':
      return { ...s, speed: a.speed }
    case 'shape':
      return { ...s, shape: a.shape }
    case 'colour':
      return { ...s, colour: a.colour }
    case 'places':
      return { ...s, places: a.on, booth: a.on ? s.booth : null }
    case 'pickBooth':
      return { ...s, booth: a.id, selected: a.seat }
    case 'booth':
      return { ...s, booth: a.id }
    case 'rewind':
      return { ...s, rewindOpen: a.open ?? !s.rewindOpen }
  }
}

/** The Explore lens open on the stage and how it is drawn (VE-82). Closed is null. Lens ids are checked by the host, so a new lens needs no change here. */
export type ExploreMode = 'map' | 'hex' | 'strip' | 'share' | 'like'
export interface ExploreState {
  lens: string
  mode: ExploreMode
}
const EXPLORE_MODES: readonly ExploreMode[] = ['map', 'hex', 'strip', 'share', 'like']

export function exploreFromSearch(search: string): ExploreState | null {
  const q = new URLSearchParams(search)
  const mode = q.get('mode')
  // Counted was a colour chip until VE-104; an old ?colour=counted link opens its lens rather than going nowhere.
  const raw = q.get('explore') ?? (q.get('colour') === 'counted' ? 'counted' : null)
  if (!raw) return null
  // VE-212: the Seats-like-this lens was merged into this one, so an old ?explore=like link opens it (the selected seat is kept by the app).
  const lens = raw === 'like' ? 'similar' : raw
  return { lens, mode: EXPLORE_MODES.find((m) => m === mode) ?? 'map' }
}

/** The query string for the open lens (explore and mode), keeping every other param. Map is the default mode, so it has no param. */
export function withExplore(search: string, e: ExploreState | null): string {
  const q = new URLSearchParams(search)
  q.delete('explore')
  q.delete('mode')
  if (e) {
    q.set('explore', e.lens)
    if (e.mode !== 'map') q.set('mode', e.mode)
  }
  const out = q.toString()
  return out ? `?${out}` : ''
}

/** Whether the link names a shape itself; if not, the lens's own default shape applies (VE-140). */
export function exploreModeGiven(search: string): boolean {
  const mode = new URLSearchParams(search).get('mode')
  return EXPLORE_MODES.some((m) => m === mode)
}

/**
 * What a `?explore=` link should do once the app can judge it (VE-140, FB-148). A link used to open its lens at once,
 * even before the results had loaded or when the lens had too little data (an empty "0 of 22 seats ready" lens), and on
 * Map even where the lens opens on Hex from the sheet. Now: wait for the results; open a ready lens on its default
 * shape (unless the link names one); otherwise return null so the main view shows, with no error.
 * `loaded` must mean everything `ready` reads has arrived (for Small multiples that includes the night so far).
 */
export function resolveExploreLink(
  link: ExploreState | null,
  modeGiven: boolean,
  ctx: { known: boolean; ready: boolean; loaded: boolean; defaultMode: ExploreMode },
): ExploreState | null | 'wait' {
  if (!link || !ctx.known) return null
  if (!ctx.loaded) return 'wait'
  if (!ctx.ready) return null
  return modeGiven ? link : { lens: link.lens, mode: ctx.defaultMode }
}
