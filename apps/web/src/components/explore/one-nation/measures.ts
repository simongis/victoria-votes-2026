import type { OneNationSeat } from '@vic26/schema'

/**
 * The three plain measures a seat can be sorted by (VE-101e, Simon 8 Nov): schooling, trade jobs and how crowded the
 * seat is. All three ship in the asset, so the view needs no other source. They describe seats, never the people in them.
 */
export interface Measure {
  key: 'pct_year12' | 'pct_trades_labour' | 'people_per_km2'
  /** The button's words. */
  chip: string
  /** What the bands are sorted by, after "fifth of seats for". */
  noun: string
  /** The measure's value in a band's range, in plain words. */
  fmt: (n: number) => string
}

const whole = (n: number) => `${Math.round(n)}%`

export const MEASURES: readonly Measure[] = [
  { key: 'pct_year12', chip: 'Year 12', noun: 'adults who finished Year 12', fmt: whole },
  { key: 'pct_trades_labour', chip: 'Trade jobs', noun: 'jobs in trades and labouring', fmt: whole },
  {
    key: 'people_per_km2',
    chip: 'Density',
    noun: 'people per square kilometre',
    fmt: (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n))),
  },
]

/** One seat's value for a measure, or null where there is none. */
export function valueOf(m: Measure, seat: OneNationSeat): number | null {
  const v = seat[m.key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
