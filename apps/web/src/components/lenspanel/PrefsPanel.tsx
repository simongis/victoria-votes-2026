import { useMemo, useState } from 'react'
import { OUTRIGHT_PCT, xFor } from '../../derive/prefs'
import { css, usePalette, type Palette } from '../../theme/theme'
import { leaderCss } from '../../views/encoding'
import { LensPanel, type LensFilterChip, type LensRowView } from './LensPanel'
import { filterPrefs, prefsCounts, prefsSentence, type PrefsFilter, type PrefsRow } from './prefs'

const FILTERS: { key: PrefsFilter; label: string; title: string }[] = [
  { key: 'decide', label: 'Preferences decide', title: 'Seats where nobody has half the first preferences' },
  { key: 'outright', label: 'Wins outright', title: 'Seats where the first-preference leader already has half' },
]

const MARK_W = 58
const MARK_H = 16
const PAD = 5

/** The party dot on the lens's own scale (20 to 85%), with the 50% line beside it. */
function PrefsMark({ row, pal }: { row: PrefsRow; pal: Palette }) {
  const x50 = xFor(OUTRIGHT_PCT, MARK_W, PAD, PAD)
  return (
    <svg width={MARK_W} height={MARK_H} viewBox={`0 0 ${MARK_W} ${MARK_H}`} focusable="false">
      <line x1={PAD} x2={MARK_W - PAD} y1={MARK_H / 2} y2={MARK_H / 2} stroke="var(--color-border)" />
      <line x1={x50} x2={x50} y1="1" y2={MARK_H - 1} stroke="var(--color-text-subtle)" strokeWidth="1" />
      {row.pct !== null && row.party && <circle data-testid="prefs-mark" cx={xFor(row.pct, MARK_W, PAD, PAD)} cy={MARK_H / 2} r="4.2" fill={css(pal.party[row.party])} />}
    </svg>
  )
}

/** The Preferences lens's panel (VE-125b): seats closest to 50% first, the leader's dot and share. Rows and words are in prefs.ts. */
export function PrefsPanel({ rows, summary }: { rows: readonly PrefsRow[]; summary: string }) {
  const pal = usePalette()
  const [filter, setFilter] = useState<PrefsFilter | null>(null)
  const [query, setQuery] = useState('')
  const counts = useMemo(() => prefsCounts(rows), [rows])
  const shown = useMemo(() => filterPrefs(rows, filter, query), [rows, filter, query])
  const chips: LensFilterChip[] = FILTERS.map((f) => ({ ...f, count: counts[f.key] }))
  const views: LensRowView[] = useMemo(
    () => shown.map((r) => ({ id: r.id, name: r.name, colour: leaderCss(r.seat, pal), mark: <PrefsMark row={r} pal={pal} />, value: r.pct === null ? '-' : `${r.pct.toFixed(1)}%`, words: prefsSentence(r) })),
    [shown, pal],
  )
  return <LensPanel summary={summary} unit="Leader's share of first preferences" filters={chips} filter={filter} onFilter={(k) => setFilter(k as PrefsFilter | null)} query={query} onQuery={setQuery} rows={views} />
}
