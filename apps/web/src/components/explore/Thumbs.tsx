import { countedRgb } from '../../derive/colour'
import { shareRgb } from '../../derive/oneNation'
import { css, usePalette } from '../../theme/theme'

/** Small static thumbnails for the Explore cards: drawn in code from the theme's colours, so they follow both themes (no screenshots to go stale). */
const hex = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')

const CELLS: [number, number][] = [
  [20, 18], [38, 18], [56, 18], [74, 18],
  [29, 33], [47, 33], [65, 33],
  [20, 48], [38, 48], [56, 48], [74, 48],
]

export function ArrowsThumb() {
  // A handful of hexes, three with arrows (red toward Labor, blue toward the Coalition) and two dots.
  const ink = (c: string) => ({ stroke: `var(${c})`, strokeWidth: 2.4, strokeLinecap: 'round' as const, fill: 'none' })
  return (
    <svg viewBox="0 0 96 64" className="xthumb" aria-hidden focusable="false">
      {CELLS.map(([x, y]) => (
        <polygon key={`${x}-${y}`} points={hex(x, y, 9.4)} fill="var(--map-no-result)" stroke="var(--map-edge)" strokeWidth="1" />
      ))}
      <path d="M43 20 L33 14 M33 14 l5.5 0.2 M33 14 l2.2 5" {...ink('--party-alp')} />
      <path d="M52 35 L42 29 M42 29 l5.5 0.2 M42 29 l2.2 5" {...ink('--party-alp')} />
      <path d="M61 50 L71 44 M71 44 l-5.5 0.2 M71 44 l-2.2 -5" {...ink('--party-lib')} />
      <path d="M68 20 L78 14 M78 14 l-5.5 0.2 M78 14 l-2.2 -5" {...ink('--party-lib')} />
      <circle cx="20" cy="48" r="2.2" fill="var(--color-text-subtle)" />
      <circle cx="74" cy="48" r="2.2" fill="var(--color-text-subtle)" />
    </svg>
  )
}

/** The same hexes in the lens's own four steps (drawn with its fill function, so the thumbnail and the lens agree on both themes). */
export function CountedThumb() {
  const pal = usePalette()
  const pcts = [10, 35, 60, 85]
  return (
    <svg viewBox="0 0 96 64" className="xthumb" aria-hidden focusable="false">
      {CELLS.map(([x, y], i) => (
        <polygon key={`${x}-${y}`} points={hex(x, y, 9.4)} fill={css(countedRgb(pcts[(i * 7) % 4], pal))} stroke="var(--map-edge)" strokeWidth="1" />
      ))}
    </svg>
  )
}

/** Rows of party-coloured dots either side of a dashed 50% line. */
export function PrefsThumb() {
  const rows: [number, string, number[]][] = [
    [16, '--party-alp', [22, 30, 36, 44, 66]],
    [32, '--party-lib', [28, 40, 47, 55, 70]],
    [48, '--party-grn', [18, 34, 46, 52, 62]],
  ]
  return (
    <svg viewBox="0 0 96 64" className="xthumb" aria-hidden focusable="false">
      <line x1="48" x2="48" y1="6" y2="58" stroke="var(--color-text)" strokeWidth="1.2" strokeDasharray="3 2.5" />
      {rows.map(([y, c, xs]) => xs.map((x, i) => <circle key={`${y}-${x}`} cx={x + 6} cy={y + (i % 2 ? 2.5 : -2)} r="3.2" fill={`var(${c})`} />))}
    </svg>
  )
}

/** The same hexes shaded in One Nation's own orange, growing from pale to deep (drawn with the lens's ramp). */
export function OneNationThumb() {
  const pal = usePalette()
  const steps = [0.5, 3, 6, 9, 12, 15]
  return (
    <svg viewBox="0 0 96 64" className="xthumb" aria-hidden focusable="false">
      {CELLS.map(([x, y], i) => (
        <polygon key={`${x}-${y}`} points={hex(x, y, 9.4)} fill={css(shareRgb(steps[(i * 5) % steps.length]!, pal.party.ONP))} stroke="var(--map-edge)" strokeWidth="1" />
      ))}
    </svg>
  )
}

/** A skewed bell of simulated seat counts (36 bars, heights 0 to 1), so the thumb draws a forecast's shape rather than any one result. */
const BELL = Array.from({ length: 36 }, (_, i) => Math.exp(-((i - 16.5) ** 2) / (2 * (i < 16.5 ? 5.5 : 6.5) ** 2)))

/**
 * VE-200c: the Polling model card shows "10,000 simulated elections", one histogram of seat counts with a dashed
 * majority line and the bars past it in navy. A model picture with no party and no map, so it cannot read as a
 * result. Fixed colours on its own pale ground, so it holds on the light and console themes alike.
 */
export function ForecastThumb() {
  return (
    <svg viewBox="0 0 96 64" className="xthumb" aria-hidden focusable="false">
      <rect width="96" height="64" fill="#eef1ea" />
      {BELL.map((v, i) => (
        <rect key={i} x={(6 + i * 2.4).toFixed(1)} y={(54 - v * 40).toFixed(1)} width="1.8" height={(v * 40).toFixed(1)} fill={i >= 20 ? '#3d5a80' : '#9aa7b5'} />
      ))}
      <path d="M5 54.5H91.8" stroke="#1f2d3a" strokeWidth="0.8" />
      <path d="M53.7 8V57" stroke="#1f2d3a" strokeWidth="1" strokeDasharray="2.5 2" />
    </svg>
  )
}

/**
 * VE-209c (FB-246): the Similar lens in its light look, on the same paper as the other cards. One picked hex, in the
 * app's selection outline, sends three sepia threads (with a light casing) to sand hexes far away, which is the point
 * of the view. Sand and sepia take no party's side (checked against tokens.css, see similar.css).
 */
export function SimilarThumb() {
  const from: [number, number] = [29, 33]
  const to: [number, number][] = [[74, 18], [74, 48], [38, 48]]
  const arc = ([x, y]: [number, number]) => `M${from[0]} ${from[1]}Q${(from[0] + x) / 2} ${Math.min(from[1], y) - 14} ${x} ${y}`
  // The lens's own faded seat: the no-result grey half a step towards the paper.
  const faded = 'color-mix(in srgb, var(--map-no-result) 55%, var(--map-paper))'
  return (
    <svg viewBox="0 0 96 64" className="xthumb" aria-hidden focusable="false">
      {CELLS.map(([x, y]) => (
        <polygon key={`${x}-${y}`} points={hex(x, y, 9.4)} fill={faded} stroke="var(--map-edge)" strokeWidth="1" />
      ))}
      {to.map((t) => (
        <g key={t.join('-')}>
          <polygon points={hex(t[0], t[1], 9.4)} fill="none" stroke="#d6b871" strokeWidth="3" strokeLinejoin="round" opacity="0.7" />
          <polygon points={hex(t[0], t[1], 8.9)} fill="#ead9b0" stroke="#4a3a22" strokeWidth="0.9" strokeLinejoin="round" />
        </g>
      ))}
      <polygon points={hex(from[0], from[1], 8.9)} fill="#ffffff" stroke="var(--map-selected)" strokeWidth="1.8" />
      {to.map((t) => (
        <g key={`a${t.join('-')}`}>
          <path d={arc(t)} fill="none" stroke="#fffaf0" strokeWidth="2.8" strokeLinecap="round" />
          <path d={arc(t)} fill="none" stroke="#3b2f20" strokeWidth="1.1" strokeLinecap="round" />
        </g>
      ))}
      <circle cx={from[0]} cy={from[1]} r="1.8" fill="var(--map-selected)" stroke="#ffffff" strokeWidth="0.8" />
    </svg>
  )
}
