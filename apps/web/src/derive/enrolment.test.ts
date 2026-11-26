import { describe, expect, it } from 'vitest'
import type { DistrictHistoryRow, DistrictStatic } from '@vic26/schema'
import { enrolmentByDistrict, enrolmentOf, staticEnrolment, statewidePct } from './enrolment'

const row = (district_id: number, fp_total: number, pct_counted: number | null): DistrictHistoryRow =>
  ({ district_id, fp_total, pct_counted }) as DistrictHistoryRow
const st = (district_id: number, enrolment: number | null): DistrictStatic => ({ district_id, enrolment }) as DistrictStatic

describe('enrolmentOf', () => {
  it('works back from votes and percent counted', () => {
    expect(enrolmentOf(row(1, 20_000, 40))).toBe(50_000)
  })
  it('is null where either figure is missing or the percent is zero (never a wrong number)', () => {
    expect(enrolmentOf(row(1, 0, 0))).toBeNull()
    expect(enrolmentOf(row(1, 20_000, null))).toBeNull()
    expect(enrolmentOf({ district_id: 1, fp_total: null, pct_counted: 40 } as unknown as DistrictHistoryRow)).toBeNull()
  })
})

describe('enrolmentByDistrict', () => {
  it('takes the figure from the tick with the most counted, where rounding matters least', () => {
    const m = enrolmentByDistrict([row(1, 500, 1), row(1, 40_000, 80)], [st(1, 99_999)])
    expect(m.get(1)).toBe(50_000)
  })
  it('ignores the static (2022) enrolment where the seat has reported', () => {
    expect(enrolmentByDistrict([row(1, 20_000, 40)], [st(1, 10)]).get(1)).toBe(50_000)
  })
  it('scales the static figure by how far the reported seats have moved, for seats yet to report', () => {
    // Seat 1: static 40,000, really 50,000 (x1.25). Seat 2 has not reported: 40,000 x 1.25.
    const m = enrolmentByDistrict([row(1, 20_000, 40), row(2, 0, 0)], [st(1, 40_000), st(2, 40_000)])
    expect(m.get(2)).toBe(50_000)
  })
  it('leaves a seat out (so it shows a dash) when nothing can be derived', () => {
    const m = enrolmentByDistrict([row(2, 0, 0)], [st(2, 40_000)])
    expect(m.has(2)).toBe(false)
  })
})

describe('staticEnrolment', () => {
  it('uses the static figure as it stands (replay: 2022 data on 2022 enrolment)', () => {
    expect(staticEnrolment([st(1, 40_000), st(2, null)])).toEqual(new Map([[1, 40_000]]))
  })
})

describe('statewidePct', () => {
  const enrol = new Map([[1, 50_000], [2, 50_000]])
  it('is votes over the summed 2026 enrolment, whatever the static field says', () => {
    expect(statewidePct([row(1, 20_000, 40), row(2, 0, 0)], enrol)).toBe(20)
  })
  it('is 0 with no enrolment', () => {
    expect(statewidePct([row(1, 20_000, 40)], new Map())).toBe(0)
  })
})
