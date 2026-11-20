import { describe, expect, it } from 'vitest'
import { buildProfile, formatFigure, rankPhrase, MEASURES, parseSeries, rankHigh, stripPosition, type ChangeRow, type DemoRow } from './profile'

// 10 synthetic districts; id 1 is the outlier we care about.
const change = (id: number, o: Partial<ChangeRow> = {}): ChangeRow => ({
  district_id: id,
  pop_2021: 50000,
  pop_2025: 55000,
  pop_change_pct: 10,
  net_overseas_share: 20,
  median_age_2025: 38,
  approvals_per_1000: 100,
  income_median_2223_approx: 55000,
  pct_rent_stress: 25,
  pct_mortgage_stress: 12,
  modelled: true,
  method: 'm',
  vintages: '{}',
  erp_series: '[1,2,3]',
  ...o,
})
const demo = (id: number, o: Partial<DemoRow> = {}): DemoRow => ({
  district_id: id,
  pct_born_overseas: 30,
  pct_renting: 30,
  pct_bachelor_plus: 30,
  seifa_irsad: 1000,
  data_source: 'ds',
  ...o,
})
const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const spread = (i: number) => i // small variation so sd > 0

describe('rankHigh / stripPosition', () => {
  it('ranks 1 for the highest and counts ties generously', () => {
    expect(rankHigh([5, 9, 7, 9], 9)).toBe(1)
    expect(rankHigh([5, 9, 7, 9], 7)).toBe(3)
    expect(rankHigh([5, 9, 7, 9], 5)).toBe(4)
  })
  it('places a value between the min and max, clamped', () => {
    expect(stripPosition(0, 0, 10)).toBe(0)
    expect(stripPosition(5, 0, 10)).toBe(0.5)
    expect(stripPosition(12, 0, 10)).toBe(1)
    expect(stripPosition(3, 3, 3)).toBe(0.5)
  })
})

describe('parseSeries', () => {
  it('reads a JSON array of numbers and tolerates junk', () => {
    expect(parseSeries('[1,2,3]')).toEqual([1, 2, 3])
    expect(parseSeries('nope')).toEqual([])
    expect(parseSeries('[1,"x",3]')).toEqual([1, 3])
  })
})

describe('formatFigure', () => {
  it('formats each measure plainly', () => {
    expect(formatFigure('pct_rent_stress', 29.54)).toBe('29.5%')
    expect(formatFigure('median_age_2025', 35.5)).toBe('35.5 yrs')
    expect(formatFigure('income_median_2223_approx', 59690)).toBe('$59,700')
    expect(formatFigure('approvals_per_1000', 260.3)).toBe('260 per 1,000')
    expect(formatFigure('seifa_irsad', 1032.4)).toBe('1,032')
  })
})

describe('buildProfile', () => {
  const changes = ids.map((i) => change(i, { pop_change_pct: spread(i), pct_rent_stress: 25 + (i === 1 ? 0 : spread(i) * 0.1) }))
  const demos = ids.map((i) => demo(i, { pct_bachelor_plus: i === 1 ? 80 : 30 + spread(i) * 0.1 }))

  it('builds the since-2021 headline from the change row', () => {
    const p = buildProfile(1, changes, demos)!
    expect(p.headline).toEqual({ changePct: 1, pop2025: 55000, series: [1, 2, 3] })
  })

  it('returns three stands-out rows, most extreme first, with rank wording and a strip', () => {
    const p = buildProfile(1, changes, demos)!
    expect(p.rows).toHaveLength(3)
    const first = p.rows[0]!
    expect(first.key).toBe('pct_bachelor_plus')
    expect(first.side).toBe('top')
    expect(first.n).toBe(1)
    expect(first.phrase).toBe('Top 1')
    expect(first.position).toBe(1)
    expect(first.ticks).toHaveLength(10)
    expect(first.median).toBeGreaterThan(0)
    expect(first.median).toBeLessThan(1)
  })

  it('says Bottom for the low end', () => {
    const p = buildProfile(1, changes, demos)!
    const rent = p.rows.find((r) => r.key === 'pct_rent_stress')!
    expect(rent.side).toBe('bottom')
    expect(rent.phrase).toBe('Bottom 1')
  })

  it('never shows two measures from the same group', () => {
    const p = buildProfile(1, changes, demos)!
    const groups = p.rows.map((r) => MEASURES.find((m) => m.key === r.key)!.group)
    expect(new Set(groups).size).toBe(groups.length)
  })

  it('skips measures that are null for this district', () => {
    const c = changes.map((r) => (r.district_id === 1 ? { ...r, pct_rent_stress: null } : r))
    const p = buildProfile(1, c, demos)!
    expect(p.rows.some((r) => r.key === 'pct_rent_stress')).toBe(false)
  })

  it('returns null for an unknown district and a null headline when change is missing', () => {
    expect(buildProfile(99, changes, demos)).toBeNull()
    const p = buildProfile(1, [], demos)!
    expect(p.headline).toBeNull()
    expect(p.rows.length).toBeGreaterThan(0)
  })
})

describe('rankPhrase', () => {
  it('names the rank inside the ten at either end', () => {
    expect(rankPhrase('top', 1)).toBe('Top 1')
    expect(rankPhrase('bottom', 10)).toBe('Bottom 10')
  })
  it('says quarter rather than an awkward rank up to 22 of 88', () => {
    expect(rankPhrase('top', 11)).toBe('Top quarter')
    expect(rankPhrase('bottom', 22)).toBe('Bottom quarter')
  })
  it('says above or below the middle past that', () => {
    expect(rankPhrase('top', 23)).toBe('Above middle')
    expect(rankPhrase('bottom', 40)).toBe('Below middle')
  })
})
