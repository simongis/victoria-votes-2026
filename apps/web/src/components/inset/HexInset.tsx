import { Fragment, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import type { GeoCollection, SeatHexStatic } from '../../data/types'
import { HATCH_STRIPE, type SeatPaint } from '../../derive/colour'
import type { Seat } from '../../derive/seats'
import type { Shape } from '../../state/view'
import { css, usePalette } from '../../theme/theme'
import { seatLabel } from '../../views/encoding'
import { projectSvg, ringsById } from '../../views/geometry'
import type { MapApi } from '../MapPane'
import { loadTier, type Tier } from '../map/tiers'
import { popStyle } from '../../derive/focus'
import { getMotion } from '../../state/motion'
import { SEGMENT_MS, TIMING } from '../../transitions/timeline'
import { createZoomGauge, insetAway } from './zoom'
import './inset.css'

interface Props {
  /** The shape on the stage; the inset shows the other one. */
  big: Shape
  seatHexes: GeoCollection<SeatHexStatic>
  seats: Map<number, Seat>
  paints: Map<number, SeatPaint>
  selected: number | null
  /** Number of the in-doubt pick on show (0 for none), as for the stage. */
  pop: number
  minimised: boolean
  mapApi: MutableRefObject<MapApi | null>
  onSelect: (id: number | null) => void
  onSwap: () => void
  onMinimise: () => void
  /** Brings a minimised inset back (VE-119). The icon the inset shrinks to calls it. */
  onRestore?: () => void
}

/**
 * How long the Map/Hex flight runs at base speed, in ms: labels out, morph, labels in (transitions/timeline.ts). The swap
 * runs over the morph part of it, so the corner follows the big picture's beat.
 */
const FLIGHT_MS = SEGMENT_MS[0]
/** Shared by the outgoing and incoming pictures (keyframes in inset.css). Linear on purpose: an eased fade lingers near zero, and the card reads as blank. */
const SWAP_TIMING = { animationDuration: `${TIMING.morphMs}ms`, animationDelay: `${TIMING.labelsOutMs}ms`, animationTimingFunction: 'linear' }

/** Width over height of an svg viewBox string. */
const ratioOf = (vb: string): number => {
  const [, , w, h] = vb.split(' ').map(Number)
  return w! / h!
}

/** How often the map's zoom is read. The map has no change event, and a read is a few property lookups. */
const POLL_MS = 120

/**
 * The inset (ADR 0023, VE-78b): a small copy of the shape not on the stage, so all 88 seats stay in view when the Map is
 * showing and inner Melbourne is a speck. A seat tap selects it (the same selection as the stage and rail); a tap on
 * the blank space, or the swap button, trades the two shapes through the app's own morph. It goes away once the viewer
 * zooms the Map in themselves (VE-202b), and can be minimised into the shape toggle. Mouse and touch only: the seats list is the keyboard
 * route to a seat, as for the stage.
 */
export function HexInset({ big, seatHexes, seats, paints, selected, pop, minimised, mapApi, onSelect, onSwap, onMinimise, onRestore }: Props) {
  const pal = usePalette()
  const root = useRef<HTMLDivElement>(null)
  const [away, setAway] = useState(false)
  // Set only by the viewer's own gestures on the Map while it is the big shape (VE-202b). The fade follows what the viewer
  // did, not where the camera happens to sit: seat-pick framing, a flight or a camera left from earlier never fades it.
  const [viewerZoomed, setViewerZoomed] = useState(false)
  // The same fact for the poll below, which must not read the fit off a camera the viewer is moving right now.
  const gestured = useRef(false)
  const setZoomed = (v: boolean) => {
    gestured.current = v
    setViewerZoomed(v)
  }
  const [tier, setTier] = useState<Tier | null>(null)
  const inset = big === 'map' ? 'hex' : 'map'
  // The picture that was showing before the last switch, kept as a ghost that fades out over the new one for the length
  // of the big flight (VE-169). Set while rendering, not in an effect, so the new picture never lands for a frame
  // without it. `n` restarts the fade if the viewer switches again before it ends.
  const [seen, setSeen] = useState<'hex' | 'map'>(inset)
  const [ghost, setGhost] = useState<{ kind: 'hex' | 'map'; n: number } | null>(null)
  if (seen !== inset) {
    setSeen(inset)
    // Animations off: the picture swaps at once (ADR 0027), as the stage does.
    setGhost(getMotion() === 'full' ? { kind: seen, n: (ghost?.n ?? 0) + 1 } : null)
  }
  const ghostN = ghost?.n
  useEffect(() => {
    if (ghostN === undefined) return
    // A fallback for the animationend event (which never fires where the inset is display: none), a little after the flight ends.
    const t = window.setTimeout(() => setGhost(null), FLIGHT_MS + 120)
    return () => window.clearTimeout(t)
  }, [ghostN])

  // The Map's coarsest geometry is plenty at this size, and it is already fetched for a phone-sized first load. It is
  // loaded when the inset mounts, not on the first switch, so the first swap never shows an empty card (VE-169).
  useEffect(() => {
    if (tier) return
    let alive = true
    loadTier(0).then((t) => alive && setTier(t), () => undefined)
    return () => {
      alive = false
    }
  }, [tier])

  // A switch of shape hands the Map back with a clean slate (the Map keeps its camera while the Hex is large).
  const [bigSeen, setBigSeen] = useState(big)
  if (bigSeen !== big) {
    setBigSeen(big)
    setViewerZoomed(false)
  }

  // Fade with the Map's zoom, but only once the viewer has zoomed it. Only a Map on the stage can be zoomed.
  useEffect(() => {
    const gauge = createZoomGauge()
    let wasFitted = true
    const tick = () => {
      const res = mapApi.current?.camera()?.resolution ?? null
      // data-fitted is true only while the whole state is in view, which is exactly the full-extent fit.
      const fitted = root.current?.parentElement?.querySelector<HTMLElement>('.map-container')?.dataset.fitted === 'true'
      // data-fitted lags a fast wheel by a few ticks, so while the viewer is mid-gesture the fit is not re-learned from
      // the zoomed camera (that would read as 1x and never fade).
      if (fitted && !gestured.current) gauge.fit(res)
      // Back at the full fit (the full-extent button or a refit): the viewer's zoom is over. Cleared on the change, not
      // while fitted, so the first tick after a zoom gesture cannot beat the camera leaving the fit.
      if (fitted && !wasFitted) {
        gestured.current = false
        setViewerZoomed(false)
        gauge.fit(res)
      }
      wasFitted = fitted
      const gone = insetAway(gauge.read(res))
      setAway((was) => (was === gone ? was : gone))
    }
    tick()
    const t = window.setInterval(tick, POLL_MS)
    return () => window.clearInterval(t)
  }, [mapApi])

  useEffect(() => {
    if (big !== 'map') return
    const stage = root.current?.parentElement
    if (!stage) return
    // A drag, wheel or pinch on the Map, the zoom buttons or the zoom keys. Picks from the inset, the rail or a lens are not these.
    const gesture = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.map-container, .map-zoom') && !root.current?.contains(e.target as Node)) setZoomed(true)
    }
    const keys = (e: KeyboardEvent) => ['+', '=', '-', '_', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && gesture(e)
    stage.addEventListener('pointerdown', gesture, true)
    stage.addEventListener('wheel', gesture, { capture: true, passive: true })
    stage.addEventListener('keydown', keys, true)
    return () => {
      gestured.current = false
      stage.removeEventListener('pointerdown', gesture, true)
      stage.removeEventListener('wheel', gesture, true)
      stage.removeEventListener('keydown', keys, true)
    }
  }, [big])

  const hexes = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const shapes = [...ringsById(seatHexes)].map(([id, r]) => {
      const pts = r[0]!.map((p) => projectSvg(p))
      for (const [x, y] of pts) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
      return { id, d: `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z` }
    })
    const pad = 2
    return { shapes, viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}` }
  }, [seatHexes])

  const mapShapes = useMemo(() => (tier ? [...tier.paths].map(([id, d]) => ({ id, d })) : []), [tier])
  const layerOf = (kind: 'hex' | 'map') =>
    kind === 'hex'
      ? { shapes: hexes.shapes, viewBox: hexes.viewBox }
      : { shapes: mapShapes, viewBox: tier ? `0 0 ${tier.world.w / tier.tick} ${tier.world.h / tier.tick}` : '0 0 1 1' }
  // One fixed box for the picture, as tall as the taller of the two shapes needs, so the card holds still through a switch.
  const ratio = Math.min(ratioOf(hexes.viewBox), tier ? tier.world.w / tier.world.h : Infinity)
  // The picked seat is drawn last so its outline sits above its neighbours.
  const orderedOf = (list: { id: number; d: string }[]) => (selected === null ? list : [...list.filter((s) => s.id !== selected), ...list.filter((s) => s.id === selected)])
  const edge = css(pal.edge)
  // Only a Map the viewer has zoomed, on the stage, sends the inset away. With the Hex large, picking a seat still moves the
  // hidden Map's camera, which must not fade the small Map that is showing that pick (FB-141).
  const hidden = minimised || (big === 'map' && viewerZoomed && away)
  const shown = inset === 'hex' ? 'Hex' : 'Map'

  // One picture of the 88 seats. The ghost copy is for sight only: no seat attributes, no title, no clicks, hidden from
  // assistive tech, so tests, taps and screen readers meet one set of seats.
  const swapping = ghost !== null
  const picture = (kind: 'hex' | 'map', ghost: boolean): ReactNode => {
    const { shapes, viewBox } = layerOf(kind)
    return (
        <svg
          // Keyed by shape so a quick second switch restarts the fade-in rather than leaving the new picture already at full strength.
          key={kind}
          className={!ghost && swapping ? 'inset__svg inset__svg--in' : 'inset__svg'}
          style={!ghost && swapping ? SWAP_TIMING : undefined}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          {...(ghost ? { 'aria-hidden': true } : { role: 'group', 'aria-label': `${kind === 'hex' ? 'Hex' : 'Map'} of all 88 seats`, 'data-testid': 'inset-seats' })}
          onClick={ghost ? undefined : (e) => {
            const id = (e.target as Element).closest('[data-inset-seat]')?.getAttribute('data-inset-seat')
            // A seat selects; the blank space swaps the shapes.
            if (id) onSelect(Number(id))
            else onSwap()
          }}
        >
          {/* The ghost reuses the live picture's pattern (same id, same definition). */}
          {!ghost && <defs>
            {/* The hatch in this svg's own units: the inset scales the whole state to a few hundred pixels, so the stripes are fine. */}
            <pattern id="inset-hatch" width={2.4} height={2.4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={2.4} stroke={HATCH_STRIPE} strokeWidth={0.8} />
            </pattern>
          </defs>}
          {orderedOf(shapes).map((s) => {
            const seat = seats.get(s.id)
            const picked = selected === s.id
            return (
              <Fragment key={s.id}>
              <path
                {...(ghost ? {} : { 'data-inset-seat': s.id })}
                className={picked ? 'is-picked' : undefined}
                d={s.d}
                fillRule="evenodd"
                fill={css(paints.get(s.id)?.rgb ?? pal.noResult)}
                stroke={picked ? css(pal.selected) : seat?.leader ? edge : 'var(--hex-empty-edge, rgba(0, 0, 0, 0.22))'}
              >
                {!ghost && <title>{seat ? seatLabel(seat) : ''}</title>}
              </path>
              {paints.get(s.id)?.hatch && <path d={s.d} fillRule="evenodd" fill="url(#inset-hatch)" stroke="none" pointerEvents="none" aria-hidden />}
              </Fragment>
            )
          })}
          {/* Gains (VE-156): the seats that changed hands, drawn again above the rest with the heavier edge, so they read as small as they are. The picked seat keeps its own outline. */}
          <g className="inset__gains" pointerEvents="none" aria-hidden>
            {shapes
              .filter((s) => paints.get(s.id)?.gain && s.id !== selected)
              .map((s) => (
                <path key={s.id} className="inset-gain" d={s.d} fillRule="evenodd" fill={css(paints.get(s.id)?.rgb ?? pal.noResult)} />
              ))}
          </g>
          {/* The picked seats (a party or the seats in doubt) wear the stage's dark outline here too, so they can be found
              at a glance even when the stage is the Map and they are specks (VE-105). The in-doubt pick also pops. */}
          <g className="inset__picks" pointerEvents="none" aria-hidden>
            {shapes
              .filter((s) => paints.get(s.id)?.lit)
              .map((s, i) => (
                <path
                  key={`${s.id}-${pop}`}
                  className={pop > 0 && !ghost ? 'inset-pick pick-pop' : 'inset-pick'}
                  d={s.d}
                  fillRule="evenodd"
                  style={pop > 0 && !ghost ? popStyle(i, kind === 'hex' ? 1.5 : 2.2) : undefined}
                />
              ))}
          </g>
        </svg>
    )
  }

  return (
    <>
    <div
      ref={root}
      className="inset"
      data-testid="inset"
      data-inset={inset}
      data-away={hidden}
      aria-hidden={hidden}
      // Not focusable or clickable while it is faded or minimised.
      {...(hidden ? { inert: '' } : {})}
    >
      <div className="inset__bar">
        <button type="button" className="inset__btn inset__swap" onClick={onSwap} aria-label={`Show the ${shown.toLowerCase()} large`} title={`Show the ${shown.toLowerCase()} large`}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false">
            <path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="inset__btn inset__min" onClick={onMinimise} aria-label="Minimise the inset" title="Minimise the inset">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false">
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="inset__pic" style={{ aspectRatio: String(ratio) }}>
        {picture(inset, false)}
        {ghost && (
          <div
            key={ghost.n}
            className="inset__ghost"
            aria-hidden
            onAnimationEnd={() => setGhost(null)}
            style={SWAP_TIMING}
          >
            {picture(ghost.kind, true)}
          </div>
        )}
      </div>
    </div>
    {/* Minimised (VE-119): the inset shrinks to this icon in its own corner, so there is no switch elsewhere to hunt for. */}
    {minimised && (
      <button type="button" className="inset-restore" data-testid="inset-restore" onClick={onRestore} aria-label="Show the small inset" title="Show the small inset">
        <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden focusable="false">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <rect x="8.2" y="3.8" width="5" height="4" rx="0.8" fill="currentColor" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    )}
    </>
  )
}
