import { LensNotice } from '../LensNotice'
import { useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { sparkPath } from '../../../derive/pulse'
import { css, usePalette } from '../../../theme/theme'
import { isFinal } from '../../../derive/turnout'
import { stepRgb } from '../../../views/encoding'
import { InfoButton } from '../../InfoButton'
import { CLOSE_PTS, multiRows, multiSentence, type MultiRow } from '../../lenspanel/multi'
import type { LensProps } from '../lenses'
import { LensBar } from '../LensBar'
import { hexView } from '../stageGeom'
import { MovesBlock } from './MovesBlock'
import { useNight } from './nightStore'

/** Points either side of zero that reach a tile's top and bottom edge (the rail's own scale). */
const RANGE = 30
/** The line takes this share of the hex's box, centred, so it sits inside the hexagon. */
const LINE_W = 0.72
const LINE_H = 0.44

/** A phone held upright (VE-180): the grid starts straight under the question instead of floating in the middle of the stage. */
const PORTRAIT_PHONE = '(max-width: 1023px) and (orientation: portrait)'
function usePortraitPhone(): boolean {
  const get = () => typeof matchMedia === 'function' && matchMedia(PORTRAIT_PHONE).matches
  const [on, setOn] = useState(get)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(PORTRAIT_PHONE)
    const read = () => setOn(mq.matches)
    read()
    mq.addEventListener('change', read)
    return () => mq.removeEventListener('change', read)
  }, [])
  return on
}

/**
 * 88 races as small multiples (VE-86, UX review 7, FB-31, FB-81): each seat is a tiny hex holding its lead over the night,
 * in the leader's colour, on a faint 50% line, at its place on the Hex so geography is kept. Settled seats are muted and
 * close ones heavier, so the eye lands on the races still moving. It draws the same count pulse as the rail's night column,
 * cut at the tick on show, so Rewind applies. Hex only: there is nothing to read in 88 lines squeezed into small seats.
 */
export default function MultiplesLens({ seats, statics, title, onShowSeat }: LensProps) {
  const pal = usePalette()
  const night = useNight()
  const [hover, setHover] = useState<number | null>(null)
  // A tile ringed from a "biggest moves" card (VE-182).
  const [ring, setRing] = useState<number | null>(null)
  const portrait = usePortraitPhone()
  const view = useMemo(() => hexView(statics), [statics])
  const final = useMemo(() => isFinal(seats.values()), [seats])
  const rows = useMemo(() => multiRows(seats, night.series, night.shownIdx, final), [seats, night, final])
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  // Paths are rebuilt only when the night or the seats change (a new tick), never per frame.
  const tiles = useMemo(
    () =>
      view.items.map((it) => {
        const r = byId.get(it.id)
        const w = (it.box.x1 - it.box.x0) * LINE_W
        const h = (it.box.y1 - it.box.y0) * LINE_H
        const d = r ? sparkPath(r.line, night.total, w, h, RANGE) : ''
        return { it, r, w, h, d }
      }),
    [view, byId, night.total],
  )

  const idOf = (t: EventTarget | null): number | null => {
    const el = t instanceof Element ? t.closest<SVGElement>('[data-id]') : null
    return el ? Number(el.dataset.id) : null
  }
  const onOver = (e: PointerEvent) => e.pointerType === 'mouse' && setHover(idOf(e.target))
  const onOut = (e: PointerEvent) => e.pointerType === 'mouse' && setHover(idOf(e.relatedTarget))
  const open = (id: number) => onShowSeat?.(id)
  const onKey = (e: KeyboardEvent, id: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open(id)
    }
  }
  const hovered: MultiRow | null = hover === null ? null : byId.get(hover) ?? null
  const ringItem = ring === null ? null : view.items.find((it) => it.id === ring) ?? null

  return (
    <div className="arrows multi" data-mode="hex" data-testid="multi-lens">
      <LensBar
        title={title}
        info={
          <InfoButton label="About the small charts" align="right">
            <p>Each hexagon is a seat, in its place on the Hex. The line is the 2022 holder&apos;s lead over the night: above the faint middle line they are ahead, below it they trail, and a line that crosses it is a lead changing. The colour is {final ? 'the winner' : "tonight's leader"}.</p>
            <p>{final ? '' : 'Faded seats are won or certain. '}Heavier lines are races within {CLOSE_PTS} points. Tap a seat to open it.</p>
            <LensNotice seats={seats} />
          </InfoButton>
        }
      />
      <div className="arrows__stage" onPointerOver={onOver} onPointerOut={onOut} style={portrait ? { aspectRatio: `${view.vb[2]} / ${view.vb[3]}` } : undefined}>
        <svg className="arrows__svg" viewBox={view.vb.join(' ')} preserveAspectRatio={portrait ? 'xMidYMin meet' : 'xMidYMid meet'} role="group" aria-label="The 88 races, each a small chart of the lead over the night, on the hexagons">
          <g>
            {tiles.map(({ it, r, w, h, d }) => {
              // Full party colour whatever the margin: the line is the data, and muting says settled.
              const colour = css(r?.seat.leader ? stepRgb(r.seat.leader, 2, pal) : pal.noResult)
              const x = it.cx - w / 2
              const y = it.cy - h / 2
              return (
                <g key={it.id} className="multi__tile" data-testid="multi-tile" data-state={r?.state ?? 'none'} data-swings={r?.swings ?? 0}>
                  <polygon points={it.geom} className="multi__hex" />
                  <line className="multi__mid" x1={x} x2={x + w} y1={it.cy} y2={it.cy} />
                  {d && <path className="multi__line" d={d} transform={`translate(${x} ${y})`} style={{ stroke: colour }} />}
                </g>
              )
            })}
          </g>
          {ringItem && (
            <g className="multi__ring" pointerEvents="none" aria-hidden data-testid="multi-ring" data-id={ringItem.id}>
              <polygon points={ringItem.geom} className="multi__ring-halo" />
              <polygon points={ringItem.geom} className="multi__ring-line" />
            </g>
          )}
          <g>
            {view.items.map((it) => {
              const r = byId.get(it.id)
              return (
                <polygon
                  key={it.id}
                  points={it.geom}
                  className="arrows__hit multi__hit"
                  data-id={it.id}
                  data-testid="multi-hit"
                  fill="transparent"
                  stroke="none"
                  role="button"
                  tabIndex={0}
                  aria-label={r ? multiSentence(r) : 'No figures'}
                  onClick={() => open(it.id)}
                  onKeyDown={(e) => onKey(e, it.id)}
                  onFocus={() => setHover(it.id)}
                  onBlur={() => setHover(null)}
                />
              )
            })}
          </g>
        </svg>
        {hovered && (
          <div className="arrows__pill" role="status" data-testid="multi-pill">
            {multiSentence(hovered)}
          </div>
        )}
      </div>
      <MovesBlock rows={rows} total={night.total} final={final} range={RANGE} on={portrait} ring={ring} onRing={setRing} onSelect={open} />
    </div>
  )
}
