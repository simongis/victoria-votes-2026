import { describe, expect, it } from 'vitest'
import type { DistrictStatic } from '@vic26/schema'
import type { Seat } from '../../derive/seats'
import { countedScale } from '../../derive/colour'
import { bandLabel, countedCounts, countedRows, countedSentence, countedSummary, filterCounted } from './counted'

const seat = (id: number, name: string, pct: number | null): Seat => ({ id, name, leader: 'ALP', state: 'firm', tcp: null, pct, baseNote: '2022', fp: [] }) as unknown as Seat
const st = (enrolment: number | null) => ({ enrolment }) as DistrictStatic
const noStatics = new Map<number, DistrictStatic>()

describe('countedRows', () => {
  it('ranks the least counted first, with seats that have no count last', () => {
    const rows = countedRows([seat(1, 'B', 40), seat(2, 'A', null), seat(3, 'C', 5), seat(4, 'D', 90)])
    expect(rows.map((r) => r.name)).toEqual(['C', 'B', 'D', 'A'])
  })
  it('breaks ties by name so the order is stable between ticks', () => {
    const rows = countedRows([seat(1, 'Zed', 10), seat(2, 'Abe', 10)])
    expect(rows.map((r) => r.name)).toEqual(['Abe', 'Zed'])
  })
  it('puts each seat in the stage band its figure falls in: under 25, 25 to 50, 50 to 75, 75 or more (VE-194)', () => {
    const rows = countedRows([seat(1, 'a', 24.9), seat(2, 'b', 25), seat(3, 'c', 49.9), seat(4, 'd', 50), seat(5, 'e', 74.9), seat(6, 'f', 75), seat(7, 'g', null)])
    expect(Object.fromEntries(rows.map((r) => [r.name, r.filter]))).toEqual({ a: 0, b: 1, c: 1, d: 2, e: 2, f: 3, g: null })
  })
})

describe('filterCounted and countedCounts', () => {
  const rows = countedRows([seat(1, 'Mildura', 8), seat(2, 'Geelong', 50), seat(3, 'Albert Park', 80), seat(4, 'Brunswick', 12)])
  it('counts what each chip would show over every row', () => {
    expect(countedCounts(rows)).toEqual([2, 0, 1, 1])
  })
  it('narrows by filter and by name search, keeping the ranking', () => {
    expect(filterCounted(rows, 0, '').map((r) => r.name)).toEqual(['Mildura', 'Brunswick'])
    expect(filterCounted(rows, null, ' gee ').map((r) => r.name)).toEqual(['Geelong'])
    expect(filterCounted(rows, 3, 'mildura')).toEqual([])
  })
})

describe('countedSummary', () => {
  it('says the statewide figure and the slowest seat', () => {
    const rows = countedRows([seat(1, 'Mildura', 8), seat(2, 'Geelong', 52)])
    expect(countedSummary(rows, noStatics)).toBe('30% counted across Victoria; slowest: Mildura 8%.')
  })
  it('weights by enrolment where it is known', () => {
    const rows = countedRows([seat(1, 'Small', 10), seat(2, 'Big', 50)])
    const s = new Map([[1, st(1000)], [2, st(3000)]])
    expect(countedSummary(rows, s)).toContain('40% counted across Victoria')
  })
  it('at Final calls it turnout and drops "counted across Victoria"', () => {
    const rows = countedRows([seat(1, 'Mildura', 81), seat(2, 'Geelong', 91)])
    expect(countedSummary(rows, noStatics, true)).toBe('86% turnout; lowest: Mildura 81%.')
  })
  it('says so before anything is counted', () => {
    expect(countedSummary(countedRows([seat(1, 'A', null)]), noStatics)).toBe('Nothing counted yet.')
  })
})

describe('countedSentence', () => {
  it('reads the figure or says nothing is counted', () => {
    const [a, b] = countedRows([seat(1, 'Mildura', 8.4), seat(2, 'Nil', null)])
    expect(countedSentence(a!)).toBe('Mildura: 8% counted.')
    expect(countedSentence(b!)).toBe('Nil: nothing counted yet.')
    expect(countedSentence(a!, true)).toBe('Mildura: 8% turnout.')
  })
})

describe('countedRows with the Final scale (VE-170)', () => {
  const seats = [81.2, 82.4, 83.5, 84.1, 85.7, 86.0, 87.3, 88.6, 89.9, 0].map((p, i) => seat(i + 1, `S${i + 1}`, p))
  const scale = countedScale(seats.map((s) => s.pct), true)
  it('filters by the scale given, and the four chips (the legend bands) add up to the seats', () => {
    const rows = countedRows(seats, scale)
    const c = countedCounts(rows)
    // The seat at zero is under the lowest step. Four bands, as the legend has, not the merged three.
    expect(c).toHaveLength(4)
    expect(c.reduce((a, b) => a + b, 0)).toBe(seats.length)
    // Each chip's count is what the stage paints in that step.
    expect(c).toEqual(scale.labels.map((_l, i) => rows.filter((r) => r.filter === i).length))
  })
  it('keeps the 25, 50 and 75 bands before Final', () => {
    expect(countedCounts(countedRows(seats))).toEqual([1, 0, 0, 9])
  })
})

describe('bandLabel (VE-194, FB-225)', () => {
  it('puts a percent sign on every chip and legend label, and none twice', () => {
    expect(bandLabel('<25%')).toBe('<25%')
    expect(bandLabel('25-50')).toBe('25-50%')
    expect(bandLabel('75%+')).toBe('75%+')
    expect(bandLabel('81-83')).toBe('81-83%')
    expect(bandLabel('84%')).toBe('84%')
  })
  it('names the same bands as the legend, four of them, at Final and before', () => {
    expect(countedScale([], false).short.map(bandLabel)).toEqual(['<25%', '25-50%', '50-75%', '75%+'])
    const final = countedScale([81, 84, 88, 91, 93], true)
    expect(final.short.map(bandLabel)).toEqual(['81-83%', '84-87%', '88-90%', '91-93%'])
  })
})
