import { describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import type { Seat } from '../../derive/seats'
import { filterPrefs, prefsCounts, prefsRows, prefsSentence, prefsSummary } from './prefs'

const seat = (id: number, name: string, lead: [PartyBucket, number] | null): Seat =>
  ({ id, name, leader: lead?.[0] ?? null, fp: lead ? [{ party: lead[0], votes: 1, pct: lead[1] }] : [] }) as unknown as Seat

describe('prefsRows', () => {
  it('ranks the leader share closest to 50 first, on either side, with seats without figures last', () => {
    const rows = prefsRows([seat(1, 'Far', ['ALP', 30]), seat(2, 'Nil', null), seat(3, 'Near', ['LIB', 48]), seat(4, 'Won', ['ALP', 52]), seat(5, 'Safe', ['ALP', 70])])
    expect(rows.map((r) => r.name)).toEqual(['Near', 'Won', 'Far', 'Safe', 'Nil'])
  })
  it('marks 50 and over as winning outright, under 50 as decided by preferences', () => {
    const rows = prefsRows([seat(1, 'a', ['ALP', 49.9]), seat(2, 'b', ['ALP', 50]), seat(3, 'c', null)])
    expect(Object.fromEntries(rows.map((r) => [r.name, r.filter]))).toEqual({ a: 'decide', b: 'outright', c: null })
  })
  it('uses the seat first-preference share as given (a share of party votes, VE-113)', () => {
    const [r] = prefsRows([seat(1, 'a', ['GRN', 41.25])])
    expect(r!.pct).toBe(41.25)
    expect(r!.party).toBe('GRN')
  })
})

describe('filters, summary and sentence', () => {
  const rows = prefsRows([seat(1, 'Mildura', ['NAT', 45]), seat(2, 'Geelong', ['ALP', 55]), seat(3, 'Brunswick', ['GRN', 38])])
  it('counts and filters', () => {
    expect(prefsCounts(rows)).toEqual({ decide: 2, outright: 1 })
    expect(filterPrefs(rows, 'decide', '').map((r) => r.name)).toEqual(['Mildura', 'Brunswick'])
    expect(filterPrefs(rows, null, 'geel').map((r) => r.name)).toEqual(['Geelong'])
  })
  it('summarises, in the singular too', () => {
    expect(prefsSummary(rows)).toBe('2 seats short of 50%: preferences decide them.')
    expect(prefsSummary(prefsRows([seat(1, 'a', ['ALP', 40])]))).toBe('1 seat short of 50%: preferences decide it.')
    expect(prefsSummary(prefsRows([seat(1, 'a', ['ALP', 60])]))).toBe('No seat short of 50% yet.')
    expect(prefsSummary(rows, true)).toBe('2 seats: no one had 50% of first preferences.')
    expect(prefsSummary(prefsRows([seat(1, 'a', ['ALP', 40])]), true)).toBe('1 seat: no one had 50% of first preferences.')
    expect(prefsSummary(prefsRows([seat(1, 'a', null)]))).toBe('No first preferences counted yet.')
  })
  it('reads a row aloud', () => {
    expect(prefsSentence(rows.find((r) => r.name === 'Mildura')!)).toBe('Mildura: Nationals 45% of first preferences. Preferences decide.')
    expect(prefsSentence(rows.find((r) => r.name === 'Geelong')!)).toBe('Geelong: Labor 55% of first preferences. Wins outright.')
  })
})
