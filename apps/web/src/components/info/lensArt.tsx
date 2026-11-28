import { useId, type ReactNode } from 'react'
import { EMPTY_ALPHA, EMPTY_STRIPE } from '../../derive/colour'
import { partyRgb } from '../../derive/oneNation'
import { useMotion } from '../../state/motion'
import { css, type Rgb } from '../../theme/theme'
import { hexPoints, svgId } from './legendArt'
import { SIM_CENTRE, SIM_FIFTEEN, SIM_FIVE, crossings, rampStops, strongestArtFor, threadPath, type StrongestTop } from './lensArtLayout'
import '../../styles/legend-art.css'
import '../../styles/lens-art.css'

/**
 * VE-313 (Simon, 28 Nov: "viz first, words behind i"): a small picture at the top of three More ways keys, drawn the way
 * the Map key art is (MapLegendArt.tsx): the same 360-wide box, type and tokens, one of each mark with a two- or
 * three-word label. It reuses the Map key's one-off movements (legend-art.css): they play once when the key opens, only
 * with Animations on, and never under prefers-reduced-motion.
 */

const TEXT = 'var(--color-text)'
const SUBTLE = 'var(--color-text-subtle)'
const EDGE = 'var(--color-border-strong)'

function Art({ name, title, height, children }: { name: string; title: string; height: number; children: (id: (n: string) => string) => ReactNode }) {
  const reactId = useId()
  const anim = useMotion().mode === 'full' ? 'on' : 'off'
  const id = (n: string) => svgId(reactId, n)
  return (
    <svg className={`legend-art lens-art lens-art--${name}`} data-testid={`lens-art-${name}`} data-anim={anim} viewBox={`0 0 360 ${height}`} role="img" aria-labelledby={id('t')} style={{ display: 'block', width: '100%', maxWidth: 360, height: 'auto' }}>
      <title id={id('t')}>{title}</title>
      {children(id)}
    </svg>
  )
}

const Label = ({ x, y, children, anchor = 'start', size = 11, bold, fill = TEXT }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: number; bold?: boolean; fill?: string }) => (
  <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={bold ? 700 : undefined} fill={fill}>
    {children}
  </text>
)

/** The Strongest lens's three fills beyond the ramp, as PartyView draws them, at the picture's scale. */
function StrongestPatterns({ id, partial }: { id: (n: string) => string; partial: string }) {
  const u = 6
  return (
    <>
      <pattern id={id('none')} width={u} height={u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width={u} height={u} fill="var(--map-no-result)" />
        <rect width={2.4} height={u} fill="#c4c4c4" />
      </pattern>
      <pattern id={id('part')} width={u} height={u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width={u} height={u} fill={partial} />
        <rect width={1.8} height={u} fill="#ffffff" fillOpacity="0.7" />
      </pattern>
      <pattern id={id('wait')} width={u} height={u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width={u} height={u} fill={`color-mix(in srgb, var(--map-no-result) ${EMPTY_ALPHA * 100}%, var(--map-paper))`} />
        <rect width={1.5} height={u} fill={EMPTY_STRIPE} />
      </pattern>
    </>
  )
}

/** Vote share: the chosen party's ramp as five seats, faint to strong, then the hatched and empty seats. */
function StrengthArt({ base, max, partyName }: { base: Rgb; max: number; partyName: string }) {
  const stops = rampStops(max, 5)
  const fill = (v: number) => css(partyRgb(v, base, max))
  return (
    <Art name="strength" height={118} title={`Each seat is shaded by ${partyName}'s share of first preferences: faint is weak, deep is strong, from 0% to ${max}% or more. Hatched over the colour: the party stood in part of the seat. Grey hatching: it did not stand. Pale stripes: no figures yet.`}>
      {(id) => (
        <>
          <defs>
            <StrongestPatterns id={id} partial={fill(max * 0.6)} />
          </defs>
          {stops.map((v, i) => (
            <polygon key={i} className="legend-art__cell" style={{ animationDelay: `${0.1 + i * 0.18}s` }} data-ramp={i} points={hexPoints(36 + i * 72, 22, 16)} fill={fill(v)} stroke={EDGE} strokeWidth={0.6} />
          ))}
          <path className="legend-art__draw" style={{ animationDelay: '0.9s' }} d="M60 50h240m-6-4 6 4-6 4" fill="none" stroke={SUBTLE} strokeWidth={1.2} strokeLinecap="round" />
          <Label x={36} y={54} anchor="middle" fill={SUBTLE}>0%</Label>
          <Label x={180} y={66} anchor="middle" size={10.5} fill={SUBTLE}>{`stronger for ${partyName}`}</Label>
          <Label x={324} y={54} anchor="middle" fill={SUBTLE}>{`${max}%+`}</Label>
          <polygon points={hexPoints(16, 86, 10)} fill={`url(#${id('part')})`} stroke={EDGE} strokeWidth={0.8} />
          <Label x={32} y={90}>Stood in part of the seat</Label>
          <polygon points={hexPoints(206, 86, 10)} fill={`url(#${id('none')})`} stroke={EDGE} strokeWidth={0.8} />
          <Label x={222} y={90}>Did not stand</Label>
          <polygon points={hexPoints(16, 108, 10)} fill={`url(#${id('wait')})`} stroke={EDGE} strokeWidth={0.8} />
          <Label x={32} y={112}>No figures yet</Label>
        </>
      )}
    </Art>
  )
}

/** Where each fifth's seats sit on the share scale (0 to 1 of the top), strongest fifth first, as an example. */
const FIFTHS: readonly (readonly number[])[] = [
  [0.52, 0.6, 0.66, 0.72, 0.8, 0.9],
  [0.4, 0.47, 0.53, 0.58, 0.66, 0.74],
  [0.3, 0.37, 0.42, 0.48, 0.55, 0.62],
  [0.2, 0.26, 0.32, 0.37, 0.44, 0.52],
  [0.08, 0.14, 0.19, 0.25, 0.3, 0.38],
]
const FIFTH_LABELS = ['Top fifth', '', 'Middle', '', 'Bottom fifth'] as const

/** Seat profile: seats ranked by one measure in five rows, a dot a seat placed by the party's share, a tick the average. */
function ProfileArt({ base, max, partyName }: { base: Rgb; max: number; partyName: string }) {
  const x0 = 96
  const x1 = 340
  const sx = (t: number) => x0 + t * (x1 - x0)
  const lane = 15
  const top = 8
  return (
    <Art name="profile" height={136} title={`Seats ranked by the chosen measure and cut into fifths, top to bottom. Each dot is a seat, further right where ${partyName} polls more; the black tick is the fifth's average. A dashed ring: the party stood in part of the seat.`}>
      {() => (
        <>
          {FIFTHS.map((row, b) => {
            const cy = top + b * lane + lane / 2
            const mean = row.reduce((s, v) => s + v, 0) / row.length
            return (
              <g key={b} data-fifth={b}>
                {FIFTH_LABELS[b] && <Label x={0} y={cy + 4} size={10.5} bold={b !== 2} fill={b === 2 ? SUBTLE : TEXT}>{FIFTH_LABELS[b]}</Label>}
                <line x1={x0} x2={x1} y1={cy} y2={cy} stroke="var(--color-border)" />
                {row.map((t, i) => (
                  <circle key={i} className="legend-art__cell" style={{ animationDelay: `${0.1 + b * 0.12}s` }} cx={sx(t)} cy={cy} r={4.5} fill={css(partyRgb(t * max, base, max))} stroke={b === 1 && i === 2 ? '#666' : 'var(--map-paper)'} strokeDasharray={b === 1 && i === 2 ? '2 1.5' : undefined} />
                ))}
                <line className="legend-art__cell" style={{ animationDelay: `${0.8 + b * 0.08}s` }} x1={sx(mean)} x2={sx(mean)} y1={cy - 6} y2={cy + 6} stroke={TEXT} strokeWidth={2} />
              </g>
            )
          })}
          <path d={`M${x0} 92h${x1 - x0}m-6-4 6 4-6 4`} fill="none" stroke={SUBTLE} strokeWidth={1.2} strokeLinecap="round" />
          <Label x={x0} y={106} size={10.5} fill={SUBTLE}>0%</Label>
          <Label x={(x0 + x1) / 2} y={106} anchor="middle" size={10.5} fill={SUBTLE}>{`${partyName} share`}</Label>
          <Label x={x1} y={106} anchor="end" size={10.5} fill={SUBTLE}>{`${max}%+`}</Label>
          <line x1={12} x2={12} y1={120} y2={132} stroke={TEXT} strokeWidth={2} />
          <Label x={22} y={130}>Average of the fifth</Label>
          <circle cx={196} cy={126} r={5} fill={css(partyRgb(max * 0.5, base, max))} stroke="#666" strokeDasharray="2 1.5" />
          <Label x={208} y={130}>Stood in part of the seat</Label>
        </>
      )}
    </Art>
  )
}

/** The Strongest lens's picture for what is showing (Simon: the seat profile gets its own). Other votes has none. */
export function StrongestArt({ top, base, max, partyName }: { top: StrongestTop; base: Rgb; max: number; partyName: string }) {
  const kind = strongestArtFor(top)
  if (kind === 'strength') return <StrengthArt base={base} max={max} partyName={partyName} />
  if (kind === 'profile') return <ProfileArt base={base} max={max} partyName={partyName} />
  return null
}

/**
 * Similar: your seat in the middle, threads out to the 5 most alike (often far away), the next 15 faintly shaded, then
 * the ranks the list carries on (25, then 42). The look is the lens's sand (similar.css), so the picture matches the map.
 */
export function SimilarArt() {
  return (
    <>
      <Art name="similar" height={126} title="Your seat in the middle, with threads to the 5 seats most alike as places, often far away. The next 15 are faintly shaded; then come 25 and 42 more, in rank order.">
        {() => (
          <>
            {SIM_FIFTEEN.map((p, i) => (
              <polygon key={`f${i}`} className="lens-art__sim15 legend-art__cell" style={{ animationDelay: `${0.9 + (i % 5) * 0.06}s` }} points={hexPoints(p.x, p.y, p.r)} />
            ))}
            {SIM_FIVE.map((p, i) => (
              <g key={`t${i}`}>
                <path className="lens-art__case" d={threadPath(SIM_CENTRE, p)} />
                <path className="lens-art__thread legend-art__draw" style={{ animationDelay: `${0.1 + i * 0.12}s` }} d={threadPath(SIM_CENTRE, p)} />
              </g>
            ))}
            {SIM_FIVE.map((p, i) => (
              <polygon key={`v${i}`} className="lens-art__sim5 legend-art__step" style={{ animationDelay: `${0.5 + i * 0.12}s` }} points={hexPoints(p.x, p.y, p.r)} />
            ))}
            <polygon className="lens-art__simme" points={hexPoints(SIM_CENTRE.x, SIM_CENTRE.y, SIM_CENTRE.r)} />
            <polygon className="lens-art__simme" points={hexPoints(232, 18, 8)} />
            <Label x={246} y={22}>Your seat</Label>
            <polygon className="lens-art__sim5" points={hexPoints(232, 46, 8)} />
            <Label x={246} y={50}>5 most alike</Label>
            <polygon className="lens-art__sim15" points={hexPoints(232, 74, 8)} />
            <Label x={246} y={78}>Next 15</Label>
            <polygon className="lens-art__simrest" points={hexPoints(232, 102, 8)} />
            <Label x={246} y={106}>Then 25, then 42</Label>
          </>
        )}
      </Art>
      {/* The SpatialSearch credit is the key's own last line (VE-312, SimilarLens), so the picture does not repeat it. */}
    </>
  )
}

/** The example race in the big hexagon: the 2022 holder ahead early, then trailing (y down; the middle line is y 58). */
const RACE_MID = 58
const RACE_LINE: readonly (readonly [number, number])[] = [
  [24, 44], [36, 36], [48, 40], [60, 46], [72, 52], [84, 68], [96, 72],
]
const racePath = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('')
/** The small hexes' lines, the same race at a third of the size. */
const smallLine = (cx: number, cy: number) => `M${cx - 9} ${cy - 3}L${cx - 4} ${cy - 6}L${cx + 1} ${cy - 2}L${cx + 5} ${cy + 3}L${cx + 9} ${cy + 5}`

/**
 * Race-moved: one seat's small chart drawn large. The line is the 2022 holder's lead; above the faint middle line they
 * are ahead, below they trail, and where it crosses the lead changed. Then the faded (won or certain, not at the Final)
 * and the shaded (close) seats.
 */
export function RaceMovedArt({ final, closePts }: { final: boolean; closePts: number }) {
  const cross = crossings(RACE_LINE, RACE_MID)[0] ?? 78
  return (
    <Art name="race-moved" height={140} title={`A seat's small chart: the line is the 2022 holder's lead over the night, above the faint middle line when ahead, below when behind; where it crosses, the lead changed.${final ? '' : ' Faded: won or certain.'} Shaded: a race within ${closePts} points.`}>
      {() => (
        <>
          <polygon points={hexPoints(60, 58, 50)} fill="var(--map-paper)" stroke={EDGE} strokeWidth={1.2} />
          <path d={`M20 ${RACE_MID}H100`} className="lens-art__mid" />
          <path className="lens-art__line legend-art__draw" d={racePath(RACE_LINE)} stroke="var(--party-lib)" />
          <circle className="legend-art__step" style={{ animationDelay: '0.7s' }} cx={cross} cy={RACE_MID} r={3.5} fill={TEXT} />
          <circle className="legend-art__ring" style={{ animationDelay: '0.8s' }} cx={cross} cy={RACE_MID} r={8} fill="none" stroke={TEXT} strokeWidth={1.4} />
          <Label x={124} y={24} bold>Above: ahead</Label>
          <Label x={124} y={38} size={10.5} fill={SUBTLE}>the 2022 holder leads</Label>
          <path d={`M${(cross + 7).toFixed(1)} ${RACE_MID + 4}L118 ${RACE_MID + 6}`} stroke={SUBTLE} strokeWidth={1} />
          <Label x={124} y={RACE_MID + 10} bold>Lead changed</Label>
          <Label x={124} y={88} bold>Below: behind</Label>
          <Label x={124} y={102} size={10.5} fill={SUBTLE}>they trail</Label>
          {!final && (
            <g data-testid="lens-art-faded">
              <polygon points={hexPoints(16, 126, 13)} fill="var(--map-paper)" stroke={EDGE} strokeWidth={1} />
              <path d={smallLine(16, 126)} className="lens-art__line lens-art__line--faded" stroke="var(--party-alp)" />
              <Label x={34} y={130}>Faded: won or certain</Label>
            </g>
          )}
          <g transform={final ? 'translate(-164 0)' : undefined}>
            <polygon points={hexPoints(180, 126, 13)} className="lens-art__close" stroke={EDGE} strokeWidth={1} />
            <path d={smallLine(180, 126)} className="lens-art__line lens-art__line--close" stroke="var(--party-alp)" />
            <Label x={198} y={130}>{`Shaded: within ${closePts} points`}</Label>
          </g>
        </>
      )}
    </Art>
  )
}
