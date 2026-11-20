import { isFinal } from '../../../derive/turnout'
import { LensNotice } from '../LensNotice'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { OUTRIGHT_PCT, X_HI, X_LO, packRow, prefsPoints, regionRows, shortRegion, xFor, type PrefsPoint } from '../../../derive/prefs'
import { partyName } from '../../../derive/seats'
import { css, usePalette } from '../../../theme/theme'
import { InfoButton } from '../../InfoButton'
import { hexView, mapView, useSize } from '../stageGeom'
import { loadTier, type Tier } from '../../map/tiers'
import { Shape } from '../Shape'
import { LensBar } from '../LensBar'
import type { LensProps } from '../lenses'
import type { ExploreMode } from '../../../state/view'
import { partyKey, regionTitle } from './regions'
import '../../../styles/prefs.css'

const NARROW_PX = 600
const TICKS = [20, 30, 40, 50, 60, 70, 80] as const
/** A seat's name waits this long on a mouse hover, as in the other lenses, so sweeping across the chart stays calm. */
const HOVER_MS = 200
/** The locator's Map and Hex toggle: the same words and behaviour as the stage's (LensBar). */
const MODES: readonly { mode: ExploreMode; label: string }[] = [
  { mode: 'map', label: 'Map' },
  { mode: 'hex', label: 'Hex' },
]
const HEAD_H = 26
const AXIS_H = 26

/** The pill words, shared by the pill and each dot's accessible name. */
const sentence = (p: PrefsPoint) => `${p.name}: ${partyName(p.party)} ${Math.round(p.pct)}% of first preferences`

/**
 * Which seats will preferences decide? (VE-99, prototype variant B by region.) Every seat with figures is a dot on its
 * region's line, placed by the first-preference leader's share and coloured by that party. Left of 50% nobody has won
 * outright. The dark ring only ever means the seat you picked (ADR 0023).
 *
 * Keyboard: Tab enters the chart on one dot (roving focus, so 88 dots are one tab stop); Left and Right move along a
 * region, Up and Down move to the nearest dot in the next region; Enter or Space holds the seat's pill. Focusing a dot
 * also shows its pill, and each dot carries the same sentence as its accessible name.
 */
export default function PrefsLens({ seats, statics, title, mode, onMode }: LensProps) {
  const pal = usePalette()
  const [stageRef, size] = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [sticky, setSticky] = useState<number | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  // Region links: a row and its place on the locator light together (hover on desktop, tap on a phone).
  const [hoverRegion, setHoverRegion] = useState<string | null>(null)
  const [stickyRegion, setStickyRegion] = useState<string | null>(null)
  const delay = useRef<number | undefined>(undefined)
  const [tabStop, setTabStop] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // The coarse Victoria outlines for the locator's Map view; fetched only if the reader asks for the map.
  const [tier, setTier] = useState<Tier | null>(null)
  const locMode: ExploreMode = mode === 'map' ? 'map' : 'hex'
  useEffect(() => {
    if (locMode !== 'map' || tier) return
    let alive = true
    loadTier(0).then((t) => alive && setTier(t), () => undefined)
    return () => {
      alive = false
    }
  }, [locMode, tier])

  useEffect(() => () => window.clearTimeout(delay.current), [])
  const result = useMemo(() => prefsPoints(seats, statics.districtById), [seats, statics])
  const narrow = size.w > 0 && size.w < NARROW_PX
  const W = Math.max(size.w, 240)
  const r = narrow ? 4.4 : 5.2
  const padL = narrow ? 10 : 164
  const padR = 14
  const labelH = narrow ? 18 : 0

  const layout = useMemo(() => {
    const rows = regionRows(result.points).map((row) => {
      const xs = row.points.map((p) => ({ id: p.id, x: xFor(p.pct, W, padL, padR) }))
      const offs = packRow(xs, r)
      const maxOff = Math.max(0, ...[...offs.values()].map(Math.abs))
      const h = labelH + Math.max(34, 2 * maxOff + 2 * r + 12)
      return { region: row.region, h, offs, points: row.points }
    })
    return rows.map((row, i) => {
      const top = HEAD_H + rows.slice(0, i).reduce((sum, q) => sum + q.h, 0)
      const cy = top + labelH + (row.h - labelH) / 2
      const dots = row.points
        .map((p) => ({ p, x: xFor(p.pct, W, padL, padR), y: cy + (row.offs.get(p.id) ?? 0) }))
        .sort((a, b) => a.x - b.x || a.p.id - b.p.id)
      return { region: row.region, top, h: row.h, cy, dots }
    })
  }, [result.points, W, padL, labelH, r])
  const last = layout[layout.length - 1]
  const totalH = (last ? last.top + last.h : HEAD_H) + AXIS_H
  const x50 = xFor(OUTRIGHT_PCT, W, padL, padR)

  const active = hover ?? sticky ?? focused
  const byId = useMemo(() => new Map(result.points.map((p) => [p.id, p])), [result.points])
  const activeP = active === null ? null : byId.get(active) ?? null
  const firstId = layout[0]?.dots[0]?.p.id ?? null
  const stop = tabStop !== null && byId.has(tabStop) ? tabStop : firstId

  const idOf = (t: EventTarget | null): number | null => {
    const el = t instanceof Element ? t.closest<SVGElement>('[data-id]') : null
    return el ? Number(el.dataset.id) : null
  }
  const regionOf = (t: EventTarget | null): string | null => {
    const el = t instanceof Element ? t.closest<SVGElement>('[data-region]') : null
    return el?.dataset.region ?? null
  }
  const setHoverSoon = (id: number | null) => {
    window.clearTimeout(delay.current)
    if (id === null) setHover(null)
    else delay.current = window.setTimeout(() => setHover(id), HOVER_MS)
  }
  const onOver = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    setHoverSoon(idOf(e.target))
    setHoverRegion(regionOf(e.target))
  }
  const onOut = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    setHoverSoon(idOf(e.relatedTarget))
    setHoverRegion(regionOf(e.relatedTarget))
  }
  const onTap = (e: MouseEvent) => {
    const id = idOf(e.target)
    const region = regionOf(e.target)
    if (id === null) {
      setSticky(null)
      // A tap on a row (or a region of the locator) holds that region lit; a second tap lets go.
      setStickyRegion((r) => (region === null || r === region ? null : region))
      return
    }
    setSticky((s) => (s === id ? null : id))
    setStickyRegion(region)
    setHover(null)
  }
  const goto = (id: number) => svgRef.current?.querySelector<SVGElement>(`[data-id="${id}"]`)?.focus()
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const id = idOf(e.target)
    if (id === null) return
    const ri = layout.findIndex((row) => row.dots.some((d) => d.p.id === id))
    if (ri < 0) return
    const row = layout[ri]!
    const di = row.dots.findIndex((d) => d.p.id === id)
    let next: number | undefined
    if (e.key === 'ArrowRight') next = row.dots[di + 1]?.p.id
    else if (e.key === 'ArrowLeft') next = row.dots[di - 1]?.p.id
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const other = layout[ri + (e.key === 'ArrowDown' ? 1 : -1)]
      const x = row.dots[di]!.x
      next = other?.dots.reduce((best, d) => (Math.abs(d.x - x) < Math.abs(best.x - x) ? d : best), other.dots[0]!)?.p.id
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setSticky((s) => (s === id ? null : id))
      return
    } else return
    e.preventDefault()
    if (next !== undefined) goto(next)
  }

  const missing = result.missing
  // VE-167: at Final nothing is waiting, so the count of seats not yet counted is not said.
  const final = isFinal(seats.values())
  // The region on show: under the pointer, else the picked seat's, else the one held by a tap.
  const activeRegion = hoverRegion ?? (activeP ? shortRegion(activeP.region) : null) ?? stickyRegion
  const key = useMemo(() => partyKey(result.points), [result.points])
  // The locator is the hex layout the app already ships, one hex a seat, lit by region.
  const loc = useMemo(() => {
    const v = locMode === 'map' && tier ? mapView(tier, statics, false) : hexView(statics)
    return { vb: v.vb, items: v.items.map((it) => ({ id: it.id, geom: it.geom, region: shortRegion(statics.districtById.get(it.id)?.region_name ?? 'Other') })) }
  }, [statics, locMode, tier])
  const seatOn = active === null ? null : loc.items.find((it) => it.id === active) ?? null
  return (
    <div className="arrows prefs" data-testid="prefs-lens">
      <LensBar
        title={title}
        modes={MODES}
        mode={locMode}
        onMode={onMode}
        info={
          <InfoButton label="About preferences" align="right">
            <p>First preferences are the votes for each candidate before preferences move. A seat is won once someone has more than half after preferences. Under 50%, preferences decide.</p>
            <p>Rows group seats by area. Point at a row, or a patch of the small map, to see the other.</p>
            <LensNotice seats={seats} />

          </InfoButton>
        }
      >
        <p className="arrows__caption" data-testid="prefs-count">
          {final
            ? `${result.decidedCount} ${result.decidedCount === 1 ? 'seat' : 'seats'}: no one had 50% of first preferences.`
            : `${result.decidedCount} ${result.decidedCount === 1 ? 'seat' : 'seats'} short of 50%.`}{missing > 0 && !final ? ` ${missing} not counted yet.` : ''}
        </p>
      </LensBar>

      <div className="prefs__body">
      <svg className="prefs__loc" viewBox={loc.vb.join(' ')} role="img" data-mode={locMode} aria-label={locMode === 'map' ? 'Where each region is, on the map of Victoria' : 'Where each region is, one hex for each seat'} data-testid="prefs-loc" onPointerOver={onOver} onPointerOut={onOut} onClick={onTap}>
        {loc.items.map((it) => (
          <Shape key={it.id} mode={locMode} it={{ id: it.id, geom: it.geom, cx: 0, cy: 0, box: { x0: 0, y0: 0, x1: 0, y1: 0 } }} className={'prefs__hex' + (it.region === activeRegion ? ' prefs__hex--on' : '')} data-id={it.id} data-region={it.region} data-testid="prefs-hex" />
        ))}
        {/* VE-230: the seat itself, drawn after the rest so its outline sits above its neighbours. */}
        {seatOn && <Shape mode={locMode} it={{ id: seatOn.id, geom: seatOn.geom, cx: 0, cy: 0, box: { x0: 0, y0: 0, x1: 0, y1: 0 } }} className="prefs__seat" fill={activeP ? css(pal.party[activeP.party]) : "none"} data-testid="prefs-seat" />}
      </svg>
      <div className="prefs__main">
      <ul className="prefs__key" aria-label="Leading party" data-testid="prefs-key">
        {key.map((k) => (
          <li key={k.party}><i style={{ background: css(pal.party[k.party]) }} />{partyName(k.party)}</li>
        ))}
      </ul>
      <div className="arrows__stage" ref={stageRef} onPointerOver={onOver} onPointerOut={onOut} onClick={onTap}>
        <div className="prefs__scroll">
          {size.w > 0 && (
            <svg ref={svgRef} className="prefs__svg" width={W} height={totalH} viewBox={`0 0 ${W} ${totalH}`} role="group" aria-label="Seats by first-preference share, one row for each region. Tab to a dot, then use the arrow keys." onKeyDown={onKey}>
              <line className="prefs__line" x1={x50} x2={x50} y1={HEAD_H - 6} y2={totalH - AXIS_H} />
              <text className="prefs__tag" x={x50 - 6} y={12} textAnchor="end">Preferences decide</text>
              <text className="prefs__tag prefs__tag--line" x={x50 + 6} y={12} textAnchor="start">50%: wins outright</text>
              {layout.map((row) => (
                <g key={row.region} data-region={shortRegion(row.region)} data-testid="prefs-row" data-lit={shortRegion(row.region) === activeRegion}>
                  <rect className={'prefs__band' + (shortRegion(row.region) === activeRegion ? ' prefs__band--on' : '')} x={0} y={row.top} width={W} height={row.h} />
                  <text className="prefs__region" x={narrow ? padL : 4} y={narrow ? row.top + 13 : row.cy} dominantBaseline={narrow ? undefined : 'middle'}>
                    {regionTitle(row.region)}
                  </text>
                  <line className="prefs__rule" x1={padL} x2={W - padR} y1={row.top + row.h} y2={row.top + row.h} />
                  {row.dots.map(({ p, x, y }) => (
                    <g key={p.id} className="prefs__dot" data-id={p.id} data-testid="prefs-dot" data-decided={p.decided} data-party={p.party} role="button" tabIndex={p.id === stop ? 0 : -1} aria-label={sentence(p)} onFocus={() => { setFocused(p.id); setTabStop(p.id) }} onBlur={() => setFocused((f) => (f === p.id ? null : f))}>
                      <circle cx={x} cy={y} r={r + 3} fill="transparent" />
                      <circle className="prefs__d" cx={x} cy={y} r={r} fill={css(pal.party[p.party])} />
                      {p.id === active && <circle className="prefs__pick" cx={x} cy={y} r={r + 2.5} fill="none" stroke={css(pal.selected)} />}
                    </g>
                  ))}
                </g>
              ))}
              {TICKS.filter((t) => t >= X_LO && t <= X_HI).map((t) => {
                const x = xFor(t, W, padL, padR)
                // A label centred this close to an edge would clip ("20%" on a phone): hang it inward instead.
                return <text key={t} className="prefs__tick" x={x} y={totalH - 8} textAnchor={x < 18 ? 'start' : x > W - 18 ? 'end' : 'middle'}>{t}%</text>
              })}
            </svg>
          )}
        </div>
        {activeP && (
          <div className="arrows__pill" role="status" data-testid="prefs-pill">
            {sentence(activeP)}.{sticky !== null && hover === null && sticky === activeP.id ? ' Tap again to clear.' : ''}
          </div>
        )}
      </div>
      </div>
      </div>
    </div>
  )
}
