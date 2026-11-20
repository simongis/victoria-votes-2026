import { describe, expect, it } from 'vitest'
import type { PrefsPoint } from '../../../derive/prefs'
import { partyKey, regionHint, regionTitle } from './regions'

const pt = (id: number, party: PrefsPoint['party']): PrefsPoint => ({ id, name: 'S' + id, region: 'R', party, pct: 40, decided: true })

describe('regionHint', () => {
  it('gives each of the eight regions a plain hint, whichever way the name is written', () => {
    expect(regionHint('Northern Victoria')).toBe('country north')
    expect(regionHint('Northern Victoria Region')).toBe('country north')
    expect(regionHint('South-Eastern Metropolitan')).toBe('south-east Melbourne')
    for (const r of ['Eastern Victoria', 'Western Victoria', 'Eastern Metropolitan', 'North-Eastern Metropolitan', 'Northern Metropolitan', 'Southern Metropolitan', 'Western Metropolitan']) {
      expect(regionHint(r)).not.toBe('')
    }
  })
  it('is empty for an unknown region (the row just shows its name)', () => {
    expect(regionHint('Other')).toBe('')
  })
})

describe('partyKey', () => {
  it('lists only the parties that lead a seat, most seats first, ties by name', () => {
    const k = partyKey([pt(1, 'ALP'), pt(2, 'LIB'), pt(3, 'ALP'), pt(4, 'GRN')])
    expect(k.map((x) => x.party)).toEqual(['ALP', 'GRN', 'LIB'])
    expect(k[0]!.n).toBe(2)
  })
  it('is empty with no points', () => {
    expect(partyKey([])).toEqual([])
  })
})

describe('regionTitle (VE-215 A22)', () => {
  it('leads with the plain name, capitalised', () => {
    expect(regionTitle('North-Eastern Metropolitan Region')).toBe('North-east Melbourne')
    expect(regionTitle('Western Victoria')).toBe('Country west')
  })
  it('falls back to the region name when there is no plain one', () => {
    expect(regionTitle('Other')).toBe('Other')
  })
})
