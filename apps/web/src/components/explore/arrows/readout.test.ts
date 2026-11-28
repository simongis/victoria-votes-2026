import { describe, expect, it } from 'vitest'
import type { Seat } from '../../../derive/seats'
import type { Mark } from '../../../derive/arrows'
import { BAR_MAX, buildReadout } from './readout'

const seat = (fp: Seat['fp'], over: Partial<Seat> = {}): Seat =>
  ({ id: 1, name: 'Northcote', pct: 89.5, baseNote: '2022', tcp: { a: 'GRN', b: 'ONP' }, fp, ...over }) as Seat
const fp = (o: Record<string, number>): Seat['fp'] => Object.entries(o).map(([party, pct]) => ({ party, pct, votes: Math.round(pct * 100) }) as Seat['fp'][number])

describe('buildReadout', () => {
  it('heads with the seat and its pair, then one row per party with a signed change and a bar', () => {
    const s = seat(fp({ ONP: 21.2, ALP: 25.3, GRN: 30.2, OTH: 10 }))
    const m: Mark = { kind: 'other', seat: s }
    const r = buildReadout(m, { ALP: 44, GRN: 25, OTH: 17.7 })
    expect(r.name).toBe('Northcote')
    expect(r.pair).toBe('Greens v One Nation')
    expect(r.counted).toBe('89.5% counted')
    const alp = r.rows.find((x) => x.party === 'ALP')!
    expect(alp.text).toBe('-18.7')
    expect(alp.bar).toBe(Math.max(-1, -18.7 / BAR_MAX))
    expect(r.rows.find((x) => x.party === 'GRN')!.text).toBe('+5.2')
  })
  it('shows a new party as "new" with its share and no bar, never as a change', () => {
    const r = buildReadout({ kind: 'other', seat: seat(fp({ ONP: 21.2, ALP: 30, GRN: 30 })) }, { ALP: 44, GRN: 25 })
    const onp = r.rows.find((x) => x.party === 'ONP')!
    expect(onp).toMatchObject({ fresh: true, bar: 0, text: 'new 21.2%' })
  })
  it('flags the triangle row: the biggest real mover, in a seat that is not Labor v Coalition', () => {
    const r = buildReadout({ kind: 'other', seat: seat(fp({ ONP: 21.2, ALP: 25.3, GRN: 30.2 })) }, { ALP: 44, GRN: 25 })
    expect(r.rows.filter((x) => x.mover).map((x) => x.party)).toEqual(['ALP'])
    expect(r.rows.find((x) => x.mover)!.bar).toBeLessThan(0)
  })
  it('clamps the bar to the full width', () => {
    const r = buildReadout({ kind: 'other', seat: seat(fp({ ALP: 10, GRN: 90 })) }, { ALP: 60, GRN: 40 })
    expect(r.rows.every((x) => Math.abs(x.bar) <= 1)).toBe(true)
  })
  it('gives a Labor v Coalition seat its swing in points and direction, and no triangle', () => {
    const s = seat(fp({ ALP: 40, LIB: 45 }), { tcp: { a: 'ALP', b: 'LIB' } as Seat['tcp'] })
    const r = buildReadout({ kind: 'arrow', seat: s, toward: 'COA', pts: -2.34 }, { ALP: 44, LIB: 40 })
    expect(r.swing).toEqual({ toward: 'COA', words: 'toward the Coalition', pts: '2.3' })
    expect(r.rows.some((x) => x.mover)).toBe(false)
  })
  it('says too early in a few words, with no rows', () => {
    const s = seat(fp({ ALP: 40 }), { pct: 8, tcp: { a: 'ALP', b: 'LIB' } as Seat['tcp'] })
    const r = buildReadout({ kind: 'early', seat: s }, { ALP: 44 })
    expect(r.rows).toEqual([])
    expect(r.note).toMatch(/^Too early/)
  })
})

describe('buildReadout, other seats still too early', () => {
  it('says too early rather than showing nothing', () => {
    const r = buildReadout({ kind: 'other', seat: seat(fp({ ALP: 40 }), { pct: 34.5 }) }, { ALP: 44 })
    expect(r.rows).toEqual([])
    expect(r.note).toMatch(/^Too early/)
  })
})

describe('VE-285: a Labor v Coalition seat with a different pair in 2022', () => {
  it('says so in the readout note', () => {
    const r = buildReadout({ kind: 'changed', seat: seat(fp({ ALP: 40, NAT: 30 })) }, { ALP: 44, LIB: 30 })
    expect(r.note).toBe('Different contest from 2022')
    expect(r.swing).toBeNull()
  })
})
