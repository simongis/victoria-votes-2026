import { describe, expect, it } from 'vitest'
import { sharedLine, sharedTraits, type TraitTable } from './sharedTraits'

/** 90 seats (ids 1..90); renting rises with the id, so seat 1 is the lowest and 90 the highest. 30 per third. */
function table(over: Record<number, Record<string, number | null>> = {}): TraitTable {
  const t = new Map<number, Record<string, number | null>>()
  for (let id = 1; id <= 90; id++) {
    t.set(id, { pct_renting: id, pct_bachelor_plus: 50, pct_born_overseas: id % 7, pct_trades_labour: null, people_per_km2: null, pct_irsd_q1: null, ...over[id] })
  }
  return t
}

describe('sharedTraits', () => {
  it('finds a measure where the picked seat and four of five sit in the same third', () => {
    const r = sharedTraits(1, [2, 3, 4, 5, 60], table())
    expect(r.map((x) => [x.key, x.side])).toEqual([['pct_renting', 'low']])
    expect(r[0]!.phrase).toBe('few renters')
  })
  it('says high for the top third', () => {
    const r = sharedTraits(90, [89, 88, 87, 86, 85], table())
    expect(r[0]).toMatchObject({ key: 'pct_renting', side: 'high', phrase: 'many renters' })
  })
  it('needs four of five: three is not enough', () => {
    expect(sharedTraits(1, [2, 3, 4, 50, 60], table()).filter((x) => x.key === 'pct_renting')).toEqual([])
  })
  it('the middle third never counts', () => {
    expect(sharedTraits(45, [44, 46, 47, 43, 42], table()).filter((x) => x.key === 'pct_renting')).toEqual([])
  })
  it('the picked seat must be in the same third as the four', () => {
    expect(sharedTraits(50, [1, 2, 3, 4, 5], table())).toEqual([])
  })
  it('a seat with no figure does not count as sharing; four others still do', () => {
    const t = table({ 5: { pct_renting: null } })
    expect(sharedTraits(1, [2, 3, 4, 5, 6], t).map((x) => x.key)).toEqual(['pct_renting'])
    const t2 = table({ 4: { pct_renting: null }, 5: { pct_renting: null } })
    expect(sharedTraits(1, [2, 3, 4, 5, 60], t2)).toEqual([])
  })
  it('gives nothing when the picked seat has no figure', () => {
    expect(sharedTraits(1, [2, 3, 4, 5, 6], table({ 1: { pct_renting: null } }))).toEqual([])
  })
  it('keeps the three tightest, tightest first', () => {
    const over: Record<number, Record<string, number | null>> = {}
    for (let id = 1; id <= 90; id++) {
      over[id] = {
        pct_renting: id,
        pct_bachelor_plus: id <= 6 ? id * 3 : id, // picked 1 and 2..5 within the bottom, a little looser
        pct_born_overseas: id <= 6 ? id : id + 6,
        pct_trades_labour: id <= 6 ? 1 : id + 100,
        people_per_km2: id <= 6 ? id * 5 : id + 100,
        pct_irsd_q1: id,
      }
    }
    const r = sharedTraits(1, [2, 3, 4, 5, 6], table(over))
    expect(r).toHaveLength(3)
    expect(r.map((x) => x.spread)).toEqual([...r.map((x) => x.spread)].sort((a, b) => a - b))
  })
  it('is empty when nothing clusters', () => {
    expect(sharedTraits(1, [30, 45, 60, 75, 90], table())).toEqual([])
  })
  it('lists each seat figure for the table, picked first', () => {
    const r = sharedTraits(1, [2, 3, 4, 5, 60], table())
    expect(r[0]!.values.map((v) => v.id)).toEqual([1, 2, 3, 4, 5, 60])
    expect(r[0]!.values[0]!.value).toBe(1)
  })
})

describe('sharedLine', () => {
  const t = (...phrases: string[]) => phrases.map((phrase) => ({ phrase }) as never)
  it('is null for no traits', () => expect(sharedLine([])).toBeNull())
  it('joins one, two and three', () => {
    expect(sharedLine(t('few renters'))).toBe('What they share: few renters.')
    expect(sharedLine(t('few renters', 'older residents'))).toBe('What they share: few renters and older residents.')
    expect(sharedLine(t('a', 'b', 'c'))).toBe('What they share: a, b and c.')
  })
})
