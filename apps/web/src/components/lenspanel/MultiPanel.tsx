import { useMemo, useState } from 'react'
import { sparkPath } from '../../derive/pulse'
import { leaderCss, stepRgb } from '../../views/encoding'
import { css, usePalette } from '../../theme/theme'
import { LensPanel, type LensFilterChip, type LensRowView } from './LensPanel'
import { multiSentence, type MultiRow } from './multi'

const W = 58
const H = 18
const RANGE = 30

type Filter = 'close' | 'swung'
const FILTERS: { key: Filter; label: string; title: string }[] = [
  { key: 'close', label: 'Within 10 points', title: 'Leading seats where the lead is under 10 points' },
  { key: 'swung', label: 'Lead changed', title: 'Seats whose lead has crossed the middle line during the count' },
]
const keep = (r: MultiRow, f: Filter | null): boolean => f === null || (f === 'close' ? r.state === 'close' : r.swings > 0)

/** The seat's own line at the panel's size, so a row reads like its tile. */
function LineMark({ r, total }: { r: MultiRow; total: number }) {
  const pal = usePalette()
  const d = sparkPath(r.line, total, W, H, RANGE)
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} focusable="false">
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--color-border-strong)" strokeWidth="1" strokeDasharray="2 2" />
      {d && <path data-testid="multi-mark" d={d} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" stroke={css(r.seat.leader ? stepRgb(r.seat.leader, 2, pal) : pal.noResult)} />}
    </svg>
  )
}

/** The small-multiples lens's panel (VE-86): races ranked by closeness, with the seat's own line. Rows and words are in multi.ts. */
export function MultiPanel({ rows, summary, total }: { rows: readonly MultiRow[]; summary: string; total: number }) {
  const pal = usePalette()
  const [filter, setFilter] = useState<Filter | null>(null)
  const [query, setQuery] = useState('')
  const chips: LensFilterChip[] = FILTERS.map((f) => ({ ...f, count: rows.filter((r) => keep(r, f.key)).length }))
  const views: LensRowView[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => keep(r, filter) && (q === '' || r.name.toLowerCase().includes(q)))
      .map((r) => ({
        id: r.id,
        name: r.name,
        colour: leaderCss(r.seat, pal),
        mark: <LineMark r={r} total={total} />,
        value: r.lead === null ? '-' : `${Math.round(r.lead)}`,
        words: multiSentence(r),
      }))
  }, [rows, filter, query, pal, total])
  return <LensPanel summary={summary} unit="Lead in points, closest race first" filters={chips} filter={filter} onFilter={(k) => setFilter(k as Filter | null)} query={query} onQuery={setQuery} rows={views} />
}
