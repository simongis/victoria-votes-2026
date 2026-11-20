/**
 * The Counted lens's panel (VE-125b): every seat ranked by how much is counted, least first, from the same pct_counted the
 * stage colours by. Pure, so the ranking, filters and words are tested without a browser.
 */
import type { DistrictStatic } from '@vic26/schema'
import { NIGHT_SCALE, countedStep, type CountedScale, type CountedStep } from '../../derive/colour'
import type { Seat } from '../../derive/seats'
import { countedWord } from '../../derive/turnout'

/**
 * The stage's own four steps (VE-194, FB-225): a chip is a band of the legend, so its count is the seats painted that step.
 * (It was three chips with the middle two merged, which read as a different scale from the key.) The cuts are the scale's
 * (25, 50, 75 through the night, spread over the real range at Final, VE-170).
 */
export type CountedFilter = CountedStep

/**
 * A band's short form with a percent sign, for the chips and the key alike: "<25%" and "75%+" already have one, "25-50" and
 * "81-83" do not (Simon, 15 Nov: "add % to legend chips"). Pure text, so the two cannot drift.
 */
export const bandLabel = (short: string): string => (short.includes('%') ? short : `${short}%`)

export interface CountedRow {
  id: number
  name: string
  seat: Seat
  /** Percent of enrolment counted; null where nothing is in. */
  pct: number | null
  filter: CountedFilter | null
}

/** Least counted first; seats with no figure last. Name breaks ties so the order is stable from one tick to the next. */
export function countedRows(seats: Iterable<Seat>, scale: CountedScale = NIGHT_SCALE): CountedRow[] {
  return [...seats]
    .map((seat): CountedRow => ({ id: seat.id, name: seat.name, seat, pct: seat.pct, filter: countedStep(seat.pct, scale.cuts) }))
    .sort((a, b) => (a.pct === null ? 1 : 0) - (b.pct === null ? 1 : 0) || (a.pct ?? 0) - (b.pct ?? 0) || a.name.localeCompare(b.name))
}

/** The statewide figure is enrolment-weighted where every counted seat has enrolment, else a plain mean. */
export function countedSummary(rows: readonly CountedRow[], statics: ReadonlyMap<number, DistrictStatic>, final = false): string {
  const counted = rows.filter((r) => r.pct !== null)
  if (counted.length === 0) return 'Nothing counted yet.'
  const enrol = (r: CountedRow): number => statics.get(r.id)?.enrolment ?? 0
  const weighted = counted.every((r) => enrol(r) > 0)
  const avg = weighted
    ? counted.reduce((a, r) => a + enrol(r) * r.pct!, 0) / counted.reduce((a, r) => a + enrol(r), 0)
    : counted.reduce((a, r) => a + r.pct!, 0) / counted.length
  const slow = counted[0]!
  // VE-165: at Final a finished seat stops near 85 to 90%, so the figure is turnout and the lowest seat is not "slow".
  if (final) return `${Math.round(avg)}% turnout; lowest: ${slow.name} ${Math.round(slow.pct!)}%.`
  return `${Math.round(avg)}% counted across Victoria; slowest: ${slow.name} ${Math.round(slow.pct!)}%.`
}

/** Seats in each of the four bands, lowest first (over every row, so a chip says what it would show). */
export function countedCounts(rows: readonly CountedRow[]): [number, number, number, number] {
  const c: [number, number, number, number] = [0, 0, 0, 0]
  for (const r of rows) if (r.filter !== null) c[r.filter] += 1
  return c
}

export function filterCounted(rows: readonly CountedRow[], filter: CountedFilter | null, query: string): CountedRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => (filter === null || r.filter === filter) && (q === '' || r.name.toLowerCase().includes(q)))
}

/** The stage pill's own words, for a row's tooltip and screen readers. */
export const countedSentence = (r: CountedRow, final = false): string =>
  r.pct === null ? `${r.name}: nothing counted yet.` : `${r.name}: ${Math.round(r.pct)}% ${countedWord(final)}.`
