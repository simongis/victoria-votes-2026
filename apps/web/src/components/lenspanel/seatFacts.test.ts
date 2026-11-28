import { describe, expect, it } from 'vitest'
import type { LiveRow } from '../explore/one-nation/live'
import { demoFacts, mostLike, overTime, placeIn, placeWords, type DemoSources } from './seatFacts'

const row = (over: Partial<LiveRow> = {}): LiveRow => ({ id: 1, name: 'Morwell', pct: 4, stood: 1, partial: false, notStanding: false, live: false, noFigures: false, ...over })
const fp = (party: 'ALP' | 'LIB' | 'NAT' | 'GRN' | 'ONP' | 'IND' | 'OTH', pct: number) => ({ party, votes: pct * 100, pct })

describe('overTime (VE-282: the party across 2022 state, 2025 federal and tonight)', () => {
  it('reads the 2022 state share, and says did not stand when the party is absent', () => {
    expect(overTime('ONP', { fp2022: { ALP: 40, LIB: 30, GRN: 10, OTH: 20 }, federal: row(), counted: null }).y2022).toEqual({ kind: 'none' })
    expect(overTime('GRN', { fp2022: { ALP: 40, LIB: 30, GRN: 10, OTH: 20 }, federal: row(), counted: null }).y2022).toEqual({ kind: 'pct', pct: 10 })
  })

  it('adds Liberal and National for the Coalition, and is still "did not stand" when neither is listed', () => {
    expect(overTime('COA', { fp2022: { LIB: 30, NAT: 5, ALP: 65 }, federal: row(), counted: null }).y2022).toEqual({ kind: 'pct', pct: 35 })
    expect(overTime('COA', { fp2022: { ALP: 100 }, federal: row(), counted: null }).y2022).toEqual({ kind: 'none' })
  })

  it('VE-320: Victorian Socialists have no 2022 figure of their own (inside Others), never "did not stand", and a federal did-not-stand', () => {
    const t = overTime('VS', { fp2022: { ALP: 40, OTH: 20 }, federal: row({ notStanding: true, pct: 0 }), live: row({ live: true, pct: 13 }), counted: 60 })
    expect(t.y2022).toEqual({ kind: 'others' })
    expect(t.fed2025).toEqual({ kind: 'none' })
    expect(t.tonight).toEqual({ kind: 'pct', pct: 13, counted: 60 })
  })

  it('is unknown (null) while the 2022 asset has not loaded', () => {
    expect(overTime('ALP', { fp2022: null, federal: row(), counted: null }).y2022).toBeNull()
  })

  it('takes the 2025 federal point from the row the lens drew before counting, with did not stand', () => {
    expect(overTime('ONP', { fp2022: {}, federal: row({ pct: 42.1 }), counted: null }).fed2025).toEqual({ kind: 'pct', pct: 42.1 })
    expect(overTime('GRN', { fp2022: {}, federal: row({ notStanding: true, pct: 0 }), counted: null }).fed2025).toEqual({ kind: 'none' })
  })

  it('tonight: no point before figures, "wait" below the gate, did not stand, or the share with % counted', () => {
    const base = { fp2022: {}, federal: row() }
    expect(overTime('ONP', { ...base, live: row(), counted: null }).tonight).toBeNull()
    expect(overTime('ONP', { ...base, live: row({ noFigures: true }), counted: 2 }).tonight).toEqual({ kind: 'wait' })
    expect(overTime('ONP', { ...base, live: row({ live: true, notStanding: true, pct: 0 }), counted: 40 }).tonight).toEqual({ kind: 'none' })
    expect(overTime('ONP', { ...base, live: row({ live: true, pct: 31.4 }), counted: 40 }).tonight).toEqual({ kind: 'pct', pct: 31.4, counted: 40 })
  })
})

describe('placeIn (the party\'s place tonight)', () => {
  it('ranks the party among those with votes and names who leads', () => {
    expect(placeIn([fp('ONP', 42), fp('ALP', 30), fp('LIB', 20), fp('GRN', 8)], 'ALP')).toEqual({ place: 2, of: 4, leader: 'One Nation' })
    expect(placeIn([fp('ONP', 42), fp('ALP', 30)], 'ONP')).toEqual({ place: 1, of: 2, leader: 'One Nation' })
  })

  it('merges Liberal and National into one Coalition entry', () => {
    expect(placeIn([fp('ALP', 40), fp('LIB', 25), fp('NAT', 10), fp('GRN', 25)], 'COA')).toEqual({ place: 2, of: 3, leader: 'Labor' })
    expect(placeIn([fp('LIB', 25), fp('NAT', 10), fp('ALP', 40)], 'COA')).toEqual({ place: 2, of: 2, leader: 'Labor' })
  })

  it('is null when the party has no votes, or nothing is counted', () => {
    expect(placeIn([fp('ALP', 60), fp('LIB', 40)], 'GRN')).toBeNull()
    expect(placeIn([], 'ALP')).toBeNull()
  })
})

describe('mostLike (the three seats the Similar lens ranks nearest)', () => {
  const names = new Map([[15920, 'A'], [15959, 'B'], [15977, 'C']])
  it('returns the top three in rank order with each seat\'s share', () => {
    const rows = new Map([[15920, row({ id: 15920, name: 'A', pct: 10 })], [15959, row({ id: 15959, name: 'B', live: true, pct: 22.2 })], [15977, row({ id: 15977, name: 'C', noFigures: true, pct: 0 })]])
    const out = mostLike(15907, rows, names)
    expect(out.map((o) => o.id)).toEqual([15920, 15959, 15977])
    expect(out.map((o) => o.text)).toEqual(['10.0% (2025)', '22.2%', 'no figures yet'])
  })

  it('says did not stand where the party did not', () => {
    const rows = new Map([[15920, row({ id: 15920, name: 'A', live: true, notStanding: true, pct: 0 })]])
    expect(mostLike(15907, rows, names)[0]!.text).toBe('did not stand')
  })

  it('is empty for a seat the ranks do not know', () => {
    expect(mostLike(1, new Map(), names)).toEqual([])
  })
})

describe('demoFacts (static Census 2021 measures with the middle Victorian seat beside each)', () => {
  const src = (id: number, year12: number, dens: number): DemoSources['districts'][number] => ({ district_id: id, pct_year12: year12, pct_own_home: 70, pct_trades_labour: 20, people_per_km2: dens })
  const sources: DemoSources = {
    districts: [src(1, 60, 10), src(2, 70, 500), src(3, 80, 3000)],
  }

  it('gives the seat\'s figure and the middle seat\'s figure for each measure', () => {
    const f = demoFacts(2, sources)
    const y12 = f.find((x) => x.key === 'pct_year12')!
    expect(y12).toMatchObject({ label: 'Finished Year 12', value: '70%', vic: '70%' })
    expect(f.find((x) => x.key === 'people_per_km2')).toMatchObject({ value: '500 per km2', vic: '500 per km2' })
    expect(demoFacts(1, sources).find((x) => x.key === 'pct_year12')).toMatchObject({ value: '60%', vic: '70%' })
  })

  it('skips a measure the seat has no figure for', () => {
    const s: DemoSources = { districts: [{ district_id: 1, pct_year12: null, pct_own_home: 70, pct_trades_labour: 20, people_per_km2: 10 }] }
    expect(demoFacts(1, s).some((x) => x.key === 'pct_year12')).toBe(false)
  })

  it('is empty for a seat that is not in the table', () => {
    expect(demoFacts(99, sources)).toEqual([])
  })
})

// VE-291: the facts said "Greens leads." for the first-preference leader while the map said "Labor leading" after
// preferences: one word, two meanings. The sentence now says which count each claim is about.
describe('placeWords (the place sentence, VE-291)', () => {
  it('names first preferences, and the first party when the pick is not first', () => {
    expect(placeWords({ place: 2, of: 6, leader: 'Greens' }, { party: 'ALP', after: 'GRN', final: false })).toEqual({ rank: '2nd of 6', rest: ' on first preferences tonight. Greens first.' })
  })
  it('adds who is ahead after preferences when that is not the first-preference leader', () => {
    expect(placeWords({ place: 3, of: 6, leader: 'Liberal' }, { party: 'ALP', after: 'ALP', final: false })).toEqual({ rank: '3rd of 6', rest: ' on first preferences tonight. Liberal first. Labor ahead after preferences.' })
  })
  it('says leading only when the party is also ahead after preferences', () => {
    expect(placeWords({ place: 1, of: 5, leader: 'Labor' }, { party: 'ALP', after: 'ALP', final: false }).rest).toBe(' on first preferences tonight, leading.')
    expect(placeWords({ place: 1, of: 5, leader: 'Labor' }, { party: 'ALP', after: 'LIB', final: false }).rest).toBe(' on first preferences tonight. Liberal ahead after preferences.')
    expect(placeWords({ place: 1, of: 5, leader: 'Labor' }, { party: 'ALP', after: null, final: false }).rest).toBe(' on first preferences tonight.')
  })
  it('treats Liberal or Nationals as the Coalition, and says "in the final count" at Final', () => {
    expect(placeWords({ place: 1, of: 3, leader: 'Coalition' }, { party: 'COA', after: 'NAT', final: true }).rest).toBe(' on first preferences in the final count, leading.')
    expect(placeWords({ place: 2, of: 3, leader: 'Labor' }, { party: 'COA', after: 'ALP', final: true }).rest).toBe(' on first preferences in the final count. Labor first.')
  })
})
