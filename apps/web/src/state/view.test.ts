import { describe, expect, it } from 'vitest'
import { boothFromSearch, colourFromSearch, exploreFromSearch, exploreModeGiven, initialView, placesFromSearch, resolveExploreLink, shapeFromSearch, shownIndex, viewReducer, withBooth, withColour, withExplore, withPlaces, withShape, type ViewState } from './view'

const at = (over: Partial<ViewState> = {}): ViewState => ({ ...initialView, nowIdx: 10, ...over })

describe('viewReducer', () => {
  it('follows live by default and shows the latest tick', () => {
    expect(shownIndex(at())).toBe(10)
  })

  it('toggles the selected district and clears it with null', () => {
    let s = viewReducer(at(), { type: 'select', id: 5 })
    expect(s.selected).toBe(5)
    s = viewReducer(s, { type: 'select', id: 7 })
    expect(s.selected).toBe(7)
    s = viewReducer(s, { type: 'select', id: 7 })
    expect(s.selected).toBeNull()
    s = viewReducer(viewReducer(s, { type: 'select', id: 3 }), { type: 'select', id: null })
    expect(s.selected).toBeNull()
  })

  it('scrubs into the past and back to live at the head', () => {
    let s = viewReducer(at(), { type: 'scrub', idx: 4 })
    expect(s.viewIdx).toBe(4)
    expect(shownIndex(s)).toBe(4)
    s = viewReducer(s, { type: 'scrub', idx: 10 })
    expect(s.viewIdx).toBeNull()
  })

  it('stays on the past tick when a new tick arrives', () => {
    const s = viewReducer(at({ viewIdx: 4 }), { type: 'timeline', nowIdx: 11 })
    expect(s.nowIdx).toBe(11)
    expect(shownIndex(s)).toBe(4)
  })

  it('play from live starts at the first tick and steps to live, then stops', () => {
    let s = viewReducer(at({ nowIdx: 2 }), { type: 'play' })
    expect(s.playing).toBe(true)
    expect(s.viewIdx).toBe(0)
    s = viewReducer(s, { type: 'step' })
    expect(s.viewIdx).toBe(1)
    s = viewReducer(s, { type: 'step' })
    expect(s.viewIdx).toBeNull()
    expect(s.playing).toBe(false)
  })

  it('play from a past tick carries on from there', () => {
    const s = viewReducer(at({ viewIdx: 6 }), { type: 'play' })
    expect(s.viewIdx).toBe(6)
  })

  it('scrubbing stops playback; back to live clears the past view', () => {
    let s = viewReducer(at({ viewIdx: 3, playing: true }), { type: 'scrub', idx: 5 })
    expect(s.playing).toBe(false)
    s = viewReducer(s, { type: 'live' })
    expect(s.viewIdx).toBeNull()
  })

  it('opens on the map (ADR 0007, Simon 30 Oct)', () => {
    expect(initialView.shape).toBe('map')
  })

  it('switches the shape and the rewind drawer', () => {
    let s = viewReducer(at(), { type: 'shape', shape: 'hex' })
    expect(s.shape).toBe('hex')
    s = viewReducer(s, { type: 'shape', shape: 'map' })
    expect(s.shape).toBe('map')
    s = viewReducer(s, { type: 'rewind' })
    expect(s.rewindOpen).toBe(true)
    s = viewReducer(s, { type: 'rewind' })
    expect(s.rewindOpen).toBe(false)
  })
})

describe('Back to now closes Rewind (FB-125)', () => {
  it('closes the drawer as well as returning to live', () => {
    let s = viewReducer(at(), { type: 'rewind', open: true })
    s = viewReducer(s, { type: 'scrub', idx: 1 })
    expect(s.viewIdx).toBe(1)
    expect(s.rewindOpen).toBe(true)
    s = viewReducer(s, { type: 'live' })
    expect(s.viewIdx).toBeNull()
    expect(s.rewindOpen).toBe(false)
  })
})

describe('shape in the URL (ADR 0018)', () => {
  it('reads ?shape=hex and falls back to the map for anything else', () => {
    expect(shapeFromSearch('?shape=hex')).toBe('hex')
    expect(shapeFromSearch('?cadence=600&shape=hex&motion=1')).toBe('hex')
    expect(shapeFromSearch('')).toBe('map')
    expect(shapeFromSearch('?shape=map')).toBe('map')
    expect(shapeFromSearch('?shape=treemap')).toBe('map')
  })

  it('writes hex as a param and removes it for the map, keeping other params', () => {
    expect(withShape('', 'hex')).toBe('?shape=hex')
    expect(withShape('?motion=1&theme=civic', 'hex')).toBe('?motion=1&theme=civic&shape=hex')
    expect(withShape('?motion=1&shape=hex', 'map')).toBe('?motion=1')
    expect(withShape('?shape=hex', 'map')).toBe('')
    expect(withShape('?shape=hex&motion=1', 'hex')).toBe('?shape=hex&motion=1')
  })
})

describe('colour in the URL (ADR 0018)', () => {
  it('reads ?colour= and falls back to Leader for anything else', () => {
    expect(colourFromSearch('?colour=trust')).toBe('trust')
    expect(withColour('?shape=hex', 'trust')).toBe('?shape=hex&colour=trust')
    // Counted is an Explore lens now: an old link is not a colour, it opens the lens (below).
    expect(colourFromSearch('?colour=counted')).toBe('leader')
    // How sure was folded into Leader (VE-127): its old link opens Leader.
    expect(colourFromSearch('?shape=hex&colour=certainty')).toBe('leader')
    expect(colourFromSearch('')).toBe('leader')
    expect(colourFromSearch('?colour=leader')).toBe('leader')
    expect(colourFromSearch('?colour=booths')).toBe('leader')
    // Gains (VE-156)
    expect(colourFromSearch('?colour=gains')).toBe('gains')
    expect(withColour('?shape=hex', 'gains')).toBe('?shape=hex&colour=gains')
    expect(colourFromSearch('?colour=lvc')).toBe('lvc')
    expect(withColour('?shape=hex', 'lvc')).toBe('?shape=hex&colour=lvc')
  })
  it('writes it back, dropping the param for Leader and keeping every other param', () => {
    expect(withColour('', 'trust')).toBe('?colour=trust')
    expect(withColour('?shape=hex&motion=1', 'trust')).toBe('?shape=hex&motion=1&colour=trust')
    expect(withColour('?colour=trust&shape=hex', 'leader')).toBe('?shape=hex')
    expect(withColour('?colour=trust', 'leader')).toBe('')
  })
  it('switches colour in the reducer and defaults to Leader', () => {
    expect(initialView.colour).toBe('leader')
    expect(viewReducer(at(), { type: 'colour', colour: 'trust' }).colour).toBe('trust')
  })
})

describe('explore lens in the URL (VE-82)', () => {
  it('reads the lens and mode, defaulting the mode to map', () => {
    expect(exploreFromSearch('?explore=arrows&mode=hex')).toEqual({ lens: 'arrows', mode: 'hex' })
    expect(exploreFromSearch('?explore=arrows')).toEqual({ lens: 'arrows', mode: 'map' })
    expect(exploreFromSearch('?explore=arrows&mode=nonsense')).toEqual({ lens: 'arrows', mode: 'map' })
  })
  it('reads the One Nation modes (VE-101) and writes them back', () => {
    expect(exploreFromSearch('?explore=one-nation&mode=share')).toEqual({ lens: 'one-nation', mode: 'share' })
    expect(exploreFromSearch('?explore=one-nation&mode=like')).toEqual({ lens: 'one-nation', mode: 'like' })
    // VE-212: the retired Seats-like-this link opens the merged places-like-yours lens, keeping its other params.
    expect(exploreFromSearch('?explore=like')).toEqual({ lens: 'similar', mode: 'map' })
    expect(exploreFromSearch('?explore=like&mode=hex&seat=5')).toEqual({ lens: 'similar', mode: 'hex' })
    expect(withExplore('', { lens: 'one-nation', mode: 'like' })).toBe('?explore=one-nation&mode=like')
  })
  it('opens the Counted lens for an old ?colour=counted link, unless a lens is named (VE-104)', () => {
    expect(exploreFromSearch('?colour=counted')).toEqual({ lens: 'counted', mode: 'map' })
    expect(exploreFromSearch('?colour=counted&shape=hex&mode=hex')).toEqual({ lens: 'counted', mode: 'hex' })
    expect(exploreFromSearch('?colour=counted&explore=arrows')).toEqual({ lens: 'arrows', mode: 'map' })
    expect(exploreFromSearch('?colour=trust')).toBeNull()
  })
  it('is closed with no lens param', () => {
    expect(exploreFromSearch('')).toBeNull()
    expect(exploreFromSearch('?mode=hex')).toBeNull()
  })
  it('writes the lens and mode, keeping every other param, and removes both when closed', () => {
    expect(withExplore('?theme=civic', { lens: 'arrows', mode: 'strip' })).toBe('?theme=civic&explore=arrows&mode=strip')
    expect(withExplore('?shape=hex&explore=arrows&mode=hex', null)).toBe('?shape=hex')
    expect(withExplore('', { lens: 'arrows', mode: 'map' })).toBe('?explore=arrows')
  })
})

describe('polling places in the state and the URL (VE-77c)', () => {
  it('is off by default and the reducer turns it on and off', () => {
    expect(initialView.places).toBe(false)
    let s = viewReducer(at(), { type: 'places', on: true })
    expect(s.places).toBe(true)
    s = viewReducer(s, { type: 'places', on: false })
    expect(s.places).toBe(false)
  })

  it('leaves the colour as it was, so coming back from the dots restores Leader or Swing', () => {
    const s = viewReducer(at({ colour: 'trust' }), { type: 'places', on: true })
    expect(s.colour).toBe('trust')
  })

  it('reads ?places=1 and ignores anything else', () => {
    expect(placesFromSearch('?places=1')).toBe(true)
    expect(placesFromSearch('?places=0')).toBe(false)
    expect(placesFromSearch('')).toBe(false)
  })

  it('is never on with the Hex, which the dots do not offer', () => {
    expect(placesFromSearch('?places=1&shape=hex')).toBe(false)
  })

  it('writes ?places=1 and keeps every other param, with nothing at rest', () => {
    expect(withPlaces('?cadence=600', true)).toBe('?cadence=600&places=1')
    expect(withPlaces('?cadence=600&places=1', false)).toBe('?cadence=600')
    expect(withPlaces('', false)).toBe('')
  })
})

// VE-140 (b): `?explore=arrows` at 7 pm opened an empty lens: the link bypassed the "enough data" gate and ignored the
// lens's own default shape (arrows opens on Hex from the sheet, but a link read as Map).
describe('resolveExploreLink (VE-140)', () => {
  const ok = { known: true, ready: true, loaded: true, defaultMode: 'hex' as const }
  it('waits while the results have not loaded, so a link is not judged on an empty app', () => {
    expect(resolveExploreLink({ lens: 'arrows', mode: 'map' }, false, { ...ok, loaded: false, ready: false })).toBe('wait')
  })
  it('opens a ready lens on its own default shape when the link names none', () => {
    expect(resolveExploreLink({ lens: 'arrows', mode: 'map' }, false, ok)).toEqual({ lens: 'arrows', mode: 'hex' })
  })
  it('keeps a shape the link names', () => {
    expect(resolveExploreLink({ lens: 'arrows', mode: 'map' }, true, ok)).toEqual({ lens: 'arrows', mode: 'map' })
  })
  it('falls back to the main view, quietly, when the lens is not ready or does not exist', () => {
    expect(resolveExploreLink({ lens: 'arrows', mode: 'map' }, false, { ...ok, ready: false })).toBeNull()
    expect(resolveExploreLink({ lens: 'nope', mode: 'map' }, false, { ...ok, known: false })).toBeNull()
  })
  it('has nothing to do without a link', () => {
    expect(resolveExploreLink(null, false, ok)).toBeNull()
  })
})

describe('exploreModeGiven (VE-140)', () => {
  it('is true only for a valid ?mode=', () => {
    expect(exploreModeGiven('?explore=arrows&mode=hex')).toBe(true)
    expect(exploreModeGiven('?explore=arrows')).toBe(false)
    expect(exploreModeGiven('?explore=arrows&mode=nonsense')).toBe(false)
  })
})

describe('the polling place panel in the state and the URL (VE-208)', () => {
  it('starts with no place picked', () => {
    expect(initialView.booth).toBeNull()
  })

  it('picking a place picks its seat too, and picking the same place again does not close it', () => {
    let s = viewReducer(at(), { type: 'pickBooth', id: 17297, seat: 15970 })
    expect(s).toMatchObject({ booth: 17297, selected: 15970 })
    s = viewReducer(s, { type: 'pickBooth', id: 17297, seat: 15970 })
    expect(s).toMatchObject({ booth: 17297, selected: 15970 })
  })

  it('"See the seat" drops the place and keeps the seat; picking or clearing a seat drops the place', () => {
    const open = viewReducer(at(), { type: 'pickBooth', id: 1, seat: 5 })
    expect(viewReducer(open, { type: 'booth', id: null })).toMatchObject({ booth: null, selected: 5 })
    expect(viewReducer(open, { type: 'select', id: 6 })).toMatchObject({ booth: null, selected: 6 })
    expect(viewReducer(open, { type: 'select', id: null })).toMatchObject({ booth: null, selected: null })
  })

  it('closes with Polling places', () => {
    const open = viewReducer(at({ places: true }), { type: 'pickBooth', id: 1, seat: 5 })
    expect(viewReducer(open, { type: 'places', on: false }).booth).toBeNull()
  })

  it('reads ?booth= as a number and ignores anything else', () => {
    expect(boothFromSearch('?booth=17297')).toBe(17297)
    expect(boothFromSearch('?places=1&booth=-2')).toBe(-2)
    expect(boothFromSearch('?booth=abc')).toBeNull()
    expect(boothFromSearch('?booth=')).toBeNull()
    expect(boothFromSearch('?booth=1.5')).toBeNull()
    expect(boothFromSearch('')).toBeNull()
  })

  it('a booth link opens Polling places by itself, but never on Hex', () => {
    expect(placesFromSearch('?booth=17297')).toBe(true)
    expect(placesFromSearch('?booth=17297&shape=hex')).toBe(false)
  })

  it('writes the place and keeps every other param', () => {
    expect(withBooth('?places=1&explore=arrows', 17297)).toBe('?places=1&explore=arrows&booth=17297')
    expect(withBooth('?places=1&booth=5', null)).toBe('?places=1')
    expect(withBooth('', null)).toBe('')
  })
})
