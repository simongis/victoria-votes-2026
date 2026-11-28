import { useId, type ReactNode } from 'react'
import type { PartyBucket } from '@vic26/schema'
import { EMPTY_ALPHA, EMPTY_STRIPE, HATCH_BASE, HATCH_BASE_ALPHA, HATCH_STRIPE, TRUST_NA, TRUST_NA_ALPHA, lvcRgb } from '../../derive/colour'
import type { Tally } from '../../derive/seats'
import { MAJORITY, SEATS } from '../../derive/seats'
import { useMotion } from '../../state/motion'
import { css, usePalette } from '../../theme/theme'
import { partyCss, stepRgb, type LeadStep } from '../../views/encoding'
import { matrixParties } from '../leaderKeyParties'
import { PARTY_NAMES } from '../../parties'
import { pointsAttr, taperArrow } from '../explore/arrows/taper'
import { hexPoints, svgId } from './legendArt'
import '../../styles/legend-art.css'

/**
 * VE-303: the small illustrated legends at the top of the header "i", one per map mode, in the style of the swing arrows
 * (ArrowsExplain) and the Changed hands diagram: one of each mark the map draws, with a two- or three-word label. Labels
 * count toward the "i" word budget, so they stay short. Each plays once when the sheet opens (a hex stepping through its
 * strengths, an arrow growing, a ring pulsing) unless motion is off (?motion=0 or a stored choice); the CSS also drops all
 * movement under prefers-reduced-motion. Nothing loops.
 */

const TEXT = 'var(--color-text)'
const SUBTLE = 'var(--color-text-subtle)'
const EDGE = 'var(--color-border-strong)'
const NO_FIGURES_FILL = `color-mix(in srgb, var(--map-no-result) ${EMPTY_ALPHA * 100}%, var(--map-paper))`
const NA_FILL = `color-mix(in srgb, ${TRUST_NA} ${TRUST_NA_ALPHA * 100}%, var(--map-paper))`
const HATCH_FILL = `color-mix(in srgb, ${HATCH_BASE} ${HATCH_BASE_ALPHA * 100}%, var(--map-paper))`

/** "on" only when the visitor has animations on; the CSS keys every movement off this. */
function useAnim(): 'on' | 'off' {
  return useMotion().mode === 'full' ? 'on' : 'off'
}

function Art({ name, title, height, children, extraClass }: { name: string; title: string; height: number; children: (id: (n: string) => string) => ReactNode; /** Kept for older specs (gains-diagram, VE-302). */ extraClass?: string }) {
  const reactId = useId()
  const anim = useAnim()
  const id = (n: string) => svgId(reactId, n)
  return (
    <svg className={`legend-art legend-art--${name}${extraClass ? ` ${extraClass}` : ''}`} data-testid={`legend-art-${name}`} data-anim={anim} viewBox={`0 0 360 ${height}`} role="img" aria-labelledby={id('t')} style={{ display: 'block', width: '100%', maxWidth: 360, height: 'auto' }}>
      <title id={id('t')}>{title}</title>
      {children(id)}
    </svg>
  )
}

/** Diagonal stripes, as the map draws "no figures" and "too early". */
function Stripes({ id, ink, base, w }: { id: string; ink: string; base: string; w: number }) {
  return (
    <pattern id={id} width={w + 2.5} height={w + 2.5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={w + 2.5} height={w + 2.5} fill={base} />
      <rect width={w} height={w + 2.5} fill={ink} />
    </pattern>
  )
}

const Label = ({ x, y, children, anchor = 'middle', size = 11, bold }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: number; bold?: boolean }) => (
  <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={bold ? 700 : undefined} fill={TEXT}>
    {children}
  </text>
)

/**
 * Leader (VE-308, round 2 pick L2 "The full key"; VE-312: Labor, Liberal, Nationals and Greens always, then any other
 * party leading a seat), each at its three
 * strengths, so any seat's colour can be matched. The columns fill left to right once; then the declared tick and the
 * striped "no figures".
 */
export function LeaderArt({ tally }: { tally?: Tally }) {
  const pal = usePalette()
  const parties = tally ? matrixParties(tally) : (['ALP', 'LIB', 'NAT', 'GRN'] as PartyBucket[])
  const steps: LeadStep[] = [0, 1, 2]
  const ROW = 19
  const top = 21
  const arrowY = top + parties.length * ROW + 6
  const footY = arrowY + 30
  return (
    <Art name="leader" height={footY + 10} title="Key: each leading party's colour at three strengths, early, likely and won. A tick marks a seat the VEC has declared. Striped seats have no figures yet.">
      {(id) => (
        <>
          <defs>
            <Stripes id={id('none')} ink={EMPTY_STRIPE} base={NO_FIGURES_FILL} w={1.5} />
          </defs>
          {['Early', 'Likely', 'Won'].map((w, i) => (
            <text key={w} x={158 + i * 66} y={12} textAnchor="middle" fontSize={11} fill={SUBTLE}>{w}</text>
          ))}
          {parties.map((q, r) => (
            <g key={q} data-row={q}>
              <Label x={120} y={top + r * ROW + 11} anchor="end" size={11.5}>{PARTY_NAMES[q]}</Label>
              {steps.map((s) => (
                <rect key={s} className="legend-art__cell" style={{ animationDelay: `${0.15 + s * 0.45 + r * 0.05}s` }} x={128 + s * 66} y={top + r * ROW} width={60} height={15} rx={3} fill={css(stepRgb(q, s, pal))} />
              ))}
            </g>
          ))}
          <path className="legend-art__draw" style={{ animationDelay: '1.4s' }} d={`M128 ${arrowY}h190m-6-4 6 4-6 4`} fill="none" stroke={SUBTLE} strokeWidth={1.2} strokeLinecap="round" />
          <text x={223} y={arrowY + 14} textAnchor="middle" fontSize={10} fill={SUBTLE}>more sure</text>
          <polygon points={hexPoints(18, footY - 4, 8)} fill={css(stepRgb(parties[0] ?? 'ALP', 2, pal))} />
          <text x={18} y={footY} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">{'✓'}</text>
          <Label x={31} y={footY} anchor="start">Declared</Label>
          <polygon points={hexPoints(128, footY - 4, 8)} fill={`url(#${id('none')})`} stroke={EDGE} strokeWidth={1} />
          <Label x={141} y={footY} anchor="start">No figures yet</Label>
        </>
      )}
    </Art>
  )
}

/** Swing: an arrow each way from the middle, in the colour it swings toward; then the two marks with no swing to show. */
export function SwingArt() {
  const left = taperArrow(118, -1, false, 1.6)
  const right = taperArrow(118, 1, false, 1.6)
  return (
    // The Swing map's colour depth is how safe the seat is (the grid below), not the swing's size, so the arrows say direction only.
    <Art name="swing" height={86} title="Red seats swung toward Labor since 2022, blue toward the Coalition. Pale outlined seats are not Labor v Coalition. Hatched seats are too early to compare.">
      {(id) => (
        <>
          <defs>
            <Stripes id={id('hatch')} ink={HATCH_STRIPE} base={HATCH_FILL} w={2} />
          </defs>
          <path d="M180 6v30" stroke={SUBTLE} strokeWidth={1} strokeDasharray="2 3" />
          <g transform="translate(174 21)">
            <polygon className="legend-art__grow legend-art__grow--l" points={pointsAttr(left)} fill="var(--party-alp)" />
          </g>
          <g transform="translate(186 21)">
            <polygon className="legend-art__grow legend-art__grow--r" points={pointsAttr(right)} fill="var(--party-lib)" />
          </g>
          <Label x={116} y={50}>Toward Labor</Label>
          <Label x={250} y={50}>Toward the Coalition</Label>
          <polygon points={hexPoints(22, 70, 11)} fill={NA_FILL} stroke="var(--color-text-subtle)" strokeWidth={1.2} />
          <Label x={40} y={74} anchor="start">Not Labor v Coalition</Label>
          <polygon points={hexPoints(212, 70, 11)} fill={`url(#${id('hatch')})`} stroke={EDGE} strokeWidth={1} />
          <Label x={230} y={74} anchor="start">Too early</Label>
        </>
      )}
    </Art>
  )
}

/** Labor v Coalition: the five margin steps each way, darkest at the ends, and the pale seats outside the contest. */
export function LvcArt() {
  const pal = usePalette()
  const cell = 30
  const steps = [4, 3, 2, 1, 0] as const
  return (
    <Art name="lvc" height={96} title="Red where Labor leads, blue where the Coalition leads, darker the bigger the lead, in five steps each way. Pale seats are not Labor v Coalition.">
      {() => (
        <>
          {steps.map((s, i) => (
            <rect key={`l${s}`} className="legend-art__cell" style={{ animationDelay: `${(4 - i) * 0.12}s` }} x={30 + i * cell} y={8} width={cell - 2} height={20} rx={3} fill={css(lvcRgb(true, s, pal))} />
          ))}
          {steps.map((s, i) => (
            <rect key={`c${s}`} className="legend-art__cell" style={{ animationDelay: `${(4 - i) * 0.12}s` }} x={332 - (i + 1) * cell} y={8} width={cell - 2} height={20} rx={3} fill={css(lvcRgb(false, s, pal))} />
          ))}
          <Label x={30} y={44} anchor="start" bold>Labor ahead</Label>
          <Label x={330} y={44} anchor="end" bold>Coalition ahead</Label>
          <path d="M118 58H40m6-4-6 4 6 4M242 58h78m-6-4 6 4-6 4" fill="none" stroke={SUBTLE} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
          <Label x={180} y={62} size={10.5}>darker = larger margin</Label>
          <polygon points={hexPoints(42, 82, 10)} fill={NA_FILL} stroke="var(--color-text-subtle)" strokeWidth={1.2} />
          <Label x={58} y={86} anchor="start">Not Labor v Coalition</Label>
        </>
      )}
    </Art>
  )
}

/** Changed hands (VE-302, polished): the same seat in 2022 and tonight, the dark edge marking the change. */
export function GainsArt() {
  return (
    <Art name="gains" extraClass="gains-diagram" height={92} title="A seat held by Labor in 2022 that a Liberal now leads is drawn with a dark outline: it has changed hands.">
      {() => (
        <>
          <polygon points={hexPoints(60, 36, 24)} fill="var(--party-alp)" stroke={EDGE} strokeWidth={1} />
          <Label x={60} y={80} size={12}>2022: Labor</Label>
          <path className="legend-art__grow legend-art__grow--r" d="M100 36h108m-9-7 9 7-9 7" fill="none" stroke={SUBTLE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <polygon className="legend-art__step" style={{ animationDelay: '0.5s' }} points={hexPoints(260, 36, 24)} fill="var(--party-lib)" stroke="var(--pick-ink)" strokeWidth={3.2} strokeLinejoin="round" />
          <Label x={260} y={80} size={12}>Tonight: Liberal leads</Label>
        </>
      )}
    </Art>
  )
}

/**
 * Polling places (VE-308, round 2 pick P1 "Three rules"): size, colour and status, one row each in two or three words.
 * The dots grow in and the ring pulses once.
 */
export function PlacesArt({ final }: { final?: boolean }) {
  const pal = usePalette()
  const parties: PartyBucket[] = ['ALP', 'LIB', 'NAT', 'GRN']
  return (
    <Art name="places" height={104} title="Bigger dot, more votes. A dot's colour is the party with the most first preferences there. A faint dot has no figures yet; a ring means just counted.">
      {() => (
        <>
          {[4, 7, 11].map((r, i) => (
            <circle key={r} className="legend-art__step" style={{ animationDelay: `${i * 0.2}s` }} cx={[10, 28, 54][i]} cy={18} r={r} fill={SUBTLE} />
          ))}
          <Label x={80} y={22} anchor="start" size={11.5}>More votes</Label>
          {parties.map((q, i) => (
            <circle key={q} className="legend-art__step" style={{ animationDelay: `${0.7 + i * 0.12}s` }} cx={10 + i * 19} cy={52} r={7} fill={partyCss(q, pal)} />
          ))}
          <Label x={88} y={56} anchor="start" size={11.5}>Topped the first count</Label>
          {!final && (
            <>
              <circle cx={10} cy={86} r={7} fill={SUBTLE} opacity={0.22} />
              <Label x={24} y={90} anchor="start" size={11.5}>None yet</Label>
            </>
          )}
          <g transform={`translate(${final ? 10 : 150} 86)`}>
            <circle r={6} fill="var(--party-alp)" />
            <circle className="legend-art__ring" style={{ animationDelay: '1.5s' }} r={11} fill="none" stroke="var(--party-alp)" strokeWidth={1.6} opacity={0.45} />
          </g>
          <Label x={final ? 28 : 168} y={90} anchor="start" size={11.5}>Just counted</Label>
        </>
      )}
    </Art>
  )
}

/** The race to 45, shared by every mode: two lanes and the line both are racing to. */
export function RaceArt() {
  const at = (n: number) => 20 + (n / 60) * 300
  return (
    <Art name="race" height={58} title={`Two lanes race to the line at ${MAJORITY}: ${MAJORITY} of ${SEATS} seats wins a majority.`}>
      {() => (
        <>
          <rect x={20} y={10} width={300} height={10} rx={2} fill="var(--color-border-strong)" opacity={0.35} />
          <rect className="legend-art__lane" x={20} y={10} width={at(38) - 20} height={10} rx={2} fill="var(--party-alp)" />
          <rect x={20} y={26} width={300} height={10} rx={2} fill="var(--color-border-strong)" opacity={0.35} />
          <rect className="legend-art__lane" style={{ animationDelay: '0.15s' }} x={20} y={26} width={at(29) - 20} height={10} rx={2} fill="var(--party-lib)" />
          <path d={`M${at(MAJORITY)} 4v38`} stroke={TEXT} strokeWidth={1.6} strokeDasharray="3 2" />
          <Label x={at(MAJORITY)} y={54} bold>{MAJORITY} wins</Label>
        </>
      )}
    </Art>
  )
}
