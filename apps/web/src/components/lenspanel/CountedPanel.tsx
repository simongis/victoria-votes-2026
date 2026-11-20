import { useMemo, useState } from 'react'
import type { CountedScale } from '../../derive/colour'
import { usePalette } from '../../theme/theme'
import { leaderCss } from '../../views/encoding'
import { LensPanel, type LensFilterChip, type LensRowView } from './LensPanel'
import { bandLabel, countedCounts, countedSentence, filterCounted, type CountedFilter, type CountedRow } from './counted'

/** One chip a band of the legend, the same words with a % (VE-194). The tooltip spells the range out. */
const BAND_TITLES = ['Seats with under a quarter of enrolled voters counted', 'Seats a quarter to half counted', 'Seats half to three quarters counted', 'Seats with three quarters or more counted'] as const

const MARK_W = 58
const BAR_H = 8

/** A navy bar at the seat's % counted on a faint track, the way the stage's navy ramp reads: longer and darker is more counted. */
function CountedMark({ pct }: { pct: number | null }) {
  const w = pct === null ? 0 : Math.max(2, (Math.min(100, pct) / 100) * MARK_W)
  return (
    <svg width={MARK_W} height={BAR_H} viewBox={`0 0 ${MARK_W} ${BAR_H}`} focusable="false">
      <rect width={MARK_W} height={BAR_H} rx="2" fill="var(--color-border)" />
      {pct !== null && <rect data-testid="counted-bar" width={w} height={BAR_H} rx="2" fill="var(--color-navy)" />}
    </svg>
  )
}

/** The Counted lens's panel (VE-125b): seats least counted first, a navy bar and the %. Rows and words are in counted.ts. */
export function CountedPanel({ rows, summary, final = false, scale }: { rows: readonly CountedRow[]; summary: string; /** VE-165: at Final the figure is turnout. */ final?: boolean; /** VE-170: the steps the stage uses, so the chips name the same ranges. */ scale: CountedScale }) {
  const pal = usePalette()
  const [filter, setFilter] = useState<CountedFilter | null>(null)
  const [query, setQuery] = useState('')
  const counts = useMemo(() => countedCounts(rows), [rows])
  const shown = useMemo(() => filterCounted(rows, filter, query), [rows, filter, query])
  const chips: LensFilterChip[] = scale.short.map((s, i) => ({ key: String(i), label: bandLabel(s), title: final ? `Seats with ${scale.labels[i]} turnout` : BAND_TITLES[i]!, count: counts[i]! }))
  const views: LensRowView[] = useMemo(
    () => shown.map((r) => ({ id: r.id, name: r.name, colour: leaderCss(r.seat, pal), mark: <CountedMark pct={r.pct} />, value: r.pct === null ? '-' : `${Math.round(r.pct)}%`, words: countedSentence(r, final) })),
    [shown, pal, final],
  )
  return <LensPanel summary={summary} unit={final ? "Turnout: percent of enrolled voters" : "Percent of enrolled voters counted"} filters={chips} filter={filter === null ? null : String(filter)} onFilter={(k) => setFilter(k === null ? null : (Number(k) as CountedFilter))} query={query} onQuery={setQuery} rows={views} />
}
