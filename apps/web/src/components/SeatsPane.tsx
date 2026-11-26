import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Seat } from '../derive/seats'
import type { GeoCollection, SeatHexStatic } from '../data/types'
import { css } from '../theme/theme'
import { BLUR_PX, EMPTY_STRIPE, HATCH_STRIPE, type SeatPaint } from '../derive/colour'
import { allDeclared, seatLabel } from '../views/encoding'
import { projectSvg, ringsById } from '../views/geometry'
import { useFx } from './Effects'
import { onFill } from './map/ink'
import { popStyle } from '../derive/focus'
import { hexLabel } from '../derive/hexLabel'
import type { Colour } from '../state/view'
import { HexLabel, type HexAnchor } from './HexLabel'
import { labelOn } from './explore/counted/label'

/** FB-147: the % counted printed on each hexagon, in screen pixels so it stays quiet at any zoom (12 px wide, 10 px on a phone, as the Counted lens). */
const NUM_PX = { wide: 12, narrow: 10 } as const
const NUM_HALO_PX = 2.2
const NARROW_PX = 700

interface Props {
  seatHexes: GeoCollection<SeatHexStatic>
  seats: Map<number, Seat>
  selected: number | null
  paints: Map<number, SeatPaint>
  certainty: boolean
  /** Number of the in-doubt pick on show (0 for none): the seats picked pop once when it starts (VE-105). */
  pop: number
  /** The colour story on show, for the hover label's figures. */
  colour: Colour
  onSelect: (id: number | null) => void
  /** A seat ringed from outside the stage (a Gains card hovered or focused, VE-156): drawn with the hover ring. */
  ring?: number | null
}

/**
 * The Hex shape: the 88-seat cartogram. The seats rail beside the stage is the table for keyboard and screen-reader
 * users (ADR 0008, ADR 0018).
 * Hex geometry is addressed by district_id and coloured by the shared encoding, so a later transition layer can
 * morph between this and the map.
 */
export function SeatsPane({ seatHexes, seats, paints, certainty, selected, pop, colour, onSelect, ring = null }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // Screen pixels per SVG unit, so a blur set in pixels (the map's) looks the same here. Read always: the Certainty blur and the Trust hatch both size in pixels.
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const read = () => {
      const k = svg.getScreenCTM()?.a
      if (k && Number.isFinite(k) && k > 0) setScale(k)
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  const hexes = useMemo(() => {
    const rings = ringsById(seatHexes)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const shapes = [...rings].map(([id, r]) => {
      const pts = r[0]!.map((p) => projectSvg(p))
      for (const [x, y] of pts) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
      // Centre and mean radius, for the declared tick.
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2
      const rad = pts.reduce((a, [x, y]) => a + Math.hypot(x - cx, y - cy), 0) / pts.length
      return { id, points: pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '), cx, cy, r: rad }
    })
    const pad = 3
    return { shapes, viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}` }
  }, [seatHexes])

  // The hover label (VE-107): mouse hover or keyboard focus only, never touch (a tap selects), and not while the Rewind
  // scrubber is being dragged. The anchor is the hexagon's box in the pane, so the label follows from hex to hex.
  const [tip, setTip] = useState<{ id: number; anchor: HexAnchor; colour: Colour; keyboard: boolean; bounds: { width: number; height: number } } | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  useEffect(() => {
    const isScrubber = (e: Event) => e.target instanceof Element && !!e.target.closest('.rewind input[type="range"]')
    const down = (e: Event) => {
      if (isScrubber(e)) { setScrubbing(true); setTip(null) }
    }
    const up = () => setScrubbing(false)
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [])
  const showTip = (id: number, el: Element, keyboard = false) => {
    const root = rootRef.current
    if (!root) return
    const r = el.getBoundingClientRect()
    const o = root.getBoundingClientRect()
    // Recomputed on every enter or focus, so a resize or layout move since the last hover never leaves a stale anchor.
    setTip({ id, colour, keyboard, bounds: { width: root.clientWidth, height: root.clientHeight }, anchor: { left: r.left - o.left, right: r.right - o.left, top: r.top - o.top, bottom: r.bottom - o.top } })
  }
  const tipSeat = tip ? seats.get(tip.id) : undefined

  const fx = useFx()
  const byId = useMemo(() => new Map(hexes.shapes.map((h) => [h.id, h])), [hexes])

  const onKey = (id: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(id)
    }
  }

  // Selected hex drawn last so its outline sits above its neighbours.
  // Gains (VE-156): the seats that changed hands come after the rest, so their heavier edge is never covered by a neighbour; the selected seat is last of all.
  // No ticks once every seat is declared (VE-166, FB-195); derived from the seats shown, so Rewind brings them back.
  const final = allDeclared(seats.values())
  const isGain = (id: number): boolean => paints.get(id)?.gain === true
  const plain = hexes.shapes.filter((h) => h.id !== selected && !isGain(h.id))
  const lifted = hexes.shapes.filter((h) => h.id !== selected && isGain(h.id))
  const ordered = [...plain, ...lifted, ...hexes.shapes.filter((h) => h.id === selected)]
  // Under Certainty each blur band is a group with its own filter, blurred bands first so the sharp seats sit on top.
  const groups: { band: 0 | 1 | 2; items: typeof ordered }[] = certainty
    ? ([0, 1, 2] as const).map((band) => ({ band, items: ordered.filter((h) => (paints.get(h.id)?.band ?? 2) === band) }))
    : [{ band: 2, items: ordered }]
  const hoverId = tip && !scrubbing ? tip.id : null
  const hoverShape = hoverId !== null && hoverId !== selected ? byId.get(hoverId) : undefined
  // A seat ringed from outside the stage (a card): a clear navy ring on a white halo, sized in screen pixels so it reads the same at any size (VE-177).
  const ringShape = ring !== null && ring !== selected ? byId.get(ring) : undefined
  const selShape = certainty && selected !== null ? hexes.shapes.find((h) => h.id === selected) : undefined

  return (
    <div className="seats" ref={rootRef}>
      <svg ref={svgRef} className="hexes" viewBox={hexes.viewBox} preserveAspectRatio="xMidYMid meet" role="group" aria-label="88 seats as hexagons" data-testid="seat-hexes">
        <defs>
          <pattern id="hex-hatch" width={7 / scale} height={7 / scale} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={7 / scale} stroke={HATCH_STRIPE} strokeWidth={1.5 / scale} />
          </pattern>
          <pattern id="hex-empty" width={7 / scale} height={7 / scale} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={7 / scale} stroke={EMPTY_STRIPE} strokeWidth={1.5 / scale} />
          </pattern>
          {/* Gains (VE-156): a soft lift under each seat that changed hands, sized in screen pixels like the blur. */}
          <filter id="hex-lift" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy={1 / scale} stdDeviation={1.5 / scale} floodColor="rgba(0, 0, 0, 0.35)" />
          </filter>
        </defs>
        {certainty && (
          <defs>
            {BLUR_PX.map((px, band) => px > 0 && (
              // The region is generous so the blur is not clipped to the group's box.
              <filter key={band} id={`hex-blur-${band}`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation={px / scale} />
              </filter>
            ))}
          </defs>
        )}
        {groups.map((g) => (
          <g key={g.band} data-band={certainty ? g.band : undefined} filter={certainty && BLUR_PX[g.band] > 0 ? `url(#hex-blur-${g.band})` : undefined}>
        {g.items.map((h) => {
          const s = seats.get(h.id)
          return (
            <Fragment key={h.id}>
            <polygon
              className={`hex${selected === h.id ? ' hex--sel' : ''}${isGain(h.id) ? ' hex--gain' : ''}${s?.state === 'won' ? ' hex--won' : ''}${s?.leader ? '' : ' hex--empty'}`}
              data-district={h.id}
              points={h.points}
              style={{ fill: css(paints.get(h.id)?.rgb ?? [255, 255, 255]) }}
              filter={isGain(h.id) ? 'url(#hex-lift)' : undefined}
              tabIndex={0}
              role="button"
              aria-pressed={selected === h.id}
              aria-label={s ? seatLabel(s) : String(h.id)}
              onClick={() => onSelect(h.id)}
              onKeyDown={onKey(h.id)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && showTip(h.id, e.currentTarget)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setTip(null)}
              onFocus={(e) => e.currentTarget.matches(':focus-visible') && showTip(h.id, e.currentTarget, true)}
              onBlur={() => setTip(null)}
            />
            {paints.get(h.id)?.empty && <polygon className="hex-empty" points={h.points} fill="url(#hex-empty)" pointerEvents="none" aria-hidden />}
            {paints.get(h.id)?.hatch && <polygon className="hex-hatch" points={h.points} fill="url(#hex-hatch)" pointerEvents="none" aria-hidden />}
            </Fragment>
          )
        })}
          </g>
        ))}
        {/* FB-147: % counted as a quiet number on each seat still being counted. A declared seat shows its tick instead
            (the tick sits at the centre, and "done" says more than a figure that stops short of 100). */}
        <g className="hex-nums" aria-hidden pointerEvents="none" data-testid="hex-nums">
          {hexes.shapes.map((h) => {
            const s = seats.get(h.id)
            const p = paints.get(h.id)
            // Gains (VE-167, review finding 10): no number at all. "48%" beside "Labor to Liberal" reads as a vote share or a swing, and a phone has no hover to say it is the share counted.
            if (!s || s.pct === null || s.state === 'won' || !p || colour === 'gains') return null
            const l = labelOn(p.rgb)
            const fs = NUM_PX[window.innerWidth < NARROW_PX ? 'narrow' : 'wide'] / scale
            return (
              <text key={h.id} className="hex-num" data-district={h.id} x={h.cx} y={h.cy} fontSize={fs} fill={css(l.ink)} stroke={css(l.halo)} strokeWidth={NUM_HALO_PX / scale}>
                {Math.round(s.pct)}%
              </text>
            )
          })}
        </g>
        {/* Update effects (VE-60): overlays above the seats, never taking the pointer. A declared seat's tick is state and
            stays (VE-75b: the dark outline is for the selected seat only); the rest mount only while a step's cue is
            active, keyed by the step so each restarts its animation. */}
        <g className="fx-hex" aria-hidden data-testid="hex-fx" data-seq={fx.seq}>
          {[...seats.values()].filter((s) => !final && s.state === 'won' && byId.has(s.id)).map((s) => {
            const h = byId.get(s.id)!
            const k = h.r * 0.5
            const rgb = paints.get(s.id)?.rgb ?? [255, 255, 255]
            return (
              <g key={`won-${s.id}`} data-fx="declared" data-district={s.id} transform={`translate(${h.cx.toFixed(2)} ${h.cy.toFixed(2)})`}>
                <path
                  className={`fx-tick${fx.active && fx.changes.get(s.id)?.declared ? ' fx-tick--new' : ''}`}
                  d={`M${(-k * 0.9).toFixed(2)} ${(k * 0.05).toFixed(2)} L${(-k * 0.25).toFixed(2)} ${(k * 0.7).toFixed(2)} L${(k * 0.95).toFixed(2)} ${(-k * 0.65).toFixed(2)}`}
                  style={{ stroke: onFill(rgb) }}
                />
              </g>
            )
          })}
          {fx.active && (
            <g key={fx.seq}>
              {[...fx.changes].map(([id, c]) => {
                const h = byId.get(id)
                if (!h) return null
                const now = css(paints.get(id)?.rgb ?? [255, 255, 255])
                // Reduced motion: the new colour and the "+n" chip say it; no outline (VE-93, the dark outline means "picked").
                if (fx.reduced) return null
                if (c.flipped) {
                  const old = fx.prevRgb.get(id)
                  return (
                    <g key={id} data-fx="flip" data-district={id}>
                      {old && <polygon className="fx-wipe" points={h.points} style={{ fill: css(old) }} />}
                      <polygon className="fx-halo" points={h.points} style={{ stroke: now }} />
                    </g>
                  )
                }
                return c.counted ? <polygon key={id} className="fx-tint" data-fx="count" data-district={id} points={h.points} /> : null
              })}
            </g>
          )}
        </g>
        {/* The seats picked in the tally (ADR 0023): a thin dark outline above the fills, sharp even under Certainty's blur. */}
        <g className="hex-picks" aria-hidden>
          {hexes.shapes.filter((h) => paints.get(h.id)?.lit).map((h, i) => (
            // A fresh in-doubt pick (pop is its number) rings each seat once, a few tens of ms apart; the key restarts it.
            <polygon
              key={`${h.id}-${pop}`}
              className={pop > 0 ? 'hex-pick pick-pop' : 'hex-pick'}
              data-district={h.id}
              points={h.points}
              style={pop > 0 ? popStyle(i, 1.18) : undefined}
            />
          ))}
        </g>
        {/* The selection outline stays sharp even when its seat is blurred. */}
        {selShape && <polygon className="hex-outline" points={selShape.points} fill="none" pointerEvents="none" aria-hidden />}
        {/* Hover (VE-120): the same ring as the Map, drawn last so no neighbour covers it; not on the selected seat, which has its own outline. */}
        {hoverShape && <polygon className="hover-ring hex-hover" points={hoverShape.points} pointerEvents="none" aria-hidden />}
        {ringShape && (
          <g className="hex-ring" pointerEvents="none" aria-hidden>
            {/* Never thinner than VE-165's 3.5 (the selected seat's edge, on desktop), and at least 2.5 px on a small phone. */}
            <polygon points={ringShape.points} fill="none" stroke="#fff" strokeWidth={Math.max(2.5 / scale, 3.5) + 2.5 / scale} strokeLinejoin="round" />
            <polygon className="hex-hover" points={ringShape.points} fill="none" stroke="var(--color-navy)" strokeWidth={Math.max(2.5 / scale, 3.5)} strokeLinejoin="round" style={{ filter: 'none' }} />
          </g>
        )}
      </svg>
      {tip && tipSeat && !scrubbing && (
        <HexLabel text={hexLabel(tipSeat, colour, seatHexes.features.find((f) => f.properties.district_id === tip.id)?.properties)} anchor={tip.anchor} bounds={tip.bounds} keyboard={tip.keyboard} />
      )}
    </div>
  )
}
