import { css, usePalette } from '../../../theme/theme'

/** A few hexes, each with a tiny line crossing or hugging a faint middle line, in two party colours. */
const CELLS: [number, number, string, string][] = [
  [20, 18, 'M13 22 L18 18 L22 14 L27 12', 'alp'],
  [38, 18, 'M31 14 L36 17 L40 21 L45 22', 'lib'],
  [56, 18, 'M49 18 L54 20 L58 16 L63 17', 'alp'],
  [74, 18, 'M67 22 L72 20 L76 15 L81 12', 'alp'],
  [29, 33, 'M22 29 L27 31 L31 36 L36 38', 'lib'],
  [47, 33, 'M40 36 L45 32 L49 31 L54 30', 'alp'],
  [65, 33, 'M58 31 L63 34 L67 33 L72 36', 'lib'],
  [20, 48, 'M13 44 L18 46 L22 50 L27 52', 'lib'],
  [38, 48, 'M31 50 L36 47 L40 45 L45 43', 'alp'],
  [56, 48, 'M49 47 L54 50 L58 48 L63 46', 'alp'],
  [74, 48, 'M67 52 L72 49 L76 46 L81 45', 'alp'],
]
const hex = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')

export function MultiplesThumb() {
  const pal = usePalette()
  return (
    <svg viewBox="0 0 96 64" className="xthumb" aria-hidden focusable="false">
      {CELLS.map(([x, y, d, p]) => (
        <g key={`${x}-${y}`}>
          <polygon points={hex(x, y, 9.4)} fill="var(--map-no-result)" stroke="var(--map-edge)" strokeWidth="1" />
          <line x1={x - 7} x2={x + 7} y1={y} y2={y} stroke="var(--color-border-strong)" strokeWidth="0.8" strokeDasharray="2 1.6" />
          <path d={d} fill="none" stroke={css(p === 'alp' ? pal.party.ALP : pal.party.LIB)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
    </svg>
  )
}
