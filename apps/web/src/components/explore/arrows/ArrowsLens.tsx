import { isFinal } from '../../../derive/turnout'
import { useEffect, useMemo, useState, type PointerEvent } from 'react'
import { arrowLength, captionCounts, captionOf, classifySeat, rankedArrows, type Mark } from '../../../derive/arrows'
import { SWING_MIN_PCT } from '../../../derive/colour'
import type { ExploreMode } from '../../../state/view'
import { css, usePalette, type Palette, type Rgb } from '../../../theme/theme'
import { StageInfo } from '../../info/StageInfo'
import { loadTier, type Tier } from '../../map/tiers'
import type { LensProps } from '../lenses'
import { LensBar } from '../LensBar'
import { Shape } from '../Shape'
import { hexView, mapView, useSize } from '../stageGeom'
import { biggestMover, fpMovers, type Mover } from '../../lenspanel/swing'
import { ArrowsDiagram } from './ArrowsExplain'
import { buildReadout, type Readout } from './readout'
import { partyCss } from '../../../views/encoding'
import { useFp2022 } from './fp2022'
import { pointsAttr, taperArrow, type Taper } from './taper'

const MODES: readonly { mode: ExploreMode; label: string }[] = [
  { mode: 'map', label: 'Map' },
  { mode: 'hex', label: 'Hex' },
  { mode: 'strip', label: 'Ranked' },
]
/** Pixels per point of swing, picked so a 5-point swing is about a seat wide (Hex) or a country seat wide (Map). */
const PX_PER_PT = { map: { wide: 12, narrow: 7 }, hex: { wide: 10, narrow: 5.5 } } as const
const NARROW_PX = 700

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as Rgb


function ArrowShape({ len, toward, halo }: { len: number; toward: 'ALP' | 'COA'; halo: string }) {
  return <ArrowDraw t={taperArrow(len, toward === 'ALP' ? -1 : 1, true)} ink={`var(${toward === 'ALP' ? '--party-alp' : '--party-lib'})`} halo={halo} />
}

/** The ABC-shaped arrow (thin tail, bold head) in ink on a paper-coloured halo, so it holds on any seat colour (colour review, 5 Nov). */
function ArrowDraw({ t, ink, halo }: { t: Taper; ink: string; halo: string }) {
  const pts = pointsAttr(t)
  return (
    <g>
      <polygon points={pts} fill={halo} stroke={halo} strokeWidth="3" strokeLinejoin="round" opacity="0.92" />
      <polygon points={pts} fill={ink} />
    </g>
  )
}

/**
 * The biggest first-preference mover in a seat that is not Labor v Coalition (VE-130): a party-coloured triangle, up for a
 * gain and down for a loss, taller with the points. A triangle, not an arrow, so it never reads as a two-candidate swing.
 */
function MoverMark({ mover, halo, pal }: { mover: Mover; halo: string; pal: Palette }) {
  const h = Math.min(24, Math.max(7, 6 + Math.abs(mover.change) * 1.8))
  const w = h * 0.95
  const up = mover.change >= 0
  const pts = up ? `0,${-h / 2} ${w / 2},${h / 2} ${-w / 2},${h / 2}` : `0,${h / 2} ${w / 2},${-h / 2} ${-w / 2},${-h / 2}`
  return (
    <g>
      <polygon points={pts} fill={halo} stroke={halo} strokeWidth="3" strokeLinejoin="round" opacity="0.92" />
      <polygon points={pts} fill={partyCss(mover.party, pal)} />
    </g>
  )
}

function Dot({ kind }: { kind: 'early' | 'other' | 'flat' | 'changed' }) {
  // VE-285: a diamond for a Labor v Coalition seat whose 2022 pair differed, so it reads apart from the round dot of another contest.
  if (kind === 'changed') return <rect x="-2.4" y="-2.4" width="4.8" height="4.8" transform="rotate(45)" fill="var(--color-text-subtle)" stroke="var(--map-paper)" strokeWidth="0.8" />
  if (kind === 'flat') return <path d="M-4 0H4" stroke="var(--color-text-subtle)" strokeWidth="2.4" strokeLinecap="round" />
  return kind === 'early' ? (
    <circle r="2.8" fill="var(--map-paper)" stroke="var(--color-text-subtle)" strokeWidth="1.2" />
  ) : (
    <circle r="2.2" fill="var(--color-text-subtle)" stroke="var(--map-paper)" strokeWidth="0.8" />
  )
}

/**
 * Swing arrows (FB-109, FB-110): which way each seat moved since the last election, toward Labor or toward the Coalition.
 * One lens, three ways to draw it: the Map, the Hex, and a ranked strip. The rules are in derive/arrows.ts.
 */
export default function ArrowsLens({ seats, statics, mode, title, onMode }: LensProps) {
  const pal = usePalette()
  const [stageRef, size] = useSize<HTMLDivElement>()
  const [tier, setTier] = useState<Tier | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [sticky, setSticky] = useState<number | null>(null)
  const narrow = size.w > 0 && size.w < NARROW_PX

  useEffect(() => {
    let alive = true
    loadTier(window.innerWidth < NARROW_PX ? 0 : 1).then((t) => alive && setTier(t), () => undefined)
    return () => {
      alive = false
    }
  }, [])

  const marks = useMemo(() => new Map<number, Mark>([...seats.values()].map((s) => [s.id, classifySeat(s, statics.districtById.get(s.id))])), [seats, statics])
  const view = useMemo(() => (mode === 'hex' ? hexView(statics) : mode === 'map' && tier ? mapView(tier, statics, false) : null), [mode, tier, statics])
  const final = useMemo(() => isFinal(seats.values()), [seats])
  const caption = useMemo(() => captionOf(marks.values(), final), [marks, final])
  const counts = useMemo(() => captionCounts(marks.values()), [marks])
  // The 2022 first preferences load with the lens; the biggest mover marks the seats that are not Labor v Coalition.
  const ids = useMemo(() => new Set(statics.districtById.keys()), [statics])
  const fp = useFp2022(ids)
  const movers = useMemo(() => new Map([...marks.values()].flatMap((m) => (m.kind === 'other' ? [[m.seat.id, fpMovers(m.seat, fp?.get(m.seat.id))] as const] : []))), [marks, fp])
  const anyMover = [...movers.values()].some((v) => v.length > 0)

  const active = hover ?? sticky
  const activeMark = active === null ? null : marks.get(active) ?? null
  const paper = css(pal.paper)
  const neutral = css(mix(pal.noResult, pal.paper, 0.55))
  const idOf = (t: EventTarget | null): number | null => {
    const el = t instanceof Element ? t.closest<SVGElement>('[data-id]') : null
    return el ? Number(el.dataset.id) : null
  }
  const onOver = (e: PointerEvent) => e.pointerType === 'mouse' && setHover(idOf(e.target))
  const onOut = (e: PointerEvent) => e.pointerType === 'mouse' && setHover(idOf(e.relatedTarget))
  const onTap = (e: React.MouseEvent) => {
    const id = idOf(e.target)
    if (id === null) {
      setSticky(null)
      return
    }
    setSticky((s) => (s === id ? null : id))
    setHover(null)
  }

  // Arrows are drawn in screen pixels, so each sits at its seat's centre under a scale that undoes the viewBox zoom.
  const ppu = view && size.w > 0 && size.h > 0 ? Math.min(size.w / view.vb[2], size.h / view.vb[3]) : 1
  const ppp = PX_PER_PT[mode === 'hex' ? 'hex' : 'map'][narrow ? 'narrow' : 'wide']

  return (
    <div className="arrows" data-mode={mode}>
      <LensBar
        title={title}
        modes={MODES}
        mode={mode}
        onMode={onMode}
        info={
          <StageInfo label="About the swing arrows">
            <ArrowsDiagram />
            {/* VE-308 (pick S1): the picture carries the meaning; one line under it. */}
            <p>Longer arrow, bigger swing. Tap a seat for every party&apos;s change. Marks show from {SWING_MIN_PCT}% counted.</p>
          </StageInfo>
        }
      >
        <p className="arrows__caption" data-testid="arrows-caption">{caption}</p>
      </LensBar>

      <div className="arrows__stage" ref={stageRef} onPointerOver={onOver} onPointerOut={onOut} onClick={onTap}>
        {mode === 'strip' ? (
          <Strip marks={marks} width={size.w} paper={paper} active={active} />
        ) : view ? (
          <svg className="arrows__svg" viewBox={view.vb.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Swing arrows on the ${mode === 'hex' ? 'hexagons' : 'map'} of the 88 districts. The seats list has the same figures.`}>
            <g>
              {view.items.map((it) => (
                <Shape key={it.id} mode={mode} it={it} className="arrows__seat" fill={neutral} stroke={css(pal.edge)} />
              ))}
            </g>
            <g>
              {view.items.map((it) => {
                const m = marks.get(it.id)
                if (!m || m.kind === 'notin') return null
                // VE-226 (finding 8): a party new to the seat is not a change, so it gets no triangle.
                const mover = m.kind === 'other' ? biggestMover(movers.get(it.id)) : undefined
                return (
                  <g key={it.id} transform={`translate(${it.cx} ${it.cy}) scale(${1 / ppu})`} pointerEvents="none" data-mark={mover ? 'mover' : m.kind}>
                    {m.kind === 'arrow' ? <ArrowShape len={arrowLength(m.pts, ppp)} toward={m.toward} halo={paper} /> : mover ? <MoverMark mover={mover} halo={paper} pal={pal} /> : <Dot kind={m.kind} />}
                  </g>
                )
              })}
            </g>
            {active !== null && view.items.filter((it) => it.id === active).map((it) => (
              <Shape key="pick" mode={mode} it={it} className="arrows__pick" fill="none" stroke={css(pal.selected)} />
            ))}
            <g>
              {view.items.map((it) => (
                <Shape key={it.id} mode={mode} it={it} className="arrows__hit" data-id={it.id} fill="transparent" stroke="none" />
              ))}
            </g>
          </svg>
        ) : (
          <p className="explore-lens__loading" role="status">Loading...</p>
        )}
        {active !== null && activeMark && (
          <div className="arrows__pill arrows__card" role="status" data-testid="arrows-pill">
            <Card r={buildReadout(activeMark, fp?.get(activeMark.seat.id))} pal={pal} />
          </div>
        )}
      </div>

      <ul className="arrows__legend" aria-label="Key">
        <li>
          <svg width="34" height="18" viewBox="0 0 34 18" aria-hidden focusable="false">
            <g transform="translate(29 14)"><ArrowShape len={5 * 4.5} toward="ALP" halo={paper} /></g>
          </svg>
          Toward Labor
        </li>
        <li>
          <svg width="34" height="18" viewBox="0 0 34 18" aria-hidden focusable="false">
            <g transform="translate(5 14)"><ArrowShape len={5 * 4.5} toward="COA" halo={paper} /></g>
          </svg>
          Toward the Coalition
        </li>
        {anyMover && (
          <li data-testid="arrows-legend-mover">
            <svg width="24" height="14" viewBox="0 -7 24 14" aria-hidden focusable="false">
              <polygon points="6,-5 11,4 1,4" fill="var(--color-text-subtle)" />
              <polygon points="18,4 23,-5 13,-5" fill="var(--color-text-subtle)" />
            </svg>
            Biggest vote change
          </li>
        )}
        {/* VE-153: once every seat has enough counted, nothing is "too early", so the key drops it. */}
        {counts.all > counts.ready && (
          <li>
            <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden focusable="false"><Dot kind="early" /></svg>
            Too early
          </li>
        )}
        <li>
          <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden focusable="false"><Dot kind="other" /></svg>
          Not Labor v Coalition
        </li>
        {[...marks.values()].some((m) => m.kind === 'changed') && (
          <li data-testid="arrows-legend-changed">
            <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden focusable="false"><Dot kind="changed" /></svg>
            Different contest from 2022
          </li>
        )}
      </ul>
    </div>
  )
}


/**
 * VE-274: the seat readout. A heading line (seat and pair), then one row per party with its colour, the change as a signed
 * number and a small bar from the centre line (left down, right up). The row the map's triangle stands for carries the
 * triangle itself, so the triangle's party and change can be read straight off.
 */
function Card({ r, pal }: { r: Readout; pal: Palette }) {
  return (
    <>
      <div className="arrows__card-head">
        <b>{r.name}</b>
        {r.pair && <span>{r.pair}</span>}
      </div>
      {r.rows.length > 0 && (
        <ul className="arrows__card-rows" data-testid="arrows-pill-fp" aria-label={`First preference change since ${r.since}`}>
          {r.rows.map((row) => {
            const ink = row.party ? partyCss(row.party, pal) : 'var(--color-text-subtle)'
            return (
              <li key={row.party ?? 'others'} data-mover={row.mover || undefined}>
                <svg className="arrows__card-mark" width="12" height="12" viewBox="-6 -6 12 12" aria-hidden focusable="false">
                  {row.mover ? <polygon points={row.bar >= 0 ? '0,-5 5,4 -5,4' : '0,5 5,-4 -5,-4'} fill={ink} /> : <rect x="-4" y="-4" width="8" height="8" rx="2" fill={ink} />}
                </svg>
                <span className="arrows__card-name">{row.name}</span>
                <span className="arrows__card-chg" data-fresh={row.fresh || undefined}>{row.text}</span>
                <span className="arrows__card-bar" aria-hidden>
                  <i style={{ background: ink, [row.bar < 0 ? 'right' : 'left']: '50%', width: `${Math.abs(row.bar) * 50}%` }} />
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {r.swing && (
        <div className="arrows__card-swing" data-toward={r.swing.toward}>
          <svg width="30" height="12" viewBox="0 -6 30 12" aria-hidden focusable="false"><g transform={`translate(${r.swing.toward === 'ALP' ? 28 : 2} 0)`}><ArrowDraw t={taperArrow(24, r.swing.toward === 'ALP' ? -1 : 1, false)} ink={`var(${r.swing.toward === 'ALP' ? '--party-alp' : '--party-lib'})`} halo="var(--color-surface)" /></g></svg>
          <b>{r.swing.pts} pts</b> {r.swing.words}
        </div>
      )}
      {r.note && <div className="arrows__card-note">{r.note}</div>}
      <small className="arrows__card-foot">{r.counted}</small>
    </>
  )
}

/** Seats ranked by swing: the most toward Labor at the top, the most toward the Coalition at the bottom. */
function Strip({ marks, width, paper, active }: { marks: Map<number, Mark>; width: number; paper: string; active: number | null }) {
  const rows = useMemo(() => rankedArrows(marks.values()), [marks])
  const W = Math.min(760, Math.max(300, width))
  const top = 46
  const rh = 15
  const H = top + Math.max(rows.length, 1) * rh + 10
  const mid = W / 2
  const maxAbs = rows.reduce((a, r) => Math.max(a, Math.abs(r.pts)), 0)
  const need = Math.min(10, Math.max(2, Math.ceil(maxAbs)))
  const step = need <= 4 ? 1 : 2
  // The axis runs out from 0 in whole steps, so its labels are 2, 4, 6 and never 1, 3, 5.
  const R = Math.ceil(need / step) * step
  const ppp = (W / 2 - 14) / R
  const ticks: number[] = []
  for (let p = -R; p <= R; p += step) ticks.push(p)
  return (
    <div className="arrows__strip">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Seats ranked by swing since the last election">
        {ticks.map((p) => (
          <g key={p}>
            <line x1={mid + p * ppp} x2={mid + p * ppp} y1={top - 4} y2={H - 6} stroke={p === 0 ? 'var(--color-text)' : 'var(--color-border-strong)'} strokeWidth={p === 0 ? 1.5 : 1} />
            {p !== 0 && <text x={mid + p * ppp} y={top - 8} textAnchor="middle" fontSize="10" fill="var(--color-text-subtle)">{Math.abs(p)}</text>}
          </g>
        ))}
        <text x="4" y="14" fontSize="12.5" fontWeight="700" fill="var(--party-alp)">Toward Labor</text>
        <text x={W - 4} y="14" textAnchor="end" fontSize="12.5" fontWeight="700" fill="var(--party-lib)">Toward the Coalition</text>
        <text x={mid} y="30" textAnchor="middle" fontSize="10.5" fill="var(--color-text-subtle)">points since the last election</text>
        {rows.length === 0 && (
          <text x={mid} y={top + 30} textAnchor="middle" fontSize="12.5" fill="var(--color-text-subtle)">No seat is counted enough to show yet.</text>
        )}
        {rows.map((m, i) => {
          const y = top + i * rh + rh / 2
          const len = Math.max(3, Math.min(Math.abs(m.pts), R) * ppp)
          const t = taperArrow(len, m.toward === 'ALP' ? -1 : 1, false)
          return (
            <g key={m.seat.id} className="arrows__row" data-id={m.seat.id} data-active={active === m.seat.id}>
              <rect className="arrows__hit" x="0" y={y - rh / 2} width={W} height={rh} fill="transparent" />
              <g transform={`translate(${mid} ${y})`} pointerEvents="none">
                <ArrowDraw t={t} ink={`var(${m.toward === 'ALP' ? '--party-alp' : '--party-lib'})`} halo={paper} />
              </g>
              <text x={mid + (m.toward === 'ALP' ? 6 : -6)} y={y + 3.5} textAnchor={m.toward === 'ALP' ? 'start' : 'end'} fontSize="10.5" fill="var(--color-text)" pointerEvents="none">
                {m.seat.name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
