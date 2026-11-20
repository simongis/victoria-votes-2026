import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { DistrictStatic } from '@vic26/schema'
import type { GeoCollection } from '../data/types'
import type { Seat } from '../derive/seats'
import { css, usePalette, type Palette } from '../theme/theme'
import { BLUR_PX, HATCH_STRIPE, type SeatPaint } from '../derive/colour'
import { allDeclared, seatLabel } from '../views/encoding'
import type { MapCamera } from '../views/projection'
import { getMotion } from '../state/motion'
import { useFx } from './Effects'
import { boxInside, fitCam, frame, panBy, toMatrix, worldBox, zoomAbout, type Cam } from './map/camera'
import { popStyle } from '../derive/focus'
import { HexLabel, type HexAnchor } from './HexLabel'
import { BoothLayer } from './booths/BoothLayer'
import { boothLabel, type BoothDot } from './booths/dots'
import { nearestDot, type ScreenDot } from './booths/hit'
import { placeBooths, screenDots } from './booths/place'
import { onFill } from './map/ink'
import { VIC_OUTLINE_PATH, VIC_OUTLINE_VIEWBOX } from './map/vicOutline'
import { loadTier, pathBoxTicks, pathCentre, tierFor, type Box, type Tier } from './map/tiers'
import { clampOver, frameSeat, NO_INSET, railCover, unionBox, type Inset } from './map/frameSeat'
import { FLOAT_ROW_PX, PANEL_HALF } from './sheet/sheet'
import './map/map.css'
import '../styles/map.css'

/** What the transition layer needs from the map: where it is looking, even while it is hidden. */
export interface MapApi {
  /** VicGrid centre and metres per pixel; the last good reading if the pane is hidden or not ready. */
  camera(): MapCamera | null
  /** Back to the whole state (the full-extent button, VE-73). */
  fit(): void
}

interface Props {
  apiRef?: MutableRefObject<MapApi | null>
  /** The data source's districts. The drawing geometry is a static asset keyed by the same district_id, so only the attributes are read from here. */
  districts: GeoCollection<DistrictStatic>
  seats: Map<number, Seat>
  selected: number | null
  /** Each seat's fill under the active colour (and the party focus); Certainty also sets its blur band. */
  paints: Map<number, SeatPaint>
  certainty: boolean
  /** Number of the in-doubt pick on show (0 for none): the seats picked pop once when it starts (VE-105). */
  pop: number
  onSelect: (id: number | null) => void
  /** A seat ringed from outside the map (a Gains card hovered or focused, VE-156): drawn with the hover ring. */
  ring?: number | null
  /** Polling places (VE-77c): when given, the map draws these dots over quiet seats and a tap on a dot picks its seat. Null for the usual map. */
  dots?: readonly BoothDot[] | null
  /** A tap (or Enter on a focused dot) on a polling place (VE-208). Without it the tap picks the place's seat, as before. */
  onPickBooth?: (dot: BoothDot) => void
  /** VE-208b: the place whose panel is open; its dot keeps the ring while the panel is open (a hover or focus ring wins). */
  pickedBooth?: number | null
  /** VE-227 (finding 2): the phone's Seats list is open over the bottom of the stage; the map refits to the part above it. */
  railOpen?: boolean
}

/** Is the paper dark? Picks which way the quiet marks lean: a light line on dark, a dark line on light. */
const darkPaper = (pal: Palette): boolean => 0.299 * pal.paper[0] + 0.587 * pal.paper[1] + 0.114 * pal.paper[2] < 110

const reducedMotion = (): boolean => getMotion() === 'reduced'
/** Pixels a pointer may wander and still count as a tap. */
const SLOP = 5
const BANDS = [0, 1, 2] as const
/** A declared tick is drawn only in a seat at least this many pixels across; at state scale inner Melbourne is a speck and the rail says "Won" anyway. */
const MIN_TICK_SEAT_PX = 18
/** VE-165: a changed seat narrower than this on screen wears a thin edge, so its fill survives (inner Melbourne at state zoom). */
const SMALL_GAIN_SEAT_PX = 28
const SMALL_GAIN_EDGE_PX = 0.8
/** The in-doubt pop (VE-105): every seat grows at least this much, and a speck of a seat up to POP_MAX to reach POP_TARGET_PX across. */
const POP_MIN = 1.15
const POP_MAX = 3.5
const POP_TARGET_PX = 18
/** The tick, about 11 px wide whatever the zoom. */
const TICK_D = 'M-5 0.4 L-1.6 4 L5.2 -3.6'

/** The operations the gestures, buttons, selection and resize all share; built once per mount. */
interface Ctl {
  tier(t: Tier): void
  apply(): void
  fit(): void
  zoomBy(factor: number): void
  show(box: Box): void
  /** Phone only (VE-217): ease the map to frame a seat above its sheet. False on a desktop, or before the map is ready. */
  frameSeat(box: Box): boolean
  /** Phone only (VE-227): the Seats list opened or closed. The map refits above it, or frames the lit seats (`lit`) when a pick lights some. */
  rail(open: boolean, lit: readonly Box[]): void
  /** The camera the pane is looking through now, and the pane size, for the "is it tiny / off screen" test. */
  view(): { cam: Cam; w: number; h: number } | null
  /** The polling place dot nearest a point in pane pixels, within reach (finger or mouse). */
  nearDot(px: number, py: number, reach: number): { dot: BoothDot; s: ScreenDot } | null
}

/**
 * Phones (VE-217, ADR 0032): the seat sheet covers the bottom 55% of the stage (app.css), or the right min(380px, 50%) when
 * the phone is sideways (panel.css), and the "i" row floats over the top 52 px. A tapped seat is framed in what is left.
 */
const PHONE = '(max-width: 1023px)'
const PHONE_SIDEWAYS = '(orientation: landscape) and (max-height: 500px)'
/** The seat sheet's half height as a share of the stage (sheet.ts, ADR 0035): a tapped seat is framed above it. */
const SHEET_SHARE = PANEL_HALF
const SHEET_SIDE_PX = 380
/** The ease to a framed seat. */
const FRAME_MS = 400
/** Zoomed in by more than this share of the whole-state fit, a phone offers the Whole state button. */
const ZOOMED = 0.97

/**
 * Map view: the 88 districts as plain SVG, coloured by leader with the shared encoding (ADR 0020). The outlines are
 * projected (VicGrid) and simplified at build time, so nothing heavy loads at startup; a finer tier is fetched only if
 * someone zooms in. No basemap: paper everywhere and the districts themselves draw Victoria.
 *
 * Each layer's paths sit under one matrix group, set by hand during a gesture (a React render per frame would be
 * wasteful); the blur and shadow filters sit outside that group, so they stay in screen pixels as the map zooms.
 */
export function MapPane({ apiRef, seats, paints, certainty, selected, pop, onSelect, ring = null, dots = null, onPickBooth, pickedBooth = null, railOpen = false }: Props) {
  const pal = usePalette()
  const fx = useFx()
  // Phones show one Victoria map the reader pinches and pans (ADR 0032, VE-217); the Melbourne close-up is gone.
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tintRef = useRef<SVGGElement>(null)
  const ctl = useRef<Ctl | null>(null)
  const tierRef = useRef<Tier | null>(null)
  const [tier, setTier] = useState<Tier | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  // The seat under a mouse pointer (VE-120). Mouse only: a tap selects, and a hover left behind by a finger would stick.
  const [hover, setHover] = useState<number | null>(null)
  // The dot under a mouse pointer or keyboard focus (VE-77c): its id and where it sits, so the label can be anchored. The dot itself is read fresh from `dots`.
  const [boothTip, setBoothTip] = useState<{ id: number; anchor: HexAnchor; keyboard: boolean } | null>(null)
  const dotsRef = useRef(dots)
  useEffect(() => {
    dotsRef.current = dots
  }, [dots])
  const selectRef = useRef(onSelect)
  useEffect(() => {
    selectRef.current = onSelect
  }, [onSelect])
  const pickBoothRef = useRef(onPickBooth)
  useEffect(() => {
    pickBoothRef.current = onPickBooth
  }, [onPickBooth])

  useEffect(() => {
    const container = containerRef.current
    const svg = svgRef.current
    if (!container || !svg) return
    let cam: Cam | null = null
    let w = 0
    // The camera's height: the pane's, less what an open Seats list covers (railPx), so the whole fit, clamp and gestures work above the list unchanged (VE-227).
    let h = 0
    let rawH = 0
    let railPx = 0
    // Moved by a person (so a resize keeps their view) or still at the opening fit (so a resize refits).
    let touched = false
    let loading = -1
    let raf = 0
    let settleTimer = 0
    let moveTimer = 0
    const world = () => tierRef.current?.world ?? null
    // What the seat sheet and the floating "i" cover on a phone; null on a desktop, where nothing is framed round them.
    const phoneMq = typeof matchMedia === 'function' ? matchMedia(PHONE) : null
    const sidewaysMq = typeof matchMedia === 'function' ? matchMedia(PHONE_SIDEWAYS) : null
    const phoneInset = (): Inset | null => {
      if (!phoneMq?.matches) return null
      if (sidewaysMq?.matches) return { top: FLOAT_ROW_PX, right: Math.min(SHEET_SIDE_PX, w / 2), bottom: 0, left: 0 }
      return { top: FLOAT_ROW_PX, right: 0, bottom: Math.round(h * SHEET_SHARE), left: 0 }
    }
    const marks = () => svg.querySelectorAll<SVGGElement>('g.world')

    const settle = () => {
      const wd = world()
      if (wd && cam && w > 0) container.dataset.fitted = String(boxInside(cam, w, h, worldBox(wd), 2))
    }
    const apply = () => {
      const t = tierRef.current
      if (!t || !cam || w <= 0) return
      const [a, tx, ty] = toMatrix(cam, t.world, t.tick, w, h)
      const m = `matrix(${a} 0 0 ${a} ${tx} ${ty})`
      marks().forEach((g) => g.setAttribute('transform', m))
      // Polling place dots keep their size on screen too (they are moved, not scaled).
      const wd = t.world
      placeBooths(svg.querySelector('g.booth-dots'), cam, w, h, fitCam(wd, w, h).res)
      // The hatch (VE-98) lives in map units, so counter-scale it to keep the stripes the same size on screen at any zoom.
      svg.querySelector('#map-hatch')?.setAttribute('patternTransform', `rotate(45) scale(${1 / a})`)
      // Declared ticks keep their size on screen, so each is placed (not scaled) at its seat's centre by the same matrix.
      svg.querySelectorAll<SVGGElement>('g.map-tick').forEach((g) => {
        const x = Number(g.dataset.x)
        const y = Number(g.dataset.y)
        g.setAttribute('transform', `translate(${a * x + tx} ${a * y + ty})`)
        g.style.display = Number(g.dataset.span) * a < MIN_TICK_SEAT_PX ? 'none' : ''
      })
      // A changed seat only a few pixels across loses its fill to the 2 px edge: give it a thin one (strokes are non-scaling, so this is screen pixels).
      svg.querySelectorAll<SVGPathElement>('path.map-gain').forEach((p) => {
        const small = Number(p.dataset.span) * a < SMALL_GAIN_SEAT_PX
        p.style.strokeWidth = small ? String(SMALL_GAIN_EDGE_PX) : ''
      })
      // Metres per pixel, for the e2e specs (the matrix scale also changes with the tier).
      container.dataset.res = cam.res.toFixed(2)
      // Zoomed in past the whole state: a phone shows its Whole state button (CSS), VE-217.
      container.dataset.zoomed = String(cam.res < fitCam(wd, w, h).res * ZOOMED)
    }
    // A finer tier only once the zoom shows the difference, and never a coarser one again.
    const upgrade = () => {
      if (!cam) return
      const want = tierFor(cam.res)
      const have = tierRef.current ? tierIndex(tierRef.current) : -1
      if (want > have && want > loading) {
        loading = want
        loadTier(want).then((t) => ctl.current?.tier(t)).catch(() => (loading = have))
      }
    }
    const set = (c: Cam) => {
      cam = c
      apply()
      upgrade()
    }
    // On a phone the map may run past the coast by what the sheet covers, once zoomed in (frameSeat.ts); on a desktop this is clampCam.
    const clamp = (c: Cam) => {
      const wd = world()
      return wd ? clampOver(c, wd, w, h, phoneInset() ?? NO_INSET) : c
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(settleTimer)
    }
    const moving = () => {
      svg.classList.add('is-moving')
      window.clearTimeout(moveTimer)
      moveTimer = window.setTimeout(() => svg.classList.remove('is-moving'), 160)
    }
    const goTo = (target: Cam, ms: number) => {
      stop()
      const to = clamp(target)
      if (!cam || ms <= 0 || reducedMotion()) {
        set(to)
        settle()
        return
      }
      const from = cam
      const t0 = performance.now()
      container.dataset.fitted = 'pending'
      svg.classList.add('is-moving')
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / ms)
        const e = 1 - (1 - k) ** 3
        set({ cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e, res: from.res * (to.res / from.res) ** e })
        if (k < 1) raf = requestAnimationFrame(step)
        else {
          svg.classList.remove('is-moving')
          settle()
        }
      }
      raf = requestAnimationFrame(step)
    }
    const fit = (ms = 300) => {
      const wd = world()
      if (!wd || w <= 0) return
      touched = false
      goTo(fitCam(wd, w, h), ms)
    }
    const init = () => {
      const wd = world()
      if (cam || !wd || w <= 0) return
      set(fitCam(wd, w, h))
      settle()
      container.dataset.ready = 'true'
    }

    ctl.current = {
      tier(t) {
        const first = tierRef.current === null
        tierRef.current = t
        loading = -1
        setTier(t)
        if (first) init()
        // Paths for the new tier land on the next render; the layout effect below re-applies the matrix for them.
      },
      apply,
      fit: () => fit(300),
      zoomBy(factor) {
        const wd = world()
        if (!wd || !cam) return
        touched = true
        goTo(zoomAbout(cam, factor, w / 2, h / 2, w, h), 220)
      },
      show(box) {
        if (!cam || w <= 0) return
        touched = true
        goTo(frame(box, w, h, 0), 450)
      },
      rail(open, lit) {
        const wd = world()
        const portrait = !!phoneMq?.matches && !sidewaysMq?.matches
        const list = container.closest('.workspace')?.querySelector<HTMLElement>('.rail')
        // VE-228: the list settles with an ease and may be at full, so its top is read from its half height (useSheet), not
        // from where it is mid-move. At full the map is behind the list and keeps the half fit.
        const half = Number(list?.dataset['sheetHalf'])
        const listTop = list ? (half > 0 ? list.getBoundingClientRect().bottom - half : list.getBoundingClientRect().top) : 0
        const px = open && portrait && list ? Math.round(railCover(container.getBoundingClientRect(), listTop)) : 0
        if (rawH <= 0 || !cam || !wd) return
        if (px !== railPx) {
          const before = h
          railPx = px
          h = rawH - px
          if (!touched) fit(300)
          // A map the reader has moved keeps its top left where it is, as a resize does.
          else set(clamp({ ...cam, cy: cam.cy - ((h - before) / 2) * cam.res }))
          settle()
        }
        // Close seats or Changing hands light some seats: frame them above the list (the same maths as a tapped seat).
        const box = open && px > 0 ? unionBox(lit) : null
        if (box) {
          touched = true
          goTo(frameSeat({ box, world: wd, W: w, H: h, inset: NO_INSET, cam }), FRAME_MS)
        }
      },
      frameSeat(box) {
        const wd = world()
        const inset = phoneInset()
        if (!inset || !wd || !cam || w <= 0) return false
        const to = frameSeat({ box, world: wd, W: w, H: h, inset, cam })
        // Already closer in with the seat in view: the map stays where the reader left it.
        if (to === cam) return true
        touched = true
        goTo(to, FRAME_MS)
        return true
      },
      view: () => (cam ? { cam, w, h } : null),
      nearDot(px, py, reach) {
        const list = dotsRef.current
        const wd = world()
        if (!list || !cam || !wd || w <= 0) return null
        const s = nearestDot(screenDots(list, cam, w, h, fitCam(wd, w, h).res), px, py, reach)
        const dot = s ? list.find((d) => d.id === s.key) : undefined
        return s && dot ? { dot, s } : null
      },
    }
    // Start the geometry fetch now, with the data: a phone starts on the coarse tier, a desktop on the middle one.
    const first = innerWidth < 700 ? 0 : 1
    loadTier(first).then((t) => (tierRef.current === null ? ctl.current?.tier(t) : undefined)).catch(() => undefined)

    container.dataset.ready = 'false'
    container.dataset.fitted = 'pending'
    // What the transition overlay needs: where the map is looking, kept for a hidden (zero size) pane.
    let last: MapCamera | null = null
    if (apiRef) {
      apiRef.current = {
        camera: () => {
          if (cam && w > 0) last = { cx: cam.cx, cy: cam.cy, resolution: cam.res, units: 'vicgrid' }
          return last
        },
        fit: () => fit(300),
      }
    }

    // Refit when the pane changes size (window resize, rotation, Rewind opening). A pane that is still at the opening fit
    // refits to the new size (gliding if only the height changed); one a person has moved keeps its view and zoom.
    let seenW = 0
    let seenH = 0
    const watch = new ResizeObserver(() => {
      const nw = container.clientWidth
      rawH = container.clientHeight
      const nh = rawH - railPx
      if (nw <= 0 || nh <= 0) return
      setSize({ w: nw, h: rawH })
      const hadSize = seenW > 0
      const heightOnly = hadSize && nw === seenW
      const dw = nw - seenW
      const dh = nh - seenH
      seenW = w = nw
      seenH = h = nh
      if (!cam) {
        init()
        return
      }
      if (touched) {
        // Keep what is on screen where it is: the top left stays put.
        set(clamp({ ...cam, cx: cam.cx + (dw / 2) * cam.res, cy: cam.cy - (dh / 2) * cam.res }))
        settle()
        return
      }
      container.dataset.fitted = 'pending'
      fit(heightOnly ? 300 : 0)
    })
    watch.observe(container)

    // ---- gestures: one pointer drags, two pinch, the wheel zooms, a tap selects ----
    const down = new Map<number, { x: number; y: number }>()
    let tapId: string | null = null
    let tapDot: BoothDot | null = null
    let travelled = 0
    let pinch: { d: number } | null = null
    const local = (e: { clientX: number; clientY: number }) => {
      const r = svg.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const dist = () => {
      const [a, b] = [...down.values()]
      return Math.hypot(a!.x - b!.x, a!.y - b!.y)
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      stop()
      svg.classList.remove('is-moving')
      down.set(e.pointerId, local(e))
      if (down.size === 1) {
        travelled = 0
        tapId = (e.target as Element).closest('[data-district]')?.getAttribute('data-district') ?? null
        tapDot = null
        // Polling places: a dot near the tap wins over the seat under it, so a dot always picks its own seat.
        const p = local(e)
        const near = ctl.current?.nearDot(p.x, p.y, e.pointerType === 'touch' ? 16 : 9)
        if (near) {
          tapId = String(near.dot.districtId)
          tapDot = near.dot
        }
      } else {
        // A second finger: it is a pinch, never a tap.
        travelled = Infinity
        pinch = down.size === 2 ? { d: dist() } : null
      }
    }
    const onMove = (e: PointerEvent) => {
      const prev = down.get(e.pointerId)
      if (!prev || !cam) return
      const p = local(e)
      down.set(e.pointerId, p)
      if (down.size === 1) {
        travelled += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)
        if (travelled <= SLOP) return
        // A drag only counts as a drag once it leaves the tap slop; capture then so it survives leaving the pane.
        if (!svg.hasPointerCapture(e.pointerId)) {
          svg.setPointerCapture(e.pointerId)
          svg.classList.add('is-dragging')
        }
        touched = true
        moving()
        set(clamp(panBy(cam, p.x - prev.x, p.y - prev.y)))
        container.dataset.fitted = 'pending'
      } else if (down.size === 2 && pinch) {
        const [a, b] = [...down.values()]
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y)
        const mx = (a!.x + b!.x) / 2
        const my = (a!.y + b!.y) / 2
        // The midpoint's own drift pans, the change in spread zooms about the midpoint.
        const others = [...down.entries()].find(([id]) => id !== e.pointerId)![1]
        const pm = { x: (prev.x + others.x) / 2, y: (prev.y + others.y) / 2 }
        touched = true
        moving()
        let next = panBy(cam, mx - pm.x, my - pm.y)
        if (pinch.d > 0 && d > 0) next = zoomAbout(next, d / pinch.d, mx, my, w, h)
        pinch.d = d
        set(clamp(next))
        container.dataset.fitted = 'pending'
      }
    }
    const onUp = (e: PointerEvent) => {
      if (!down.has(e.pointerId)) return
      down.delete(e.pointerId)
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId)
      if (down.size < 2) pinch = null
      if (down.size === 0) {
        svg.classList.remove('is-dragging')
        if (e.type === 'pointerup' && travelled <= SLOP) {
          // A tap: the district it started on, or none (empty paper clears the selection, as before).
          // A dot opens its own panel when the host asked for one (VE-208); otherwise it picks its seat.
          if (tapDot && pickBoothRef.current) pickBoothRef.current(tapDot)
          else selectRef.current(tapId === null ? null : Number(tapId))
        } else settle()
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (!cam) return
      e.preventDefault()
      stop()
      setBoothTip(null)
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      // A trackpad pinch arrives as ctrl + wheel with small deltas, so it gets a bigger gain.
      const k = Math.exp((-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0018)))
      const p = local(e)
      touched = true
      moving()
      set(clamp(zoomAbout(cam, k, p.x, p.y, w, h)))
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(settle, 180)
    }
    svg.addEventListener('pointerdown', onDown)
    svg.addEventListener('pointermove', onMove)
    svg.addEventListener('pointerup', onUp)
    svg.addEventListener('pointercancel', onUp)
    svg.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      stop()
      window.clearTimeout(moveTimer)
      watch.disconnect()
      svg.removeEventListener('pointerdown', onDown)
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
      svg.removeEventListener('pointercancel', onUp)
      svg.removeEventListener('wheel', onWheel)
      if (apiRef) apiRef.current = null
      ctl.current = null
    }
  }, [apiRef])

  // Every render may add paths (a new tier, a band change): give them the current matrix before they paint.
  useLayoutEffect(() => ctl.current?.apply())

  // Update effects (VE-60). Cut down for the same reasons as before: no wipe or landing (the fill swap is the flip's
  // colour change, and the canvas halo still rings it), and no fresh mark (VE-75b: recency is said in words in the top band).
  const ink = darkPaper(pal) ? 'rgb(255, 255, 255)' : 'rgb(26, 26, 26)'
  const animateTint = fx.active && !fx.reduced
  useEffect(() => {
    const tint = tintRef.current
    if (!tint) return
    tint.style.opacity = '0'
    if (!animateTint) return
    let frame = 0
    // Rise to the token alpha over the first fifth, then ease out to nothing: the same envelope as the hex tint.
    const peak = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fx-tint-alpha')) || 0.28
    const dur = (Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fx-count-ms')) || 900) * fx.scale
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur)
      tint.style.opacity = String(k < 0.2 ? peak * (k / 0.2) : peak * (1 - (k - 0.2) / 0.8) ** 2)
      if (k < 1) frame = requestAnimationFrame(tick)
      else tint.style.opacity = '0'
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      tint.style.opacity = '0'
    }
  }, [fx, animateTint, seats, pal, tier])

  // VE-227 (finding 2): an open Seats list covers the map's lower part; the map refits above it. A picked seat's sheet takes the
  // list's place, so it counts as closed then (and the full pane is back before the seat is framed, below). The lit seats are
  // read from the paints: Close seats and Changing hands light some, a plain list lights none.
  const litKey = [...paints].filter(([, p]) => p.lit).map(([id]) => id).join(',')
  useEffect(() => {
    const t = tierRef.current
    const lit = litKey === '' || !t ? [] : litKey.split(',').flatMap((id) => t.boxes.get(Number(id)) ?? [])
    ctl.current?.rail(railOpen && selected === null, lit)
  }, [railOpen, selected, litKey, tier])

  // A district picked in Seats may be off screen or a speck at state scale (inner Melbourne): bring it into view.
  // A phone frames each pick once (a tap, search or the seats list), above its sheet, with its neighbours round it (VE-217);
  // a finer tier landing later, or the sheet closing, leaves the map where it is.
  const framed = useRef<number | null>(null)
  useEffect(() => {
    if (selected === null) {
      framed.current = null
      return
    }
    const t = tierRef.current
    const v = ctl.current?.view()
    const box = t?.boxes.get(selected)
    if (!box || !v || framed.current === selected) return
    if (ctl.current?.frameSeat(box)) {
      framed.current = selected
      return
    }
    // Desktop: only a speck or a seat off screen moves the map.
    const wMetres = v.w * v.cam.res
    const tiny = box.maxE - box.minE < wMetres / 40 && box.maxN - box.minN < (v.h * v.cam.res) / 40
    if (tiny || !boxInside(v.cam, v.w, v.h, box, -4)) {
      // Room round it: a lot for a speck, a little otherwise.
      const grow = tiny ? 6 : 1.5
      const cx = (box.minE + box.maxE) / 2
      const cy = (box.minN + box.maxN) / 2
      const hw = ((box.maxE - box.minE) / 2) * grow
      const hh = ((box.maxN - box.minN) / 2) * grow
      ctl.current?.show({ minE: cx - hw, maxE: cx + hw, minN: cy - hh, maxN: cy + hh })
    }
  }, [selected, tier])

  const emptyStroke = darkPaper(pal) ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.22)'
  const shadow = darkPaper(pal) ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.28)'
  const ids = tier ? [...tier.paths.keys()] : []
  const bandOf = (id: number): number => (certainty ? (paints.get(id)?.band ?? 2) : 2)
  const edge = css(pal.edge)
  const region = { x: -60, y: -60, width: size.w + 120, height: size.h + 120 }
  // Under polling places the seats are quiet ground, so no declared ticks. At Final every seat is declared, so a tick on each says nothing (VE-166, FB-195); it derives from the seats on screen, so Rewind brings the ticks back.
  const won = dots || allDeclared(seats.values()) ? [] : ids.filter((id) => seats.get(id)?.state === 'won')
  // Each declared seat's mark point and size in ticks, read from its path (only declared seats are parsed).
  const wonKey = won.join(',')
  const centres = useMemo(() => {
    const out = new Map<number, { x: number; y: number; span: number }>()
    for (const id of wonKey === '' ? [] : wonKey.split(',')) {
      const d = tier?.paths.get(Number(id))
      if (!d) continue
      const b = pathBoxTicks(d)
      out.set(Number(id), { ...pathCentre(d), span: Math.min(b.x1 - b.x0, b.y1 - b.y0) })
    }
    return out
  }, [tier, wonKey])
  // VE-165: a changed seat's size in ticks, so a small one (inner Melbourne at state zoom) gets a thin edge and keeps its fill.
  const gainKey = ids.filter((id) => paints.get(id)?.gain).join(',')
  const gainSpans = useMemo(() => {
    const out = new Map<number, number>()
    for (const id of gainKey === '' ? [] : gainKey.split(',')) {
      const d = tier?.paths.get(Number(id))
      if (!d) continue
      const b = pathBoxTicks(d)
      out.set(Number(id), Math.min(b.x1 - b.x0, b.y1 - b.y0))
    }
    return out
  }, [tier, gainKey])
  const tinted = animateTint ? [...fx.changes].filter(([, c]) => c.counted || c.flipped).map(([id]) => id) : []
  const selPath = selected === null ? undefined : tier?.paths.get(selected)
  // A pointer over the map wins; otherwise the ring from a Gains card (VE-156).
  const ringed = hover ?? ring
  const hoverPath = ringed === null || ringed === selected ? undefined : tier?.paths.get(ringed)
  // Gains (VE-156): the seats that changed hands, drawn again above every fill with a heavier edge and a soft lift, so no neighbour covers them.
  const gains = ids.filter((id) => paints.get(id)?.gain)
  // Seats picked in the tally wear a thin dark outline (ADR 0023); a pick is the only time any seat but the selected one does.
  const picked = ids.filter((id) => paints.get(id)?.lit)
  // The pop grows a seat a little, but a small Melbourne seat is a speck at state scale: grow it until it is about
  // POP_TARGET_PX across, so the eye lands on it. Set on the outlines just before paint, as the map's zoom lives in a
  // ref (and the pop only needs it at the moment the pick starts).
  useLayoutEffect(() => {
    const v = ctl.current?.view()
    if (pop === 0 || !v || !tier) return
    svgRef.current?.querySelectorAll<SVGPathElement>('path.map-pick').forEach((el) => {
      const box = tier.boxes.get(Number(el.dataset.pick))
      if (!box) return
      const px = Math.min(box.maxE - box.minE, box.maxN - box.minN) / v.cam.res
      const k = px > 0 ? Math.min(POP_MAX, Math.max(POP_MIN, POP_TARGET_PX / px)) : POP_MIN
      el.style.setProperty('--pop-scale', k.toFixed(2))
    })
  }, [pop, tier, picked.length])

  const tipDot = boothTip && dots ? dots.find((d) => d.id === boothTip.id) : undefined
  const pickedDot = pickedBooth !== null && dots ? dots.find((d) => d.pick === pickedBooth) : undefined
  const onFocusDot = useCallback((dot: BoothDot | null, el: SVGCircleElement | null) => {
    const box = containerRef.current?.getBoundingClientRect()
    if (!dot || !el || !box) return setBoothTip((t) => (t?.keyboard ? null : t))
    const r = el.getBoundingClientRect()
    setBoothTip({ id: dot.id, anchor: { left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top }, keyboard: true })
  }, [])

  return (
    <>
    <div
      ref={containerRef}
      className="map-container"
      data-testid="map-container"
      data-selected={selected ?? ''}
      role="application"
      aria-label="Map of the 88 districts. Use the seats list for keyboard access."
    >
      <svg
        ref={svgRef}
        className="svgmap"
        data-testid="map-svg"
        onPointerOver={(e) => {
          if (e.pointerType !== 'mouse' || e.buttons !== 0) return
          const id = (e.target as Element).closest('[data-district]')?.getAttribute('data-district')
          setHover(id == null ? null : Number(id))
        }}
        onPointerMove={(e) => {
          if (!dotsRef.current || e.pointerType !== 'mouse' || e.buttons !== 0) return
          const r = e.currentTarget.getBoundingClientRect()
          const near = ctl.current?.nearDot(e.clientX - r.left, e.clientY - r.top, 9)
          if (!near) return setBoothTip((t) => (t && !t.keyboard ? null : t))
          const { x, y, r: rad } = near.s
          setBoothTip((t) => (t && t.id === near.dot.id && !t.keyboard ? t : { id: near.dot.id, anchor: { left: x - rad, right: x + rad, top: y - rad, bottom: y + rad }, keyboard: false }))
        }}
        onPointerLeave={() => {
          setHover(null)
          setBoothTip((t) => (t && !t.keyboard ? null : t))
        }}
        onPointerDown={() => {
          setHover(null)
          setBoothTip((t) => (t && !t.keyboard ? null : t))
        }}
      >
        <defs>
          <pattern id="map-hatch" width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={7} stroke={HATCH_STRIPE} strokeWidth={1.5} />
          </pattern>
          {BLUR_PX.map(
            (px, band) =>
              px > 0 && (
                <filter key={band} id={`map-blur-${band}`} filterUnits="userSpaceOnUse" {...region}>
                  <feGaussianBlur stdDeviation={px} />
                </filter>
              ),
          )}
          {/* One quiet shadow under the whole sharp layer, not one per seat. */}
          <filter id="map-shadow" filterUnits="userSpaceOnUse" {...region}>
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor={shadow} />
          </filter>
          {/* Gains (VE-156): the soft lift under the seats that changed hands, one shadow for the whole layer. */}
          <filter id="map-lift" filterUnits="userSpaceOnUse" {...region}>
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="rgba(0, 0, 0, 0.35)" />
          </filter>
        </defs>
        {/* Blurred bands first so the sharp seats sit on top; a band is only populated under Certainty. */}
        {BANDS.map((band) => (
          <g
            key={band}
            data-band={band}
            filter={certainty && BLUR_PX[band] > 0 ? `url(#map-blur-${band})` : band === 2 ? 'url(#map-shadow)' : undefined}
          >
            <g className="world">
              {ids
                .filter((id) => bandOf(id) === band)
                .map((id) => {
                  const s = seats.get(id)
                  const empty = !s?.leader
                  return (
                    <Fragment key={id}>
                    <path
                      data-district={id}
                      aria-label={s ? seatLabel(s) : undefined}
                      d={tier!.paths.get(id)}
                      fillRule="evenodd"
                      fill={css(paints.get(id)?.rgb ?? pal.noResult)}
                      // A seat with no result yet is the same colour as the ground, so it gets a faint outline to keep the state's shape readable (FB-53).
                      stroke={empty ? emptyStroke : edge}
                      strokeWidth={empty ? 0.75 : 0.5}
                    />
                    {/* Trust, too early to compare (VE-98): stripes over the faint base, never taking the pointer. */}
                    {paints.get(id)?.hatch && <path className="map-hatch" d={tier!.paths.get(id)} fillRule="evenodd" fill="url(#map-hatch)" stroke="none" pointerEvents="none" aria-hidden />}
                    </Fragment>
                  )
                })}
            </g>
          </g>
        ))}
        <g className="map-marks" data-layer="tint" ref={tintRef} style={{ opacity: 0 }}>
          <g className="world">
            {tinted.map((id) => (
              <path key={id} d={tier?.paths.get(id)} fillRule="evenodd" fill={ink} stroke="none" />
            ))}
          </g>
        </g>
        {/* Gains (VE-156): above every fill so neighbours never cover a changed seat, below the declared ticks. */}
        <g className="map-marks" data-layer="gains" filter={gains.length > 0 ? 'url(#map-lift)' : undefined}>
          <g className="world">
            {gains.map((id) => (
              <path key={id} className="map-gain" data-gain={id} data-span={gainSpans.get(id)} d={tier?.paths.get(id)} fillRule="evenodd" fill={css(paints.get(id)?.rgb ?? pal.noResult)} />
            ))}
          </g>
        </g>
        {/* Declared: a tick at the seat's centre (VE-75b), placed by the pan and zoom code and not scaled with the map. */}
        <g className="map-marks" data-layer="declared">
          {won.map((id) => {
            const c = centres.get(id)
            if (!c) return null
            return (
              <g key={id} className="map-tick" data-district-tick={id} data-x={c.x} data-y={c.y} data-span={c.span}>
                <path
                  className={`fx-tick${fx.active && fx.changes.get(id)?.declared ? ' fx-tick--new' : ''}`}
                  d={TICK_D}
                  style={{ stroke: onFill(paints.get(id)?.rgb ?? pal.noResult) }}
                />
              </g>
            )
          })}
        </g>
        {/* Polling places (VE-77c): above the seats and ticks, below the picks, hover and selection outlines. */}
        {dots && <BoothLayer dots={dots} ring={tipDot ?? pickedDot ?? null} onFocusDot={onFocusDot} onPick={onPickBooth} />}
        {/* The pick's outline sits above the fills and stays sharp even under Certainty's blur. */}
        <g className="map-marks" data-layer="picked">
          <g className="world">
            {picked.map((id, i) => (
              <path
                key={`${id}-${pop}`}
                className={pop > 0 ? 'map-pick pick-pop' : 'map-pick'}
                data-pick={id}
                d={tier?.paths.get(id)}
                fillRule="evenodd"
                style={pop > 0 ? popStyle(i, POP_MIN) : undefined}
              />
            ))}
          </g>
        </g>
        {/* Hover (VE-120): the same ring as the Hex, above the fills and the picks, sharp under Certainty's blur. Not drawn on the selected seat, which has its own outline. */}
        <g className="map-marks" data-layer="hover">
          <g className="world">
            {hoverPath && <path className="hover-ring map-hover" data-hover={ringed} d={hoverPath} fillRule="evenodd" />}
          </g>
        </g>
        {/* The selection outline stays sharp even when its seat is blurred. */}
        <g className="map-marks" data-layer="selection">
          <g className="world">{selPath && <path d={selPath} fill="none" stroke={css(pal.selected)} strokeWidth={3} />}</g>
        </g>
      </svg>
      {tipDot && boothTip && <HexLabel key={tipDot.id} text={boothLabel(tipDot)} anchor={boothTip.anchor} bounds={{ width: size.w, height: size.h }} keyboard={boothTip.keyboard} />}
      {/* Phones only (CSS), while zoomed in: back to the whole state (VE-217). Desktop keeps its outline button below. */}
      <button type="button" className="map-whole" data-testid="map-whole" title="Show all of Victoria" onClick={() => ctl.current?.fit()}>
        Whole state
      </button>
      <div className="map-zoom">
        {/* Desktop only (CSS), above + and -: back to the whole state. The icon is Victoria's real outline (ADR 0024). */}
        <button type="button" className="map-zoom__fit" data-testid="map-fit" aria-label="Show all of Victoria" title="Show all of Victoria" onClick={() => ctl.current?.fit()}>
          <svg viewBox={VIC_OUTLINE_VIEWBOX} aria-hidden="true">
            <path d={VIC_OUTLINE_PATH} />
          </svg>
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => ctl.current?.zoomBy(2)}>
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <path d="M9 3v12M3 9h12" />
          </svg>
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => ctl.current?.zoomBy(0.5)}>
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3 9h12" />
          </svg>
        </button>
      </div>
    </div>
    </>
  )
}

/** Index of a loaded tier by its grid (the three tiers have different ticks). */
function tierIndex(t: Tier): number {
  return t.tick >= 100 ? 0 : t.tick >= 25 ? 1 : 2
}
