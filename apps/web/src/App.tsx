import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import type { CandidateAttributes, PartyBucket } from '@vic26/schema'
import type { Position } from './data/types'
import { DistrictPanelHost } from './components/DistrictPanel'
import { ExploreLayer } from './components/explore/ExploreLayer'
import { captionCounts, classifySeat } from './derive/arrows'
import { LENSES, lensStartMode } from './components/explore/lenses'
import { lensReady } from './components/explore/ready'
import { HexInset } from './components/inset/HexInset'
import { MapInfo } from './components/info/StageInfo'
import { VIC_OUTLINE_PATH, VIC_OUTLINE_VIEWBOX } from './components/map/vicOutline'
import { readMinimised, writeMinimised } from './components/inset/pref'
import { FxAnnouncer, FxProvider, useUpdateEffects } from './components/Effects'
import { MapPane, type MapApi } from './components/MapPane'
import { PickChip } from './components/PickChip'
import { pickEdge } from './derive/pickChip'
import { Rewind } from './components/Rewind'
import { ClosestSeats } from './components/ClosestSeats'
import { SeatsPane } from './components/SeatsPane'
import { SeatsRail } from './components/SeatsRail'
import { SwingPanel } from './components/lenspanel/SwingPanel'
import { swingRows, swingSummary } from './components/lenspanel/swing'
import { CountedPanel } from './components/lenspanel/CountedPanel'
import { countedRows, countedSummary } from './components/lenspanel/counted'
import { PrefsPanel } from './components/lenspanel/PrefsPanel'
import { PartyPanel } from './components/lenspanel/PartyPanel'
import { LikePanel } from './components/lenspanel/LikePanel'
import { MultiPanel } from './components/lenspanel/MultiPanel'
import { multiRows, multiSummary } from './components/lenspanel/multi'
import { getNight, setNight } from './components/explore/multiples/nightStore'
import { useLikeSummary } from './components/explore/like/likeStore'
import { usePartySummary } from './components/lenspanel/party'
import { prefsRows, prefsSummary } from './components/lenspanel/prefs'
import { GainsPanel } from './components/lenspanel/GainsPanel'
import { ColourChips, ColourInfo, StageControls, ViewSheet } from './components/StageControls'
import { BoothSourceContext, useBoothData, useBoothsAvailable } from './components/booths/data'
import { CandidatesContext } from './components/explore/one-nation/vs'
import { buildDots, type BoothDot } from './components/booths/dots'
import { BoothPanelHost, type BoothPanelData } from './components/booths/BoothPanel'
import { findPlace, outsideOf, placeInput, placesInSeat } from './components/booths/panelInput'
import { CountNotes, ReadingKey, TopBand } from './components/TopBand'
import { createSource } from './data'
import { autoStartTour } from './tour'
import { countedScale, seatPaint, swingShown, trustReady, type SeatPaint } from './derive/colour'
import { isFinal } from './derive/turnout'
import { replayNote, swingLine } from './derive/panel'
import { swingGapLine } from './derive/swingNote'
import { flippedIds } from './derive/flips'
import { GAINS_FROM_COUNTED_PCT, gainsAvailable, netChange, shownGains } from './derive/gains'
import { PARTY_NAMES } from './parties'
import { gainShown, type RailFilter } from './derive/list'
import { aboutVotes, stillToCountTotal, SEATS, blankSeat, headlineOf, seatsFromRows, statsOf, tallyOf, type Seat } from './derive/seats'
import { notLiveMarker, staleLine, statusView } from './derive/status'
import { nightWords } from './derive/nightWords'
import { HEADLINE_MIN_PCT } from './derive/headline'
import { DOUBT, inFocus, withFocus, withStatus, type Focus, type Picks } from './derive/focus'
import { pulseSeries } from './derive/pulse'
import { useBoothFlash } from './components/booths/flash'
import { clockLabel } from './format'
import { getMotion, useMotion } from './state/motion'
import { useResults } from './state/useResults'
import { createStageStore } from './state/stage'
import { clockFor, timeState } from './state/timeState'
import { useNow } from './state/useNow'
import { isPublicBuild } from './data/productionView'
import { boothFromSearch, colourFromSearch, exploreFromSearch, exploreModeGiven, initialView, placesFromSearch, resolveExploreLink, shapeFromSearch, shownIndex, viewReducer, withBooth, withColour, withExplore, withPlaces, withShape, type ExploreState, type Shape } from './state/view'
import {
  buildMorphShapes,
  type Halo,
  TransitionOverlay,
  type Mode,
  type ScreenFn,
  type StageEvent,
  type TransitionRunner,
  type TransitionScene,
} from './transitions'
import { mapScreen, seatsScreen, type MapCamera, type Origin, type Rect, type ViewBox } from './views/projection'
import { css, documentPalette, PaletteContext, useTheme } from './theme/theme'
import { leadStep } from './views/encoding'

// The public build shows live data only (VE-188); the dev server and the loopback rehearsal rig are unchanged.
const PUBLIC_BUILD = isPublicBuild(import.meta.env.DEV, import.meta.env.VITE_AGOL_VIEW_URL)

/** The transition engine calls the Hex shape 'seats'. */
const modeOf = (shape: Shape): Mode => (shape === 'hex' ? 'seats' : 'map')
/** One playback step (one tick) at 1x. */
const PLAY_STEP_MS = 1200
/** No enrolment known yet: the Counted summary falls back to a plain mean (VE-247). */
const NO_ENROLMENT: ReadonlyMap<number, number> = new Map()
// The hand-over where no flight runs: the new shape fades in over the old one (keep in step with .panes--fade-* in app.css).
const CROSSFADE_MS = 150
/** Where each real view is on screen, read from the DOM (and the map camera) at one moment. */
interface Measure {
  origin: Origin
  size: { w: number; h: number }
  /** The stage: the one rect both shapes fill. */
  fallback: Rect
  mapRect: Rect | null
  camera: MapCamera | null
  seats: { rect: Rect; vb: ViewBox } | null
}

/** A rect only if the element is laid out (a hidden mobile pane has no size). */
const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
}

function measure(panes: HTMLElement, api: MapApi | null): Measure {
  const pr = panes.getBoundingClientRect()
  const fallback: Rect = { left: pr.left, top: pr.top, width: pr.width, height: pr.height }
  const svg = panes.querySelector<SVGSVGElement>('[data-testid="seat-hexes"]')
  let seats: Measure['seats'] = null
  // The shape not showing is laid out at full size but hidden, so its rect is the stage's either way.
  const sr = rectOf(svg) ?? fallback
  if (svg) {
    // The SVG's viewport is its content box, inside the CSS padding.
    const cs = getComputedStyle(svg)
    const pl = Number.parseFloat(cs.paddingLeft) || 0
    const pt = Number.parseFloat(cs.paddingTop) || 0
    const pr2 = Number.parseFloat(cs.paddingRight) || 0
    const pb = Number.parseFloat(cs.paddingBottom) || 0
    const vb = svg.viewBox.baseVal
    seats = {
      rect: { left: sr.left + pl, top: sr.top + pt, width: sr.width - pl - pr2, height: sr.height - pt - pb },
      vb: { x: vb.x, y: vb.y, w: vb.width, h: vb.height },
    }
  }
  return {
    origin: { left: pr.left, top: pr.top },
    size: { w: pr.width, h: pr.height },
    fallback,
    mapRect: rectOf(panes.querySelector('.map-container')),
    camera: api?.camera() ?? null,
    seats,
  }
}

/** A change of view waiting for its layout to commit before the transition can read where things ended up. */
interface PendingChange {
  from: Mode
  to: Mode
  toShape: Shape
  before: Measure
}

/** Candidate lists kept (one per snapshot and district viewed). */
const CAND_CACHE = 12

export function App() {
  const [source] = useState(createSource)
  const theme = useTheme()
  // Re-read when the theme changes: setTheme has already applied the tokens by the time it notifies.
  // `theme` is the trigger, not an input: the palette is read from the document's CSS tokens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = useMemo(() => documentPalette(), [theme])
  const { statics, status, timeline, error, pollNote } = useResults(source, { publicBuild: PUBLIC_BUILD })
  // The shape comes from ?shape= (Map is the default and has no param), so a view can be shared.
  const [view, dispatch] = useReducer(viewReducer, initialView, (v) => ({ ...v, shape: shapeFromSearch(location.search), colour: colourFromSearch(location.search), places: placesFromSearch(location.search), booth: boothFromSearch(location.search) }))
  // Candidate lists by snapshotId:districtId, a few entries (see CAND_CACHE).
  const panesRef = useRef<HTMLElement>(null)
  const runnerRef = useRef<TransitionRunner | null>(null)
  const mapApi = useRef<MapApi | null>(null)
  const [stage] = useState(createStageStore)
  // The runner starts on whichever shape the URL asked for; the shell calls run() for every later change.
  const [startMode] = useState<Mode>(() => modeOf(shapeFromSearch(location.search)))
  // The party chosen in the top tally: dims every other seat in Map and Seats (FB-33).
  const [focus, setFocus] = useState<Focus | null>(null)
  // The rail's status chip, held here because the band's in-doubt button sets it too (VE-92). In doubt is one pick with
  // the focus above (VE-105): the two move together through withFocus and withStatus.
  const [railStatus, setRailStatus] = useState<RailFilter | null>(null)
  // Bumps each time the in-doubt pick starts, so the seats pop once on a fresh pick and not on every redraw.
  const [popSeq, setPopSeq] = useState(0)
  const setPicks = useCallback(
    (p: Picks) => {
      if (p.focus === DOUBT && focus !== DOUBT) setPopSeq((n) => n + 1)
      setFocus(p.focus)
      setRailStatus(p.status)
    },
    [focus],
  )
  const pickFocus = useCallback((f: Focus | null) => setPicks(withFocus({ focus, status: railStatus }, f)), [setPicks, focus, railStatus])
  const pickStatus = useCallback((s: RailFilter | null) => setPicks(withStatus({ focus, status: railStatus }, s)), [setPicks, focus, railStatus])
  // Hover previews a pick without committing it; a tap sets focus. The stage shows whichever is live.
  const [preview, setPreview] = useState<Focus | null>(null)
  const lit = preview ?? focus
  // The pop key: 0 when the in-doubt pick is not on show, else the pick's number (a new pick is a new key).
  const pop = lit === DOUBT ? popSeq : 0
  const [morphing, setMorphing] = useState(false)
  // The Explore lens open on the stage (?explore=), null for the map. The app's own view state is untouched, so Back to the map restores it as it was.
  // A ?explore= link is held as pending until the results (and the night) have loaded, then resolved once (VE-140):
  // a ready lens opens on its default shape; a lens without enough data leaves the main view showing, with no error.
  const [pendingLink, setPendingLink] = useState<{ link: ExploreState; modeGiven: boolean } | null>(() => {
    const link = exploreFromSearch(location.search)
    return link ? { link, modeGiven: exploreModeGiven(location.search) } : null
  })
  const [explore, setExplore] = useState<ExploreState | null>(null)
  // Gains (VE-156): the party tapped in its key (only its gains show), and the seat a card is lit for (the stage rings it).
  const [gainsParty, setGainsParty] = useState<PartyBucket | null>(null)
  const [ringId, setRingId] = useState<number | null>(null)
  // VE-227: the phone's Seats list is open over the stage; the map refits above it.
  const [railOpen, setRailOpen] = useState(false)
  useEffect(() => {
    // While a link is pending its params stay in the address bar; they are cleared or confirmed once it resolves.
    if (pendingLink) return
    const next = withExplore(location.search, explore)
    if (next !== location.search) history.replaceState(null, '', `${location.pathname}${next}${location.hash}`)
  }, [explore, pendingLink])
  // Rewind is not offered while a lens is open (FB-131): an open panel closes, and returning to the map does not reopen it.
  const lensOpen = explore !== null
  useEffect(() => {
    if (lensOpen) dispatch({ type: 'rewind', open: false })
  }, [lensOpen])
  // The hex inset's minimised choice, remembered across visits (ADR 0023).
  const [insetMin, setInsetMin] = useState(readMinimised)
  const setInset = useCallback((min: boolean) => {
    setInsetMin(min)
    writeMinimised(min)
  }, [])
  // Where the flight cannot run (reduced motion, geometry or the map not ready), the new shape fades in over the old one
  // (VE-103): `fade` restarts the animation, `leaving` keeps the outgoing pane on show until the fade ends.
  const [fade, setFade] = useState<'a' | 'b' | null>(null)
  const [leaving, setLeaving] = useState<Shape | null>(null)
  const leaveTimer = useRef(0)
  const crossfade = useCallback((from: Shape) => {
    setFade((f) => (f === 'a' ? 'b' : 'a'))
    setLeaving(from)
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => setLeaving(null), CROSSFADE_MS + 40)
  }, [])
  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])
  const [cands, setCands] = useState<ReadonlyMap<string, CandidateAttributes[] | null>>(new Map())

  useEffect(() => {
    if (timeline) dispatch({ type: 'timeline', nowIdx: timeline.ticks.length - 1 })
  }, [timeline])

  // Every tick's seats derived once per timeline (88 x about 100), so scrubbing is instant.
  const seatsAt = useMemo(
    () => (timeline && statics ? timeline.rows.map((rows) => seatsFromRows(rows, statics.districtById.values(), timeline.enrolment)) : []),
    [timeline, statics],
  )
  const blank = useMemo(
    () => new Map<number, Seat>(statics ? [...statics.districtById.values()].map((st) => [st.district_id, blankSeat(st)]) : []),
    [statics],
  )
  const idx = shownIndex(view)
  const seats = seatsAt[idx] ?? blank
  // VE-142: at Final (every leading seat declared) the Leader steps drop; Rewind earlier brings them back, since this follows the seats shown.
  const allWon = useMemo(() => isFinal(seats.values()), [seats])
  const tick = timeline?.ticks[idx] ?? null
  const ticks = useMemo(() => timeline?.ticks ?? [], [timeline])
  const nightStart = ticks[0]?.snapshotAt ?? 0
  const label = useCallback((ms: number) => clockLabel(ms, nightStart), [nightStart])


  const geometry = useMemo(() => (statics ? buildMorphShapes(statics.districts, statics.seatHexes) : null), [statics])
  // VE-221 (B18): the rail's Changing hands chip lights those seats on the stage the way Close seats does; a party pick takes over.
  const changingLit = railStatus === 'changing' && lit === null
  // How each seat is filled under the active colour (and the party focus), shared by Map, Hex and the morph so all agree.
  const paints = useMemo(
    () => new Map([...seats.values()].map((s) => [s.id, seatPaint(s, statics?.districtById.get(s.id), view.colour, palette, changingLit ? gainShown(s) : inFocus(lit, s), lit !== null || changingLit, gainsParty)])),
    [seats, statics, view.colour, palette, lit, gainsParty, changingLit],
  )
  // VE-286: the picked seats wear the picked party's dark shade; the stage carries it so Map, Hex and inset share it. The chip clears the pick the way the tally's Clear does.
  const pickEdgeStyle = useMemo(() => (lit ? ({ '--pick-edge': pickEdge(lit, seats) } as CSSProperties) : undefined), [lit, seats])
  const clearPick = useCallback(() => {
    setPreview(null)
    pickFocus(null)
  }, [pickFocus])
  // Polling places (VE-77c) are offered wherever the source has booths (VE-136): the replay always, the live layer once it has rows. A source with none leaves the chip out without an error.
  const boothSource = source.booths ?? null
  // VE-320: the Strongest lens reads every candidate at the tick on show for Victorian Socialists (inside Others in our buckets).
  const tickSnapshot = tick?.snapshotId ?? null
  const candidatesFeed = useMemo(() => ({ snapshotId: tickSnapshot, all: source.allCandidates ? (id: string) => source.allCandidates!(id) : null }), [tickSnapshot, source])
  const placesOffered = useBoothsAvailable(boothSource)
  const placesOn = view.places && placesOffered
  // Booth results are fetched the first time the chip is picked and not before (ADR 0020).
  const boothLoad = useBoothData(placesOn, boothSource, tick?.snapshotAt ?? 0)
  // Under Polling places the seats are quiet ground, so the dots carry the colour: a step between the paper and the no-result grey.
  const quietPaints = useMemo(() => {
    const rgb = palette.paper.map((v, i) => Math.round((v + palette.noResult[i]!) / 2)) as SeatPaint['rgb']
    return new Map([...seats.keys()].map((id) => [id, { rgb, band: 2, lit: false, hatch: false } as SeatPaint]))
  }, [seats, palette])
  const dots = useMemo(
    () =>
      placesOn && boothLoad.status === 'ready'
        ? buildDots({ booths: boothLoad.data.booths, byBooth: boothLoad.data.byBooth, maxFormal: boothLoad.data.maxFormal, at: tick?.snapshotAt ?? 0, focus: lit, seats, selected: view.selected, evc: boothLoad.data.evcGroups, reportedOnly: view.viewIdx !== null, outside: statics ? outsideOf(boothLoad.data, statics.districts) : undefined })
        : null,
    [placesOn, boothLoad, tick, lit, seats, view.selected, view.viewIdx],
  )
  const placeParties = useMemo(() => [...new Set((dots ?? []).flatMap((d) => (d.leader ? [d.leader] : [])))], [dots])
  const sceneSeats = useMemo(
    () => [...seats.values()].map((s) => ({ id: s.id, party: s.leader, fill: css(paints.get(s.id)!.rgb), firm: s.state === 'firm' || s.state === 'won' })),
    [seats, paints],
  )
  // What changed since the previous tick, as cues for Hex, Map, the rail and the band (VE-60). Cues wait for a morph to land.
  useMotion() // re-render when the Animations switch changes, so every getMotion() read below is fresh
  const fx = useUpdateEffects({ idx, seats, paints, seatsAt, ticks, morphing, live: view.viewIdx === null, playing: view.playing, speed: view.speed })
  // VE-288: a soft ring at each booth whose figures changed on the tick that just landed (the seat flash is off here).
  const boothFlash = useBoothFlash({ idx, at: tick?.snapshotAt ?? 0, data: placesOn && boothLoad.status === 'ready' ? boothLoad.data : null, reduced: fx.reduced })
  // Each seat's margin at every tick of the night, for the rail's count-pulse lines.
  const pulse = useMemo(() => pulseSeries(seatsAt), [seatsAt])
  // VE-276: tick times give the multiples seat trend its hour marks; memoised so the store's identity check holds.
  const tickTimes = useMemo(() => ticks.map((t) => t.snapshotAt), [ticks])
  useEffect(() => setNight({ series: pulse, shownIdx: idx, total: ticks.length, times: tickTimes }), [pulse, idx, ticks.length, tickTimes])
  // Resolve a pending ?explore= link. Declared after setNight, so a lens that reads the night sees it in the same commit.
  useEffect(() => {
    if (!pendingLink) return
    const def = LENSES.find((l) => l.id === pendingLink.link.lens)
    const loaded = !!timeline && !!statics && idx >= 0 && getNight().total === ticks.length
    const out = resolveExploreLink(pendingLink.link, pendingLink.modeGiven, {
      known: !!def,
      // A link needs only something to show (one arrow or level bar); the Trust chip's ten-seat bar is for offering the lens (FB-148).
      ready: pendingLink.link.lens === 'arrows' ? captionCounts([...seats.values()].map((x) => classifySeat(x, statics?.districtById.get(x.id)))).ready > 0 : lensReady(pendingLink.link.lens, seats),
      loaded,
      defaultMode: lensStartMode(def),
    })
    if (out === 'wait') return
    // A one-off hand-over once outside data (results, night) has arrived, so it has to be an effect.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPendingLink(null)
    setExplore(out)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pendingLink, timeline, statics, ticks, seats, idx])
  // Latest values for callbacks the transition layer holds on to.
  const latest = useRef({ sceneSeats, selected: view.selected, palette, focus, shape: view.shape })
  useEffect(() => {
    latest.current = { sceneSeats, selected: view.selected, palette, focus, shape: view.shape }
  })

  // A change of view: note where everything is now, let the layout commit, then fly from there to where it ends up.
  const pending = useRef<PendingChange | null>(null)
  const flight = useRef<{ from: Mode; before: Measure; after: Measure } | null>(null)
  const inLayout = useRef(false)
  const changeShape = useCallback(
    (to: Shape) => {
      if (to === view.shape) return
      const panes = panesRef.current
      pending.current = panes && runnerRef.current ? { from: modeOf(view.shape), to: modeOf(to), toShape: to, before: measure(panes, mapApi.current) } : null
      // No overlay yet (geometry still loading): fade rather than cut, and the outgoing shape stays up meanwhile.
      if (!pending.current) crossfade(view.shape)
      dispatch({ type: 'shape', shape: to })
    },
    [view.shape, crossfade],
  )
  // Keep ?shape= in step with the stage (replace, not push: a shape is a view of the page, not a place to go back to).
  useEffect(() => {
    // The picked polling place (VE-208) is part of the link only while Polling places is on, so it can be shared.
    const next = withBooth(withPlaces(withColour(withShape(location.search, view.shape), view.colour), placesOn), placesOn ? view.booth : null)
    if (next !== location.search) history.replaceState(null, '', `${location.pathname}${next}${location.hash}`)
  }, [view.shape, view.colour, placesOn, view.booth])
  const pickDot = useCallback((dot: BoothDot) => dispatch({ type: 'pickBooth', id: dot.pick, seat: dot.districtId }), [])
  // A ?booth= link names a place; once the booth data is in, its seat is picked with it, and an id the source does not have is dropped (the seat view shows, no error).
  const linkedBooth = boothLoad.status === 'ready' ? boothLoad.data : null
  useEffect(() => {
    if (!linkedBooth || view.booth === null) return
    const found = findPlace(linkedBooth, view.booth)
    if (!found) dispatch({ type: 'booth', id: null })
    else if (view.selected !== found.place.districtId) dispatch({ type: 'pickBooth', id: view.booth, seat: found.place.districtId })
  }, [linkedBooth, view.booth, view.selected])
  const pickPlaces = useCallback(() => {
    // The dots are Map only: leave Hex through the usual flight, then switch.
    // A second pick turns it off again, back to the colour that was on before (Leader by default).
    if (placesOn) return dispatch({ type: 'places', on: false })
    if (view.shape !== 'map') changeShape('map')
    dispatch({ type: 'places', on: true })
  }, [view.shape, changeShape, placesOn])
  useLayoutEffect(() => {
    const p = pending.current
    const runner = runnerRef.current
    const panes = panesRef.current
    if (!p) return
    // One fade per switch: changeShape fades only when it left no pending change, and this effect fades only for a
    // pending one. A pending change that no longer matches the stage (or cannot run) is dropped, never left to fire on a later switch.
    pending.current = null
    if (!runner || !panes || p.toShape !== view.shape) return
    const after = measure(panes, mapApi.current)
    const reduced = getMotion() === 'reduced'
    const canFly = !reduced && (p.before.camera ?? after.camera) !== null && (p.before.seats ?? after.seats) !== null
    inLayout.current = true
    try {
      if (canFly) {
        flight.current = { from: p.from, before: p.before, after }
        void runner.run(p.to)
      } else {
        // Reduced motion (or no camera yet): no flight, the new shape fades in over the old one.
        runner.set(p.to)
        crossfade(p.toShape === 'map' ? 'hex' : 'map')
      }
    } finally {
      inLayout.current = false
    }
  }, [view.shape, crossfade])

  const getScene = useCallback((): TransitionScene => {
    const f = flight.current!
    const { before, after } = f
    // Each view is read where the flight touches it: where it is now if we leave from it, where it will be if we arrive.
    const mapAt = f.from === 'map' ? before : after
    const seatsAt = f.from === 'seats' ? before : after
    const camera = before.camera ?? after.camera!
    const sp = seatsAt.seats ?? before.seats ?? after.seats!
    const origin = after.origin
    const { sceneSeats: ss, selected, palette: pal } = latest.current
    const project: { map: ScreenFn; seats: ScreenFn } = {
      map: mapScreen(camera, mapAt.mapRect ?? mapAt.seats?.rect ?? mapAt.fallback, origin),
      seats: seatsScreen(sp.vb, sp.rect, origin),
    }
    return {
      width: after.size.w,
      height: after.size.h,
      project,
      seats: ss,
      tally: 'bar',
      stroke: css(pal.edge),
      track: css(pal.noResult),
      marker: getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || css(pal.selected),
      selected: selected === null ? null : { id: selected, stroke: css(pal.selected) },
    }
  }, [])

  const onStage = useCallback(
    (e: StageEvent) => {
      const next = { active: e.active, counts: e.frame?.counts ?? null }
      if (e.active || inLayout.current) {
        setMorphing(e.active)
        stage.set(next)
      } else {
        // Arrival: reveal the real views in the same paint as the canvas clears (the runner clears right after).
        flushSync(() => {
          setMorphing(false)
          stage.set(next)
        })
      }
    },
    [stage],
  )

  // The seat-flip halo on the Map: a one-shot ring on a seat whose leader changed on a single tick step, never
  // mid-transition. The Hex draws its own (a wipe, then one thin halo, in SeatsPane) so the two never double up, and
  // reduced motion has no ring (the colour change alone carries it, VE-93).
  const prevShown = useRef<{ idx: number; seats: Map<number, Seat> } | null>(null)
  useEffect(() => {
    const prev = prevShown.current
    prevShown.current = { idx, seats }
    const runner = runnerRef.current
    const panes = panesRef.current
    if (!prev || !runner || !panes || !geometry || Math.abs(idx - prev.idx) !== 1 || runner.running) return
    // VE-288: none on Polling places, where the dots carry the view and a seat ring would read as a booth.
    if (latest.current.shape !== 'map' || fx.reduced || placesOn) return
    const ids = flippedIds(prev.seats, seats)
    if (ids.length === 0) return
    const m = measure(panes, mapApi.current)
    const byId = new Map(geometry.map((g) => [g.id, g]))
    const halos: Halo[] = []
    for (const id of ids) {
      const g = byId.get(id)
      const party = seats.get(id)?.leader
      if (!g || !party) continue
      const colour = css(palette.party[party])
      if (m.mapRect && m.camera) {
        const to = mapScreen(m.camera, m.mapRect, m.origin)
        const n = g.geo.length
        const c: Position = [g.geo.reduce((a, p) => a + p[0], 0) / n, g.geo.reduce((a, p) => a + p[1], 0) / n]
        const [x, y] = to(c)
        const r = m.mapRect
        const px = x + m.origin.left - r.left
        const py = y + m.origin.top - r.top
        if (px >= 0 && py >= 0 && px <= r.width && py <= r.height) halos.push({ x, y, r: 9, colour })
      }
    }
    if (halos.length) runner.pulse({ width: m.size.w, height: m.size.h, halos })
  }, [idx, seats, geometry, palette, fx.reduced, placesOn])

  useEffect(() => {
    if (!view.playing) return
    const t = window.setInterval(() => dispatch({ type: 'step' }), PLAY_STEP_MS / view.speed)
    return () => window.clearInterval(t)
  }, [view.playing, view.speed])

  // Candidate detail needs a full snapshot (about 1 to 2 MB on the replay), so it is fetched only for the
  // selected district and never while playing, when the tick changes faster than the file arrives. Results are
  // cached by snapshot and district, so reselecting a seat or a tick that did not change costs nothing.
  const candKey = view.selected !== null && tick && !view.playing ? `${tick.snapshotId}:${view.selected}` : null
  const cached = candKey !== null && cands.has(candKey)
  useEffect(() => {
    if (!candKey || cached || !tick || view.selected === null) return
    let alive = true
    source.candidates(tick.snapshotId, view.selected).then(
      (list) => {
        if (!alive) return
        setCands((prev) => {
          const next = new Map(prev)
          next.delete(candKey)
          next.set(candKey, list)
          while (next.size > CAND_CACHE) next.delete(next.keys().next().value as string)
          return next
        })
      },
      () => undefined, // a failed fetch is not cached, so the next selection tries again
    )
    return () => {
      alive = false
    }
  }, [candKey, cached, tick, view.selected, source])

  const select = useCallback((id: number | null) => dispatch({ type: 'select', id }), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // An open "i" popover takes the first Escape (its own listener runs after this one, so it cannot set defaultPrevented in time):
      // one press closes one layer (VE-298).
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.info__pop')) dispatch({ type: 'select', id: null })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const sv = statusView(status, source.kind, { publicBuild: PUBLIC_BUILD })
  // VE-149 (hard rule 2): one "not live" signal for the band badge, the lenses and the polling places, from the source and the status row's data_mode.
  const notLive = sv.dataLabel !== null
  // The band's in-doubt button sets the seats rail's filter, so App holds that one piece of state (VE-92).
  const showDoubt = () => {
    dispatch({ type: 'colour', colour: 'leader' })
    pickStatus('doubt')
  }
  const stillToCome = stillToCountTotal(seats)
  // VE-226 (finding 12): the VEC can add votes to a declared seat, so the Final says what is true: every seat is declared.
  const stillLine = stillToCome === null ? undefined : stillToCome === 0 ? (allWon ? 'Every seat declared' : 'Nothing left to count') : `${aboutVotes(stillToCome).replace(/^a/, 'A')} votes to come`
  const tally = tallyOf(seats)
  const stats = statsOf(seats)
  // The swing lens's panel (VE-125): rows from the same seats and marks the lens draws. Other lenses keep the main list for now.
  // Counted and Preferences (VE-125b) use the same frame; One Nation is not built and keeps the main list.
  const panelLens = explore?.lens
  const partySummaryLine = usePartySummary(statics ?? null, panelLens === 'one-nation')
  const likeLine = useLikeSummary(seats)
  const swingPanel = useMemo(() => {
    if (!statics) return null
    if (panelLens === 'arrows') {
      const rows = swingRows(seats.values(), statics.districtById)
      const summary = swingSummary(rows, allWon)
      return { summary, panel: <SwingPanel rows={rows} summary={summary} /> }
    }
    if (panelLens === 'counted') {
      const scale = countedScale([...seats.values()].map((s) => s.pct), allWon)
      const rows = countedRows(seats.values(), scale)
      const summary = countedSummary(rows, timeline?.enrolment ?? NO_ENROLMENT, allWon)
      return { summary, panel: <CountedPanel rows={rows} summary={summary} final={allWon} scale={scale} /> }
    }
    if (panelLens === 'prefs') {
      const rows = prefsRows(seats.values())
      const summary = prefsSummary(rows, isFinal(seats.values()))
      return { summary, panel: <PrefsPanel rows={rows} summary={summary} /> }
    }
    if (panelLens === 'one-nation') return { summary: partySummaryLine, panel: <PartyPanel statics={statics} /> }
    if (panelLens === 'like') return { summary: likeLine, panel: <LikePanel seats={seats} /> }
    if (panelLens === 'multiples') {
      const rows = multiRows(seats, pulse, idx, allWon)
      const summary = multiSummary(rows, allWon)
      return { summary, panel: <MultiPanel rows={rows} summary={summary} total={ticks.length} /> }
    }
    return null
  }, [panelLens, seats, statics, partySummaryLine, likeLine, pulse, idx, ticks.length, allWon, timeline?.enrolment])
  // Gains (VE-156): the net change per party and the cards, from the one shown-gain predicate (derive/gains.ts), so the key, the stage and the cards agree.
  const nets = useMemo(() => netChange(seats.values()), [seats])
  const gainsPanel = useMemo(() => {
    if (view.colour !== 'gains' || placesOn || lensOpen) return null
    const n = shownGains(seats.values()).length
    const tappedNet = gainsParty === null ? null : nets.find((x) => x.party === gainsParty)
    const verb = allWon ? 'changed hands since 2022' : 'changing hands since 2022'
    const summary = gainsParty === null ? `${n} ${n === 1 ? 'seat' : 'seats'} ${verb}, closest first` : `${PARTY_NAMES[gainsParty]} gained ${tappedNet?.gains ?? 0}, lost ${tappedNet?.losses ?? 0}`
    return {
      summary,
      panel: <GainsPanel seats={seats} party={gainsParty} selected={view.selected} summary={summary} onPick={select} onRing={setRingId} />,
      picks: true,
    }
  }, [view.colour, placesOn, lensOpen, seats, nets, gainsParty, allWon, view.selected, select])
  const selectedSeat = view.selected === null ? null : seats.get(view.selected) ?? null
  // The polling place panel (VE-208): derived from the same tick as the stage (`tick`), so Rewind and a ?now= link move it with the map.
  const panelAt = tick?.snapshotAt ?? 0
  const boothPanel = useMemo<BoothPanelData | null>(() => {
    if (!placesOn || view.booth === null || boothLoad.status !== 'ready' || !tick) return null
    const made = placeInput(boothLoad.data, view.booth, { at: panelAt, seats, ticks: tickTimes.slice(0, idx + 1), sameElection: source.kind === 'replay', districts: statics?.districts })
    return made ? { ...made, maxFormal: boothLoad.data.maxFormal } : null
  }, [placesOn, view.booth, boothLoad, tick, panelAt, seats, tickTimes, idx, source.kind])
  const boothSeat = boothPanel ? seats.get(boothPanel.input.place.districtId) : undefined
  // VE-208b: one frame on the right. Moving between the seat panel and the polling place panel hands it over (the leaver goes
  // at once, the arrival does not slide) instead of one leaving beside the other arriving.
  const panelKind = boothPanel ? 'booth' : selectedSeat ? 'seat' : null
  const [panelKinds, setPanelKinds] = useState<{ now: typeof panelKind; handoff: boolean }>({ now: panelKind, handoff: false })
  if (panelKinds.now !== panelKind) setPanelKinds({ now: panelKind, handoff: panelKinds.now !== null && panelKind !== null })
  const panelHandoff = panelKinds.handoff
  // The seat panel under Polling places lists the seat's places, each opening its panel.
  const seatPlaces = useMemo(() => (placesOn && boothLoad.status === 'ready' && selectedSeat ? placesInSeat(boothLoad.data, selectedSeat.id) : null), [placesOn, boothLoad, selectedSeat])
  const openPlace = (id: number) => {
    const found = boothLoad.status === 'ready' ? findPlace(boothLoad.data, id) : null
    if (found) dispatch({ type: 'pickBooth', id, seat: found.place.districtId })
  }
  const live = view.viewIdx === null
  // VE-168 (finding 17): "Faint = none yet" is true only live with no seat picked. In Rewind no waiting dots exist, and with a seat picked the faint dots are the other seats'.
  const noFaint = allWon || view.rewindOpen || !live || view.selected !== null
  const showResults = sv.mode !== 'offline' && !sv.hideFigures
  // One derived time state (live, paused, final, rewinding) for the pill, Rewind and the chrome tint (ADR 0024).
  const wall = useNow()
  const latestAt = ticks[view.nowIdx]?.snapshotAt ?? null
  const latestSeats = seatsAt[view.nowIdx]
  const declared = latestSeats ? [...latestSeats.values()].filter((s) => s.state === 'won').length : 0
  const time = timeState({ latestAt, now: clockFor({ labelled: sv.dataLabel !== null, latestAt, wall }), declared, total: SEATS, viewing: !live, held: sv.mode === 'held' })
  // A live row whose ingest stamp has gone quiet (VE-188). Same clock as the pill: the wall clock, or the tick itself for replay and the made-up nights.
  const stale = sv.mode === 'results' ? staleLine(status, clockFor({ labelled: sv.dataLabel !== null, latestAt, wall }), (ms) => clockLabel(ms, nightStart)) : null
  // Chips that do not apply (VE-104): Trust until enough seats are far enough counted, How sure once every seat is declared (Rewind before Final still shows it).
  const chipsOff = { trust: !trustReady(seats.values()), certainty: time.state === 'final', gains: !gainsAvailable(seats.values(), tick?.countedPct ?? 0) }
  // A colour that switches off while it is the active one (Rewind backwards, or Final arriving) falls back to Leader, quietly.
  useEffect(() => {
    if (!tick) return // before the first figures every seat looks uncounted; keep a linked colour until there is data
    if ((view.colour === 'trust' && chipsOff.trust) || (view.colour === 'certainty' && chipsOff.certainty) || (view.colour === 'gains' && chipsOff.gains)) dispatch({ type: 'colour', colour: 'leader' })
  }, [view.colour, chipsOff.trust, chipsOff.certainty, chipsOff.gains, tick])
  // VE-166: a pick or filter whose chip has gone is cleared, so no seat stays picked or filtered by something that cannot be turned off.
  // Close seats goes below HEADLINE_MIN_PCT counted (Rewind back), and Won goes at Final (FB-194, FB-195). Adjusted during render
  // (React's pattern for state that follows a prop), so the stage never draws a frame with a pick whose chip has gone.
  if (tick) {
    const closeGone = tick.countedPct < HEADLINE_MIN_PCT && (focus === DOUBT || railStatus === 'doubt')
    const wonGone = allWon && railStatus === 'won'
    // Changing hands follows Gains: it goes below GAINS_FROM_COUNTED_PCT counted (VE-168, FB-198)
    const changingGone = tick.countedPct < GAINS_FROM_COUNTED_PCT && railStatus === 'changing'
    if (closeGone || wonGone || changingGone) {
      if (closeGone && focus === DOUBT) setFocus(null)
      if ((closeGone && railStatus === 'doubt') || wonGone || changingGone) setRailStatus(null)
    }
  }
  // VE-89: the guided tour opens by itself on a first visit, once the figures and the stage are up (the rules are in tour/rule.ts).
  const tourTried = useRef(false)
  const tourReady = showResults && !!statics && !!tick
  const tourRewinding = view.rewindOpen || !live
  const tourSeatOpen = view.selected !== null
  const tourExploreOpen = explore !== null
  useEffect(() => {
    if (!tourReady || tourTried.current) return
    // A beat for the layout to settle, so every target has its final place. A change in where the person is restarts the beat.
    const id = window.setTimeout(() => {
      tourTried.current = true
      void autoStartTour({ rewinding: tourRewinding, seatOpen: tourSeatOpen, exploreOpen: tourExploreOpen })
    }, 1200)
    return () => window.clearTimeout(id)
  }, [tourReady, tourRewinding, tourSeatOpen, tourExploreOpen])

  return (
    <BoothSourceContext.Provider value={boothSource}>
    <CandidatesContext.Provider value={candidatesFeed}>
    <PaletteContext.Provider value={palette}>
     <FxProvider value={fx}>
      <div className="app" style={{ ['--fx-scale' as string]: fx.scale }} data-mode={sv.mode} data-morph={morphing} data-shape={view.shape} data-colour={view.colour} data-places={placesOn} data-selected={view.selected !== null} data-rewind={view.rewindOpen ? 'open' : 'closed'} data-explore={lensOpen} data-time={time.state}>
        <TopBand
          headline={showResults ? (tick ? headlineOf(tally) : 'Waiting for the first figures') : 'Results offline'}
          tally={tally}
          seats={seats}
          inDoubt={stats.inDoubt}
          close={stats.close}
          onShowDoubt={showDoubt}
          countedPct={tick?.countedPct ?? 0}
          asAt={tick ? label(tick.snapshotAt) : null}
          timeState={time.state}
          dataLabel={sv.dataLabel}
          sourceNote={source.note}
          pollNote={pollNote}
          colourInfo={<ColourInfo colour={view.colour} placesOn={placesOn} final={time.state === 'final'} noFaint={noFaint} />}
          focus={focus}
          onFocus={pickFocus}
          onPreview={setPreview}
        />
        {(sv.banner || (error && timeline)) && (
          <div className={`notice notice--${sv.mode}`} role="status" data-testid="status-banner">
            {sv.banner ?? 'Cannot reach the results right now. Showing the last update.'}
          </div>
        )}
        {stale && (
          <div className="notice notice--held" role="status" data-testid="stale-banner">
            {stale}
          </div>
        )}

        {!showResults ? (
          <main className="holding" data-testid="holding">
            <p>{sv.banner}</p>
            {/* VE-149, VE-307: the notice and the source are in the header's About, on a phone too, so the page needs no "i" of its own. */}
          </main>
        ) : !statics ? (
          <main className="holding holding--loading" data-testid="holding-loading">
            {/* VE-227 (finding 6): the state's outline stands in for the stage while it loads. */}
            <svg className="holding__outline" viewBox={VIC_OUTLINE_VIEWBOX} aria-hidden="true" data-testid="loading-outline">
              <path d={VIC_OUTLINE_PATH} />
            </svg>
            <p>{error ?? 'Loading results...'}</p>
          </main>
        ) : (
          <div className="workspace">
            <div className="stage" style={pickEdgeStyle}>
              {/* VE-286: says what the outlined seats are; a hover preview shows it fainter and without the clear button. */}
              {lit && !lensOpen && (
                <div className="pickchip-wrap">
                  <PickChip focus={lit} seats={seats} pal={palette} preview={preview !== null && preview !== focus} onClear={clearPick} />
                </div>
              )}
              <main ref={panesRef} className={`panes${fade ? ` panes--fade-${fade}` : ''}`}>
                {/* Both shapes fill the one stage and only the chosen one shows, so a morph is the same rect to the same rect. */}
                <section className="pane pane--map" aria-label="Map" data-active={view.shape === 'map'} data-leaving={leaving === 'map'}>
                  <MapPane apiRef={mapApi} districts={statics.districts} seats={seats} paints={placesOn ? quietPaints : paints} certainty={view.colour === 'certainty' && !placesOn} selected={view.selected} pop={pop} onSelect={select} ring={ringId} dots={placesOn ? (dots ?? []) : null} flash={boothFlash} onPickBooth={pickDot} pickedBooth={boothPanel ? view.booth : null} railOpen={railOpen && !lensOpen} rest={view.shape === 'map' && !placesOn && !lensOpen} />
                </section>
                <section className="pane pane--seats" aria-label="Hex" data-active={view.shape === 'hex'} data-leaving={leaving === 'hex'}>
                  <SeatsPane seatHexes={statics.seatHexes} seats={seats} paints={paints} colour={view.colour} certainty={view.colour === 'certainty'} selected={view.selected} pop={pop} onSelect={select} ring={ringId} />
                </section>
                {geometry && (
                  <TransitionOverlay
                    className="transition-overlay"
                    geometry={geometry}
                    getScene={getScene}
                    onStage={onStage}
                    runnerRef={runnerRef}
                    startMode={startMode}
                  />
                )}
              </main>
              {!placesOn && (
              <HexInset
                big={view.shape}
                seatHexes={statics.seatHexes}
                seats={seats}
                paints={paints}
                selected={view.selected}
                pop={pop}
                minimised={insetMin}
                mapApi={mapApi}
                onSelect={select}
                onSwap={() => changeShape(view.shape === 'map' ? 'hex' : 'map')}
                onMinimise={() => setInset(true)}
                onRestore={() => setInset(false)}
              />
              )}
              {/* VE-303: the map's own "How to read this map", top right of the stage on a desktop (the phone keeps its float "i"). */}
              {!lensOpen && <MapInfo colourInfo={<ColourInfo colour={view.colour} placesOn={placesOn} final={time.state === 'final'} noFaint={noFaint} tally={tally} />} final={allWon} marksDrawn={placesOn || view.colour === 'leader'} dataLabel={sv.dataLabel} sourceNote={source.note} notes={view.colour === 'leader' && !placesOn ? <CountNotes final={allWon} /> : undefined} />}
              {/* The dots have no Hex and no region buttons (FB-153), so the shape controls and the inset step aside. */}
              {!placesOn && <StageControls shape={view.shape} onShape={changeShape} />}
              <ColourChips
                colour={view.colour}
                onColour={(colour) => {
                  dispatch({ type: 'places', on: false })
                  dispatch({ type: 'colour', colour })
                  // A party tapped in the Gains key does not carry over to a later visit.
                  setGainsParty(null)
                }}
                gains={{ nets, party: gainsParty, onParty: setGainsParty }}
                declared={allWon}
                noFaint={noFaint}
                tooEarly={view.colour === 'trust' && [...paints.values()].some((p) => p.hatch)}
                noFigures={[...seats.values()].some((s) => !s.leader)}
                earlyOnly={[...seats.values()].some((s) => !s.leader) && [...seats.values()].every((s) => (leadStep(s) ?? 0) === 0)}
                hexNumbers={view.shape === 'hex' && view.colour !== 'gains' && [...seats.values()].some((s) => s.pct !== null && s.state !== 'won')}
                stillLine={stillLine}
                tally={tally}
                pick={lit}
                off={chipsOff}
                places={placesOffered ? { on: placesOn, onPick: pickPlaces, parties: placeParties } : undefined}
              />
              <ClosestSeats seats={seats} countedPct={tick?.countedPct ?? 0} final={allWon} party={gainsParty} active={!placesOn && !lensOpen} ring={ringId} onRing={setRingId} onSelect={select} />
              {placesOn && sv.dataLabel && (
                <p className="places-marker" role="note" data-testid="places-marker" data-short={nightWords(sv.dataLabel)?.pill ?? sv.dataLabel}>{notLiveMarker(sv.dataLabel)}</p>
              )}
              {placesOn && boothLoad.status !== 'ready' && (
                <p className="places-note" role="status" data-testid="places-note">
                  {boothLoad.status === 'error' ? 'Polling places could not be loaded.' : 'Loading polling places...'}
                </p>
              )}
              {/* Narrow screens: one "View" button replaces the shape control above; the colour chips become a strip above the Seats handle (CSS, VE-106). */}
              <ViewSheet shape={view.shape} onShape={changeShape} />
              {/* Narrow screens: the "i" floats over the stage (it sits in the band on desktop). */}
              <div className="float" data-testid="float-controls">
                <ReadingKey sourceNote={source.note} colourInfo={<ColourInfo colour={view.colour} placesOn={placesOn} final={time.state === 'final'} noFaint={noFaint} tally={tally} />} final={allWon} dataLabel={sv.dataLabel} marksDrawn={placesOn || view.colour === 'leader'} />
              </div>
              <ExploreLayer seats={seats} statics={statics} explore={explore} onExplore={setExplore} rewinding={view.rewindOpen || !live} onSelectSeat={select} selectedId={view.selected} at={tick?.snapshotAt} replay={notLive} dataLabel={sv.dataLabel} />
            </div>
            <SeatsRail
              seats={seats}
              statics={statics.districtById}
              selected={view.selected}
              focus={focus}
              onFocus={pickFocus}
              onSelect={select}
              pulse={pulse}
              shownIdx={idx}
              total={ticks.length}
              countedPct={tick?.countedPct ?? 0}
              status={railStatus}
              onStatus={pickStatus}
              lens={swingPanel ?? gainsPanel}
              onOpenChange={setRailOpen}
            />
            {/* Always mounted: the host keeps the panel on screen for its leave animation. */}
            <BoothPanelHost
              data={boothPanel}
              dataLabel={sv.dataLabel}
              since={boothSeat?.baseNote ?? ''}
              label={label}
              nightEnds={ticks.length > 1 ? { start: label(ticks[0]!.snapshotAt), end: label(ticks[ticks.length - 1]!.snapshotAt), total: ticks.length } : null}
              onSeat={() => dispatch({ type: 'booth', id: null })}
              onClose={() => select(null)}
              onPick={openPlace}
              handoff={panelHandoff}
              candidates={candKey ? cands.get(candKey) ?? null : null}
            />
            <DistrictPanelHost
              seat={boothPanel ? null : selectedSeat}
              handoff={panelHandoff}
              places={seatPlaces}
              onPickPlace={openPlace}
              candidates={candKey ? cands.get(candKey) ?? null : null}
              onClose={() => select(null)}
              turnout={allWon}
              note={selectedSeat ? replayNote(sv.dataLabel, statics.districtById.get(selectedSeat.id)?.base_source) : null}
              // VE-224: no swing says why when the contest changed or the pair looks wrong; too early keeps no line.
              swing={selectedSeat ? swingLine(swingShown(selectedSeat, statics.districtById.get(selectedSeat.id)), selectedSeat.baseNote) ?? swingGapLine(selectedSeat, statics.districtById.get(selectedSeat.id)) : null}
              night={
                selectedSeat && ticks.length > 0
                  ? { series: (pulse.get(selectedSeat.id) ?? []).slice(0, idx + 1), total: ticks.length, startLabel: label(ticks[0]!.snapshotAt), endLabel: label(ticks[ticks.length - 1]!.snapshotAt) }
                  : null
              }
            />
          </div>
        )}

        <footer className="footer">
          {showResults && statics && <Rewind view={view} ticks={ticks} label={label} dispatch={dispatch} base={time.base} />}
          <span className="footer__fill" />
        </footer>
        <FxAnnouncer seats={seats} />
      </div>
     </FxProvider>
    </PaletteContext.Provider>
    </CandidatesContext.Provider>
    </BoothSourceContext.Provider>
  )
}
