import { useMemo, useState, type ReactNode } from 'react'
import { usePalette, type Palette } from '../../theme/theme'
import { arrowLength } from '../../derive/arrows'
import { pointsAttr, taperArrow } from '../explore/arrows/taper'
import { leaderCss, partyCss } from '../../views/encoding'
import { LensPanel, type LensFilterChip, type LensRowView } from './LensPanel'
import { useFp2022 } from '../explore/arrows/fp2022'
import { biggestMover, filterSwing, shownMovers, moversText, rowSentence, swingCounts, withBaseline, type SwingFilter, type SwingRow } from './swing'

/**
 * Pixels per point for the row marks: a 10-point swing (the longest the stage draws) is 65 px. VE-117b made them larger
 * (before: 5 px a point, 50 px longest, a 58 by 28 box, a 2.4 px shaft; the box is 80 by 40 and the shape 1.3 times thicker now).
 */
const ROW_PPP = 6.5
const MARK_SCALE = 1.3
const MARK_W = 80
const MARK_H = 40
const CX = MARK_W / 2
const CY = MARK_H / 2

const FILTERS: { key: SwingFilter; label: string; title: string }[] = [
  { key: 'labor', label: 'Toward Labor', title: 'Labor v Coalition seats that swung toward Labor' },
  { key: 'coalition', label: 'Toward the Coalition', title: 'Labor v Coalition seats that swung toward the Liberals or Nationals' },
  { key: 'other', label: 'Not Labor v Coalition', title: 'Seats where the top two are not Labor and the Coalition' },
  { key: 'changed', label: 'Different contest from 2022', title: 'Labor v Coalition seats where the top two were a different pair in 2022, so there is no swing to compare' },
]

const signed = (n: number): string => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(1)}`

/** The row's mark, drawn like the stage's: the arrow at its length and colour, a level bar, a ring or a dot. */
function SwingMark({ r, pal }: { r: SwingRow; pal: Palette }) {
  const m = r.mark
  if (m.kind === 'arrow') {
    // Angled up 30 degrees as on the stage, tail at the right for Labor (points left) and at the left for the Coalition.
    const dir = m.toward === 'ALP' ? -1 : 1
    const t = taperArrow(arrowLength(m.pts, ROW_PPP), dir, true, MARK_SCALE)
    // Centre the tilted shape's bounding box (not its tail) in the 80 by 40 box, so long and short arrows share a midline.
    const xs = t.points.map((p) => p[0])
    const ys = t.points.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const ink = `var(${m.toward === 'ALP' ? '--party-alp' : '--party-lib'})`
    return (
      <svg width={MARK_W} height={MARK_H} viewBox={`0 0 ${MARK_W} ${MARK_H}`} focusable="false">
        <g transform={`translate(${CX - (minX + maxX) / 2} ${CY - (minY + maxY) / 2})`}>
          <polygon points={pointsAttr(t)} fill={ink} />
        </g>
      </svg>
    )
  }
  if (m.kind === 'flat') {
    return (
      <svg width={MARK_W} height={MARK_H} viewBox={`0 0 ${MARK_W} ${MARK_H}`} focusable="false">
        <path d={`M${CX - 6} ${CY}H${CX + 6}`} stroke="var(--color-text-subtle)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }
  if (m.kind === 'early') {
    return (
      <svg width={MARK_W} height={MARK_H} viewBox={`0 0 ${MARK_W} ${MARK_H}`} focusable="false">
        <circle cx={CX} cy={CY} r="3.8" fill="none" stroke="var(--color-text-subtle)" strokeWidth="1.5" />
      </svg>
    )
  }
  if (m.kind === 'changed') {
    // A diamond, as on the stage: the same two sides now, but not the pair the last election measured.
    return (
      <svg width={MARK_W} height={MARK_H} viewBox={`0 0 ${MARK_W} ${MARK_H}`} focusable="false">
        <rect x={CX - 3} y={CY - 3} width="6" height="6" transform={`rotate(45 ${CX} ${CY})`} fill="var(--color-text-subtle)" />
      </svg>
    )
  }
  if (m.kind === 'other' && r.detail?.party) {
    // Another contest: the biggest first-preference mover (VE-130), a triangle up for a rise and down for a fall in the
    // party's colour, taller with the points, as on the stage. Without a figure to compare, the challenger's dot.
    // VE-226 (finding 8): a party new to the seat has no change, so the triangle is the biggest real mover.
    const mover = biggestMover(r.detail.movers)
    const colour = partyCss(mover?.party ?? r.detail.party, pal)
    const c = mover?.change ?? null
    const h = c === null ? 0 : Math.min(18, Math.max(7, 6 + Math.abs(c) * 1.4))
    return (
      <svg width={MARK_W} height={MARK_H} viewBox={`0 0 ${MARK_W} ${MARK_H}`} focusable="false">
        {c === null ? (
          <circle cx={CX} cy={CY} r="3.2" fill={r.detail.early ? 'none' : colour} stroke={r.detail.early ? 'var(--color-text-subtle)' : colour} strokeWidth="1.2" />
        ) : (
          <polygon points={c >= 0 ? `${CX},${CY - h / 2} ${CX + h / 2},${CY + h / 2} ${CX - h / 2},${CY + h / 2}` : `${CX},${CY + h / 2} ${CX + h / 2},${CY - h / 2} ${CX - h / 2},${CY - h / 2}`} fill={colour} />
        )}
      </svg>
    )
  }
  return <svg width={MARK_W} height={MARK_H} viewBox={`0 0 ${MARK_W} ${MARK_H}`} focusable="false" />
}

function valueOf(r: SwingRow): ReactNode {
  if (r.size !== null) return r.size.toFixed(1)
  if (r.mark.kind === 'early') return 'Too early'
  if (r.mark.kind === 'notin') return 'No count'
  const d = r.detail
  if (!d || d.party === null) return '-'
  if (d.early) return 'Too early'
  if (d.movers.length > 0) return <span className="swing__movers">{shownMovers(d.movers).map((m) => <span key={m.party}>{moversText([m], r.seat.baseNote || '2022')}</span>)}</span>
  return d.change !== null ? signed(d.change) : d.share !== null ? `${d.share.toFixed(1)}%` : '-'
}

/**
 * The swing lens's panel (FB-138): every seat ranked by the two-candidate swing, biggest first, with the stage's arrow beside
 * it, and the other contests showing the challenger's first preferences. The rows and the words are in swing.ts.
 */
export function SwingPanel({ rows: built, summary }: { rows: readonly SwingRow[]; summary: string }) {
  const pal = usePalette()
  // The 2022 first preferences load with the panel (ADR 0028); until they do, or if they fail their checks, the other contests keep today's plain rows.
  const ids = useMemo(() => new Set(built.map((r) => r.id)), [built])
  const baseline = useFp2022(ids)
  const rows = useMemo(() => withBaseline(built, baseline), [built, baseline])
  const [filter, setFilter] = useState<SwingFilter | null>(null)
  const [query, setQuery] = useState('')
  const counts = useMemo(() => swingCounts(rows), [rows])
  const shown = useMemo(() => filterSwing(rows, filter, query), [rows, filter, query])
  // The "different contest" chip appears only when a seat has it, so most nights the key stays three short chips.
  const chips: LensFilterChip[] = FILTERS.filter((f) => f.key !== 'changed' || counts.changed > 0).map((f) => ({ ...f, count: counts[f.key] }))
  const views: LensRowView[] = useMemo(
    () => shown.map((r) => ({ id: r.id, name: r.name, colour: leaderCss(r.seat, pal), mark: <SwingMark r={r} pal={pal} />, value: valueOf(r), words: rowSentence(r) })),
    [shown, pal],
  )
  const unit = filter === 'other' ? 'Change in first preferences, points' : 'Points of swing since the last election'
  return <LensPanel summary={summary} unit={unit} filters={chips} filter={filter} onFilter={(k) => setFilter(k as SwingFilter | null)} query={query} onQuery={setQuery} rows={views} />
}
