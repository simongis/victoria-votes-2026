import { describe, expect, it } from 'vitest'
import type { PartySharesSeat, ShareParty } from '@vic26/schema'
import type { SeatFlow } from '../explore/one-nation/flow'
import { filterParty, flowPanelRows, flowPanelSummary, partyCounts, partyRows, partySentence, partySummary } from './party'

const SHARES: Record<ShareParty, number> = { ALP: 30, COA: 35, LIB: 35, NAT: 0, GRN: 10, ONP: 5, IND: 15, OTH: 5 }
const seat = (id: number, over: Partial<Record<ShareParty, number>> = {}, stood: Partial<Record<ShareParty, number>> = {}): PartySharesSeat => ({
  district_id: id,
  share_2025: { ...SHARES, ...over },
  stood_2025: { ALP: 1, COA: 1, LIB: 1, NAT: 0, GRN: 1, ONP: 1, IND: 1, OTH: 1, ...stood },
  low_votes: false,
})
const names = new Map([[1, 'Alpha'], [2, 'Bravo'], [3, 'Charlie'], [4, 'Delta']])

describe('partyRows', () => {
  const shares = [seat(1, { ONP: 4 }), seat(2, { ONP: 12 }), seat(3, { ONP: 12 }), seat(4, { ONP: 0 }, { ONP: 0 })]
  it('ranks highest first, ties by name, and keeps every seat', () => {
    const rows = partyRows(shares, 'ONP', names)
    expect(rows.map((r) => r.name)).toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta'])
    expect(rows.map((r) => r.pct)).toEqual([12, 12, 4, 0])
  })
  it('reads the chosen party only, and a partial seat is marked', () => {
    const rows = partyRows([seat(1, {}, { IND: 0.5 }), seat(2)], 'IND', names)
    expect(rows.find((r) => r.id === 1)).toMatchObject({ pct: 15, partial: true, stood: 0.5 })
    expect(rows.find((r) => r.id === 2)).toMatchObject({ partial: false })
  })
  it('treats 0.97 as full coverage but 0.9 as partial', () => {
    const rows = partyRows([seat(1, {}, { GRN: 0.97 }), seat(2, {}, { GRN: 0.9 })], 'GRN', names)
    expect(rows.map((r) => r.partial)).toEqual([false, true])
  })
  it('a seat the party did not stand in is its own case', () => {
    const [r] = partyRows([seat(4, { ONP: 0 }, { ONP: 0 })], 'ONP', names)
    expect(r).toMatchObject({ notStanding: true, partial: true })
  })
})

describe('partySummary (same sentence for every party)', () => {
  const shares = [seat(1, { ONP: 4, ALP: 50 }), seat(2, { ONP: 12, ALP: 20 }), seat(3, { ONP: 9, ALP: 40 }), seat(4, { ONP: 1, ALP: 10 })]
  it('names the top three seats', () => {
    expect(partySummary(partyRows(shares, 'ONP', names), 'ONP')).toBe('Strongest seats for One Nation at the 2025 federal election: Bravo 12.0%, Charlie 9.0%, Alpha 4.0%.')
    expect(partySummary(partyRows(shares, 'ALP', names), 'ALP')).toBe('Strongest seats for Labor at the 2025 federal election: Alpha 50.0%, Charlie 40.0%, Bravo 20.0%.')
  })
  it('skips seats where the party did not stand', () => {
    const s = [seat(1, { IND: 0 }, { IND: 0 }), seat(2, { IND: 20 }, { IND: 1 })]
    expect(partySummary(partyRows(s, 'IND', names), 'IND')).toBe('Strongest seats for Independents at the 2025 federal election: Bravo 20.0%.')
  })
  it('says so plainly when there is nothing to rank', () => {
    expect(partySummary([], 'ONP')).toBe('These figures are not available.')
  })
})

describe('partySentence', () => {
  it('gives the share, and the coverage when the party stood in part of the seat', () => {
    const [full] = partyRows([seat(1, { GRN: 22.46 })], 'GRN', names)
    expect(partySentence(full!, 'GRN')).toBe('Alpha: Greens 22.5% of first preferences at the 2025 federal election.')
    const [part] = partyRows([seat(1, { IND: 9 }, { IND: 0.5 })], 'IND', names)
    expect(partySentence(part!, 'IND')).toBe("Alpha: Independents 9.0% of first preferences at the 2025 federal election. Independents stood in about 50% of this seat's area, so the figure is only partly comparable.")
  })
  it('says the party did not stand', () => {
    const [none] = partyRows([seat(1, { ONP: 0 }, { ONP: 0 })], 'ONP', names)
    expect(partySentence(none!, 'ONP')).toBe('Alpha: One Nation did not stand here at the 2025 federal election.')
  })
})

describe('counts and filter', () => {
  const rows = partyRows([seat(1, {}, { IND: 0.4 }), seat(2), seat(3, { IND: 0 }, { IND: 0 })], 'IND', names)
  it('counts the partly covered seats', () => {
    expect(partyCounts(rows)).toEqual({ partial: 2 })
  })
  it('filters by chip and by search', () => {
    expect(filterParty(rows, 'partial', '').map((r) => r.id).sort()).toEqual([1, 3])
    expect(filterParty(rows, null, 'brav').map((r) => r.id)).toEqual([2])
  })
})

describe('other votes panel (VE-101g)', () => {
  const flow = (id: number, a: 'ALP' | 'LIB' | 'GRN', b: 'ALP' | 'LIB' | 'GRN', shareA: number): SeatFlow => ({ id, a, b, shareA, others: 5000, base: 30000, booths: 12 })
  const rows = flowPanelRows([flow(1, 'ALP', 'LIB', 55), flow(2, 'ALP', 'GRN', 20), flow(3, 'LIB', 'ALP', 70)], names)
  it('ranks by the larger side of the split, whichever party it is, ties by name', () => {
    expect(rows.map((r) => [r.name, r.lead, r.leadPct])).toEqual([
      ['Bravo', 'GRN', 80],
      ['Charlie', 'LIB', 70],
      ['Alpha', 'ALP', 55],
    ])
    expect(rows[0]).toMatchObject({ other: 'ALP' })
  })
  it('keeps the seat sentence the lens uses', () => {
    expect(rows[2]!.words).toBe('Alpha: of 5,000 votes for candidates outside the top two, 55% went to Labor and 45% to Liberal (12 polling places counted so far).')
  })
  it('summarises neutrally, with the most one-sided seats', () => {
    expect(flowPanelSummary(rows)).toBe('Where the votes of other candidates went, in 3 seats counted so far. Most one-sided: Bravo 80% to Greens, Charlie 70% to Liberal, Alpha 55% to Labor.')
  })
  it('says plainly when nothing can be ranked', () => {
    expect(flowPanelSummary([])).toBe('These figures are not available.')
  })
})
