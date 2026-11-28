import { useEffect, useMemo, useState, type PointerEvent } from 'react'
import { COUNTED_ALPHA, countedRgb, countedScale, countedStep } from '../../../derive/colour'
import type { ExploreMode } from '../../../state/view'
import { css, usePalette } from '../../../theme/theme'
import { StageInfo } from '../../info/StageInfo'
import { loadTier, type Tier } from '../../map/tiers'
import type { LensProps } from '../lenses'
import { LensBar } from '../LensBar'
import { Shape } from '../Shape'
import { countedLabel } from './label'
import { bandLabel } from '../../lenspanel/counted'
import { countedWord, isFinal } from '../../../derive/turnout'
import { hexView, mapView, useSize, type View } from '../stageGeom'

/** Map and Hex only: a ranked strip adds nothing to "how much is counted". */
const MODES: readonly { mode: ExploreMode; label: string }[] = [
  { mode: 'map', label: 'Map' },
  { mode: 'hex', label: 'Hex' },
]
const NARROW_PX = 700
/** Hex only: a figure fits a hexagon, and the Map's small Melbourne seats would not hold one. */
const LABEL_PX = { wide: 12, narrow: 10 } as const
const HALO_PX = 2.2


/**
 * How much of each seat is counted (VE-104, moved here from the colour chips). One neutral ink in four steps, so
 * colour strength means only "more counted" and never "firmer"; party colour belongs to Leader. Counted is ballots
 * counted out of enrolled voters, so a finished seat stops short of 100%.
 */
export default function CountedLens({ seats, statics, mode, title, onMode }: LensProps) {
  const pal = usePalette()
  const [stageRef, size] = useSize<HTMLDivElement>()
  const [tier, setTier] = useState<Tier | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [sticky, setSticky] = useState<number | null>(null)
  const shown: ExploreMode = mode === 'hex' ? 'hex' : 'map'

  useEffect(() => {
    let alive = true
    loadTier(window.innerWidth < NARROW_PX ? 0 : 1).then((t) => alive && setTier(t), () => undefined)
    return () => {
      alive = false
    }
  }, [])

  const view: View | null = useMemo(() => (shown === 'hex' ? hexView(statics) : tier ? mapView(tier, statics, false) : null), [shown, tier, statics])
  const active = hover ?? sticky
  // Labels are sized in screen pixels, so they stay quiet whatever the viewBox zoom.
  const ppu = view && size.w > 0 && size.h > 0 ? Math.min(size.w / view.vb[2], size.h / view.vb[3]) : 1
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
  const final = isFinal(seats.values())
  // VE-170: at Final the four steps spread over the turnout the seats really have; before it they are 25, 50, 75.
  const scale = useMemo(() => countedScale([...seats.values()].map((s) => s.pct), final), [seats, final])
  // A percentage inside each step, to draw its swatch with the same function as the seats.
  const swatchPct = [scale.cuts[0] - 1, (scale.cuts[0] + scale.cuts[1]) / 2, (scale.cuts[1] + scale.cuts[2]) / 2, scale.cuts[2] + 1]
  const activeSeat = active === null ? null : seats.get(active) ?? null
  const pill = activeSeat ? (activeSeat.pct === null ? `${activeSeat.name}: nothing counted yet.` : `${activeSeat.name}: ${Math.round(activeSeat.pct)}% ${countedWord(final)}.`) : ''

  return (
    <div className="arrows counted" data-mode={shown}>
      <LensBar
        title={title}
        modes={MODES}
        mode={shown}
        onMode={onMode}
        info={
          <StageInfo label="About counted">
            <p>Counted is the ballots counted so far, out of everyone enrolled in the seat. Not everyone votes, so a finished seat stops near 85 to 90%, never 100%.</p>
          </StageInfo>
        }
      />

      <div className="arrows__stage" ref={stageRef} onPointerOver={onOver} onPointerOut={onOut} onClick={onTap}>
        {view ? (
          <svg className="arrows__svg" viewBox={view.vb.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`How much of each of the 88 districts is counted, on the ${shown === 'hex' ? 'hexagons' : 'map'}. The seats list has the same figures.`}>
            <g>
              {view.items.map((it) => (
                <Shape key={it.id} mode={shown} it={it} className="arrows__seat" data-testid="counted-seat" data-step={countedStep(seats.get(it.id)?.pct, scale.cuts) ?? 'none'} fill={css(countedRgb(seats.get(it.id)?.pct, pal, scale.cuts))} stroke={css(pal.edge)} />
              ))}
            </g>
            {shown === 'hex' && (
              <g className="counted__nums" pointerEvents="none" aria-hidden>
                {view.items.map((it) => {
                  const l = countedLabel(seats.get(it.id)?.pct, pal, scale.cuts)
                  if (!l) return null
                  const fs = LABEL_PX[size.w < NARROW_PX ? 'narrow' : 'wide'] / ppu
                  return (
                    <text key={it.id} className="counted__num" data-testid="counted-num" x={it.cx} y={it.cy} fontSize={fs} fill={css(l.ink)} stroke={css(l.halo)} strokeWidth={HALO_PX / ppu}>
                      {l.text}
                    </text>
                  )
                })}
              </g>
            )}
            {active !== null && view.items.filter((it) => it.id === active).map((it) => (
              <Shape key="pick" mode={shown} it={it} className="arrows__pick" fill="none" stroke={css(pal.selected)} />
            ))}
            <g>
              {view.items.map((it) => (
                <Shape key={it.id} mode={shown} it={it} className="arrows__hit" data-id={it.id} fill="transparent" stroke="none" />
              ))}
            </g>
          </svg>
        ) : (
          <p className="explore-lens__loading" role="status">Loading...</p>
        )}
        {active !== null && activeSeat && (
          <div className="arrows__pill" role="status" data-testid="counted-pill">
            {pill}
            {sticky !== null && hover === null ? ' Tap again to clear.' : ''}
          </div>
        )}
      </div>

      <ul className="arrows__legend counted__legend" aria-label="Key" data-testid="counted-key">
        {COUNTED_ALPHA.map((_a, i) => (
          <li key={i}>
            <i className="counted__sw" style={{ background: css(countedRgb(swatchPct[i]!, pal, scale.cuts)) }} aria-hidden />
            <span className="counted__lbl" title={`${scale.labels[i]} ${countedWord(final)}`}>{bandLabel(scale.short[i]!)}</span>
          </li>
        ))}
        {/* VE-221 (B8): the Hex prints each seat's figure, so the key names it. */}
        {shown === 'hex' && <li data-testid="counted-number-key">Number: % {countedWord(final)}</li>}
      </ul>
    </div>
  )
}
