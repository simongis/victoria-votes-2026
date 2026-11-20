import { useMemo, useState } from 'react'
import type { Seat } from '../../derive/seats'
import { css, usePalette } from '../../theme/theme'
import { leaderRgb, stepRgb } from '../../views/encoding'
import { useLikeData, useLikeSummary, usePicked } from '../explore/like/likeStore'
import { LensPanel, type LensRowView } from './LensPanel'
import { likeRows, voteLine, type LikeRow } from './like'

const MARK_W = 58
const BAR_H = 8

/** A bar for how alike a seat is: longer means closer to the picked seat. Drawn against the farthest seat on show. */
function AlikeMark({ closeness }: { closeness: number }) {
  const w = Math.max(2, closeness * MARK_W)
  return (
    <svg width={MARK_W} height={BAR_H} viewBox={`0 0 ${MARK_W} ${BAR_H}`} focusable="false">
      <rect width={MARK_W} height={BAR_H} rx="2" fill="var(--color-border)" />
      <rect data-testid="like-bar" width={w} height={BAR_H} rx="2" fill="var(--color-navy)" />
    </svg>
  )
}

const sentence = (r: LikeRow): string =>
  r.isPicked ? `${r.name}: the seat you picked. ${voteLine(r.seat)}.` : r.rank !== null ? `${r.name}: number ${r.rank} most like the picked seat. ${voteLine(r.seat)}.` : `${r.name}: ${voteLine(r.seat)}.`

/**
 * The Seats-like-this lens's panel (VE-135): with a seat picked, itself first and then every seat nearest first, the
 * five nearest numbered; with nothing picked, every seat by name so the list doubles as a way to pick. The pick lives
 * in likeStore (the lens owns it). Rows and words are in like.ts.
 */
export function LikePanel({ seats }: { seats: ReadonlyMap<number, Seat> }) {
  const pal = usePalette()
  const picked = usePicked()
  const data = useLikeData()
  const [query, setQuery] = useState('')
  const z = data && data !== 'failed' ? data.z : null
  const rows = useMemo(() => (z ? likeRows(seats.values(), z, picked) : []), [seats, z, picked])
  const summary = useLikeSummary(seats)
  const q = query.trim().toLowerCase()
  const far = useMemo(() => Math.max(0, ...rows.map((r) => r.distance ?? 0)), [rows])
  const views: LensRowView[] = useMemo(
    () =>
      rows
        .filter((r) => q === '' || r.name.toLowerCase().includes(q))
        .map((r) => ({
          id: r.id,
          name: r.name,
          colour: css(r.seat.leader ? leaderRgb(r.seat, pal) : r.seat.base ? stepRgb(r.seat.base, 2, pal) : pal.noResult),
          mark: r.distance === null ? null : <AlikeMark closeness={far > 0 ? 1 - r.distance / far : 1} />,
          value: r.isPicked ? 'You' : r.rank !== null ? `#${r.rank}` : '-',
          words: sentence(r),
        })),
    [rows, q, pal, far],
  )
  return <LensPanel summary={summary} unit="Seats nearest the one you picked first" filters={[]} filter={null} onFilter={() => undefined} query={query} onQuery={setQuery} rows={views} />
}
