import { describe, expect, it } from 'vitest'
import { hasResults, ONP_POLLS, pollsLine, pollsLineFor } from './polls'

describe('pollsLine', () => {
  it('gives the range, then each pollster with its figure and date', () => {
    const line = pollsLine(ONP_POLLS)
    expect(line).toMatch(/^Statewide polls this year put One Nation at 22% to 25% of first preferences/)
    for (const p of ['Freshwater Strategy', 'DemosAU', 'Resolve Strategic', 'RedBridge', 'Roy Morgan']) expect(line).toContain(p)
    expect(line).toContain('Roy Morgan 22% (26 to 29 Oct)')
    expect(line).toMatch(/Polls are not results\.$/)
    expect(line).not.toMatch(/—/)
  })
  it('collapses a range of one figure', () => {
    expect(pollsLine([{ pollster: 'A', dates: '1 Jan', onp: 20 }])).toMatch(/at 20% of first preferences/)
  })
  it('says nothing when there are no polls', () => {
    expect(pollsLine([])).toBe('')
  })
})

describe('hasResults', () => {
  it('is false until some seat has a counted first preference', () => {
    expect(hasResults([{ fp: [] }, { fp: [{ votes: 0 }] }])).toBe(false)
    expect(hasResults([{ fp: [] }, { fp: [{ votes: 0 }, { votes: 12 }] }])).toBe(true)
  })
})

describe('pollsLineFor', () => {
  it('gives the One Nation line only when One Nation is the party chosen', () => {
    expect(pollsLineFor('ONP', ONP_POLLS)).toBe(pollsLine(ONP_POLLS))
    for (const p of ['ALP', 'COA', 'LIB', 'NAT', 'GRN', 'IND', 'OTH'] as const) expect(pollsLineFor(p, ONP_POLLS)).toBe('')
  })
})
