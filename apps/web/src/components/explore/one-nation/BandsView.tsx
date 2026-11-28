import { useMemo } from 'react'
import { BAND_NAMES, partyRgb, rampCss, swarm, type Band } from '../../../derive/oneNation'
import type { PartyRow } from '../../lenspanel/party'
import { css, type Palette, type Rgb } from '../../../theme/theme'
import { useSize } from '../stageGeom'
import type { Measure } from './measures'
import type { SeatPick } from './useSeatPick'

interface Props {
  /** Every seat is declared: the words say "final count". */
  final?: boolean
  bands: readonly Band[]
  rows: ReadonlyMap<number, PartyRow>
  measure: Measure
  base: Rgb
  max: number
  partyName: string
  names: ReadonlyMap<number, string>
  words: (id: number) => string
  pal: Palette
  pick: SeatPick
}

const NARROW_PX = 600
const MARGIN = { t: 8, r: 14, b: 34 }

/**
 * Seats in fifths: the 88 seats ranked by one plain measure and cut into five bands. Each band is a row of dots, one dot a
 * seat, placed by the chosen party's share; the black tick is the band's average. It is about seats, not people.
 */
export function BandsView({ final = false, bands, rows, measure, base, max, partyName, names, words, pal, pick }: Props) {
  const [ref, size] = useSize<HTMLDivElement>()
  const narrow = size.w > 0 && size.w < NARROW_PX
  const W = Math.max(size.w, 260)
  const H = Math.max(size.h, 300)
  const labelW = narrow ? 84 : 132
  const r = narrow ? 4 : 5
  const laneH = (H - MARGIN.t - MARGIN.b) / 5
  const sx = (v: number) => labelW + (Math.min(v, max) / max) * (W - labelW - MARGIN.r)
  // Whole-number gridlines (every 5 points up to 20, then every 10) so the axis reads plainly.
  const ticks = useMemo(() => {
    const step = max <= 20 ? 5 : 10
    return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step)
  }, [max])

  const dots = useMemo(
    () =>
      bands.flatMap((b) => {
        const cy = MARGIN.t + laneH * (b.index + 0.5)
        const px = b.ids.map((id) => sx(rows.get(id)?.pct ?? 0))
        const ks = swarm(px, 2 * r + 1)
        // Squeeze the stack to fit its lane when a band is very crowded.
        const reach = Math.max(1, ...ks.map(Math.abs))
        const step = Math.min(2 * r + 1, (laneH / 2 - r - 1) / reach)
        return b.ids.map((id, i) => ({ id, cx: px[i]!, cy: cy + ks[i]! * step }))
      }),
    // sx closes over W, labelW and max; list the primitives so the layout rebuilds when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bands, rows, laneH, r, W, labelW, max],
  )
  const nav = useMemo(() => dots.map((d) => ({ id: d.id, x: d.cx, y: d.cy })), [dots])
  const first = dots[0]?.id ?? null

  return (
    <div className="onl__scatter" ref={ref}>
      {size.w > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${partyName} share of the vote in the top fifth to the bottom fifth of seats for ${measure.noun}, one dot for each seat. Tab to a dot, then use the arrow keys.`} onKeyDown={(e) => pick.onKey(e, nav)}>
          <g className="prefs__tick">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={sx(t)} x2={sx(t)} y1={MARGIN.t} y2={H - MARGIN.b} stroke="var(--color-border)" />
                <text x={sx(t)} y={H - MARGIN.b + 16} textAnchor="middle">{t}%</text>
              </g>
            ))}
          </g>
          <text className="onl__axis" x={(labelW + W - MARGIN.r) / 2} y={H - 6} textAnchor="middle">{partyName} share of first preferences ({final ? 'final' : "tonight's"} count, or 2025 federal before counting starts)</text>
          {bands.map((b) => {
            const top = MARGIN.t + laneH * b.index
            return (
              <g key={b.index} data-testid="onl-band" data-band={b.index}>
                {b.index > 0 && <line x1="4" x2={W - MARGIN.r} y1={top} y2={top} stroke="var(--color-border)" strokeDasharray="2 3" />}
                <text className="onl__axis" x="4" y={top + laneH / 2 - 4} fontWeight="700">{BAND_NAMES[b.index]}</text>
                <text className="prefs__tick" x="4" y={top + laneH / 2 + 10} fontSize="11" fill="var(--color-text-subtle)">
                  {narrow ? `avg ${b.mean.toFixed(1)}%` : `${measure.fmt(b.lo)} to ${measure.fmt(b.hi)}`}
                </text>
                {!narrow && (
                  <text className="prefs__tick" x="4" y={top + laneH / 2 + 24} fontSize="11" fill="var(--color-text-subtle)">avg {b.mean.toFixed(1)}%</text>
                )}
                <line data-testid="onl-mean" x1={sx(b.mean)} x2={sx(b.mean)} y1={top + 4} y2={top + laneH - 4} stroke="var(--color-text)" strokeWidth="2" />
              </g>
            )
          })}
          <g>
            {[...dots].sort((a, b) => a.cx - b.cx || a.id - b.id).map((d) => {
              const row = rows.get(d.id)
              const none = !row || row.notStanding
              return (
                <g key={d.id} className="onl__dot" data-testid="onl-dot" {...pick.mark(d.id, words(d.id) || (names.get(d.id) ?? ''), first)}>
                  <circle cx={d.cx} cy={d.cy} r={r + 3} fill="transparent" />
                  <circle
                    className="onl__d"
                    cx={d.cx}
                    cy={d.cy}
                    r={r}
                    fill={none ? css(pal.noResult) : css(partyRgb(row.pct, base, max))}
                    stroke={row?.partial ? '#666' : css(pal.paper)}
                    strokeDasharray={row?.partial && !none ? '2 1.5' : undefined}
                  />
                  {d.id === pick.active && <circle className="prefs__pick" cx={d.cx} cy={d.cy} r={r + 2.5} fill="none" stroke={css(pal.selected)} />}
                </g>
              )
            })}
          </g>
        </svg>
      )}
    </div>
  )
}

export function BandsKey({ base, max }: { base: Rgb; max: number }) {
  return (
    <ul className="arrows__legend onl__key" aria-label="Key" data-testid="onl-key">
      <li>Dot colour, as on the map: 0%</li>
      <li><i className="onl__ramp" style={{ background: rampCss((v) => partyRgb(v, base, max), 0, max, 12) }} aria-hidden /></li>
      <li>{max}%+</li>
      <li>Black tick: the fifth&apos;s average. Dashed ring: stood in part of the seat.</li>
    </ul>
  )
}
