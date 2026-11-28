import { useId } from 'react'
import { sparkPath } from '../../../derive/pulse'
import { css, usePalette } from '../../../theme/theme'
import { stepRgb } from '../../../views/encoding'
import { partyName } from '../../../derive/seats'
import { lineSides, seatRead, trendMarks, type MultiRow } from '../../lenspanel/multi'

const W = 320
const H = 170
const PAD = { l: 6, r: 50, t: 16, b: 32 }
const PW = W - PAD.l - PAD.r
const PH = H - PAD.t - PAD.b
const MID = PAD.t + PH / 2

/** Points either side of zero that reach the chart's edge: the hex's scale (30) unless this seat ran wider, so no line is clipped. */
function trendRange(line: readonly (number | null)[]): number {
  const max = line.reduce<number>((m, v) => (v === null ? m : Math.max(m, Math.abs(v))), 0)
  return Math.min(100, Math.max(30, Math.ceil((max * 1.1) / 10) * 10))
}

const hourLabel = (t: number): string => new Date(t).toLocaleString('en-AU', { hour: 'numeric', hour12: true, timeZone: 'Australia/Melbourne' })

/**
 * The picked seat's lead over the night (VE-276): the same line as its hex, larger. Above the zero line the 2022 holder
 * leads, below it the other party does, each side in its party's colour (a line is drawn once and clipped either side of
 * zero, so a crossing changes colour exactly where the lead changed hands). Calm: one zero line, no gridlines.
 */
export function SeatTrend({ row, total, times }: { row: MultiRow; total: number; times?: readonly number[] }) {
  const pal = usePalette()
  const id = useId()
  const { holder, other } = lineSides(row.seat)
  const colour = (p: typeof holder) => css(p ? stepRgb(p, 2, pal) : pal.noResult)
  const read = seatRead(row)
  const range = trendRange(row.line)
  const d = sparkPath(row.line, total, PW, PH, range)
  const marks = times && times.length === total ? trendMarks(times, hourLabel) : []
  // The last figure's place, for the dot and the end label.
  let lastI = -1
  row.line.forEach((v, i) => {
    if (v !== null) lastI = i
  })
  // VE-290: no end marker when the latest tick has no figure (pairing withheld): it would contradict the heading.
  const last = lastI >= 0 && lastI === row.line.length - 1 ? row.line[lastI]! : null
  const ex = total > 1 ? (lastI / (total - 1)) * PW : 0
  const ey = last === null ? MID : PAD.t + PH / 2 - (Math.max(-range, Math.min(range, last)) / range) * (PH / 2)
  const endColour = last === null ? colour(null) : colour(read.leader ?? (last >= 0 ? holder : other))
  const alt =row.lead === null ? `${row.name}: nothing counted yet.` : `${row.name}: the lead over the night, ending with ${partyName(read.leader)} ahead by ${Math.round(read.lead ?? 0)} points.`
  return (
    <svg className="multi__trend" data-testid="seat-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt} focusable="false">
      <defs>
        <clipPath id={`${id}-up`}><rect x="-4" y="-4" width={PW + 8} height={PH / 2 + 4} /></clipPath>
        <clipPath id={`${id}-dn`}><rect x="-4" y={PH / 2} width={PW + 8} height={PH / 2 + 4} /></clipPath>
      </defs>
      {holder && <text className="multi__trend-side" x={PAD.l} y={PAD.t - 4} style={{ fill: colour(holder) }}>{partyName(holder)} ahead</text>}
      {other && <text className="multi__trend-side" x={PAD.l} y={PAD.t + PH + 11} style={{ fill: colour(other) }}>{partyName(other)} ahead</text>}
      <line className="multi__trend-zero" x1={PAD.l} x2={PAD.l + PW} y1={MID} y2={MID} />
      <g transform={`translate(${PAD.l} ${PAD.t})`}>
        {d && (
          <>
            <path className="multi__trend-line" d={d} clipPath={`url(#${id}-up)`} style={{ stroke: colour(holder) }} />
            <path className="multi__trend-line" d={d} clipPath={`url(#${id}-dn)`} style={{ stroke: colour(other) }} />
          </>
        )}
      </g>
      {marks.map((m) => (
        <g key={m.x} data-testid="seat-trend-mark">
          <line className="multi__trend-tick" x1={PAD.l + m.x * PW} x2={PAD.l + m.x * PW} y1={PAD.t + PH} y2={PAD.t + PH + 4} />
          <text className="multi__trend-time" x={PAD.l + m.x * PW} y={H - 4} textAnchor="middle">{m.label}</text>
        </g>
      ))}
      {marks.length === 0 && total > 1 && (
        <>
          <text className="multi__trend-time" x={PAD.l} y={H - 4}>Count starts</text>
          <text className="multi__trend-time" x={PAD.l + PW} y={H - 4} textAnchor="end">Latest</text>
        </>
      )}
      {last !== null && (
        <g data-testid="seat-trend-end">
          <circle cx={PAD.l + ex} cy={ey} r="3.6" style={{ fill: endColour }} />
          <text className="multi__trend-end" x={PAD.l + ex + 7} y={ey + 4} style={{ fill: endColour }}>{Math.round(Math.abs(last))} pts</text>
        </g>
      )}
    </svg>
  )
}
