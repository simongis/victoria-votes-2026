import { useId } from 'react'
import { pointsAttr, taperArrow } from './taper'

/**
 * VE-274: the "i" diagram for the swing view. One of each mark the map uses, each with its meaning beside it, so a newcomer
 * does not have to decode arrows against triangles from a paragraph. The arrows grow from their tails once when the sheet
 * opens (CSS; switched off under prefers-reduced-motion), they never loop.
 */
function Arrow({ x, y, dir, ink }: { x: number; y: number; dir: 1 | -1; ink: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon className={`arrows-diagram__arrow arrows-diagram__arrow--${dir === -1 ? 'l' : 'r'}`} points={pointsAttr(taperArrow(50, dir, false))} fill={ink} />
    </g>
  )
}

export function ArrowsDiagram() {
  const title = useId()
  const tri = 'var(--party-onp)'
  return (
    <svg className="arrows-diagram" viewBox="0 0 360 100" role="img" aria-labelledby={title}>
      <title id={title}>Arrows point toward Labor or the Coalition. Triangles show a party's first-preference vote up or down. A ring means too early and a dot means nothing to compare.</title>
      <Arrow x={62} y={18} dir={-1} ink="var(--party-alp)" />
      <text x="70" y="22" fontSize="12" fill="var(--color-text)">Toward Labor</text>
      <Arrow x={178} y={18} dir={1} ink="var(--party-lib)" />
      <text x="234" y="22" fontSize="12" fill="var(--color-text)">Toward the Coalition</text>
      <polygon points="14,40 22,56 6,56" fill={tri} />
      <text x="30" y="53" fontSize="12" fill="var(--color-text)">Party's vote up</text>
      <polygon points="186,56 194,40 178,40" fill={tri} />
      <text x="202" y="53" fontSize="12" fill="var(--color-text)">Party's vote down</text>
      <circle cx="14" cy="80" r="4.4" fill="var(--map-paper)" stroke="var(--color-text-subtle)" strokeWidth="1.5" />
      <text x="30" y="84" fontSize="12" fill="var(--color-text)">Too early</text>
      <circle cx="186" cy="80" r="3.4" fill="var(--color-text-subtle)" />
      <text x="202" y="84" fontSize="12" fill="var(--color-text)">Nothing to compare</text>
    </svg>
  )
}
