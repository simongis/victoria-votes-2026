import { useId } from 'react'
import { pointsAttr, taperArrow } from './taper'
import { hexPoints } from '../../info/legendArt'

/**
 * VE-274, VE-308 (round 2 pick S1): the "i" diagram for the swing view, in two clearly separate rows. The first is the
 * Labor v Coalition seats: a short and a long arrow each way, growing once from their tails, so length reads as the size
 * of the swing after preferences. The second answers Simon's "why triangles?": in the other contests there is no Labor v
 * Coalition swing to draw, so the mark is the party whose first-preference vote changed most, a triangle up or down in
 * its colour, shown on a seat with its words beside it. Then the two quiet marks (too early, nothing to compare).
 */
function Arrow({ x, y, dir, ink, len }: { x: number; y: number; dir: 1 | -1; ink: string; len: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon className={`arrows-diagram__arrow arrows-diagram__arrow--${dir === -1 ? 'l' : 'r'}`} points={pointsAttr(taperArrow(len, dir, false, 1.3))} fill={ink} />
    </g>
  )
}

/** A grey seat hex with the lens's mover triangle on it (as ArrowsLens's MoverMark draws it). */
function MoverSeat({ x, y, up, ink }: { x: number; y: number; up: boolean; ink: string }) {
  const h = 16
  const w = 14
  const pts = up ? `0,${-h / 2} ${w / 2},${h / 2} ${-w / 2},${h / 2}` : `0,${h / 2} ${w / 2},${-h / 2} ${-w / 2},${-h / 2}`
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon points={hexPoints(0, 0, 15)} fill="var(--color-border)" stroke="var(--color-border-strong)" strokeWidth={1} />
      <polygon points={pts} fill={ink} />
    </g>
  )
}

const T = ({ x, y, children, anchor = 'start', size = 11.5, bold, subtle }: { x: number; y: number; children: string; anchor?: 'start' | 'middle' | 'end'; size?: number; bold?: boolean; subtle?: boolean }) => (
  <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={bold ? 700 : undefined} fill={subtle ? 'var(--color-text-subtle)' : 'var(--color-text)'}>{children}</text>
)

export function ArrowsDiagram() {
  const title = useId()
  return (
    <svg className="arrows-diagram" viewBox="0 0 360 216" role="img" aria-labelledby={title}>
      <title id={title}>Labor v Coalition seats: arrows point toward Labor or the Coalition, longer for a bigger swing after preferences. Other contests: a triangle shows the party whose first-preference vote changed most, up or down. A ring means too early; a dot means nothing to compare.</title>
      <g data-row="arrows">
        <T x={0} y={12} bold>Labor v Coalition seats: swing after preferences</T>
        <path d="M180 22v52" stroke="var(--color-text-subtle)" strokeDasharray="2 3" />
        <Arrow x={174} y={36} dir={-1} ink="var(--party-alp)" len={26} />
        <Arrow x={174} y={60} dir={-1} ink="var(--party-alp)" len={96} />
        <Arrow x={186} y={36} dir={1} ink="var(--party-lib)" len={40} />
        <Arrow x={186} y={60} dir={1} ink="var(--party-lib)" len={120} />
        <T x={0} y={33} size={11} subtle>Toward</T>
        <T x={0} y={46} bold>Labor</T>
        <T x={360} y={33} anchor="end" size={11} subtle>Toward</T>
        <T x={360} y={46} anchor="end" bold>Coalition</T>
        <T x={180} y={86} anchor="middle" size={10} subtle>since 2022</T>
      </g>
      <path d="M0 98h360" stroke="var(--color-border)" />
      <g data-row="others">
        <T x={0} y={116} bold>Other contests</T>
        <MoverSeat x={16} y={138} up ink="var(--party-onp)" />
        <T x={38} y={142}>One Nation up 12 pts</T>
        <MoverSeat x={196} y={138} up={false} ink="var(--party-alp)" />
        <T x={218} y={142}>Labor down 6 pts</T>
        <T x={0} y={170} size={11} subtle>Each triangle: the party whose first-preference vote changed most</T>
      </g>
      <path d="M0 182h360" stroke="var(--color-border)" />
      <circle cx={14} cy={200} r={4.4} fill="var(--map-paper)" stroke="var(--color-text-subtle)" strokeWidth={1.5} />
      <T x={26} y={204}>Too early</T>
      <circle cx={196} cy={200} r={3.4} fill="var(--color-text-subtle)" />
      <T x={208} y={204}>Nothing to compare</T>
    </svg>
  )
}
