import { describe, expect, it } from 'vitest'
import type { CandidateAttributes } from '@vic26/schema'
import type { PartyRow } from '../../lenspanel/party'
import { partyRows, partySummary } from '../../lenspanel/party'
import { LIVE_MIN_PCT, liveRows, liveSentence, type LiveSeat } from './live'
import { isVs, vsShares } from './vs'
import fixture from './__fixtures__/live-candidates.json'

const cand = (district_id: number, affiliation_name: string | null, fp_pct: number | null): CandidateAttributes =>
  ({ district_id, affiliation_name, fp_pct, party: 'OTH' }) as CandidateAttributes
const fed = (id: number): PartyRow => ({ id, name: `Seat ${id}`, pct: 0, stood: 0, partial: true, notStanding: true })
const seat = (id: number, counted: number | null): LiveSeat => ({ id, pct: counted, fp: [{ party: 'OTH', pct: 20 }] })

describe('vsShares (VE-320: Victorian Socialists from the candidates layer, no schema change)', () => {
  it('reads each seat\'s Victorian Socialists share from a live-shaped candidates fixture, and not Socialist Alliance', () => {
    const rows = fixture.features.map((f) => f.attributes as unknown as CandidateAttributes)
    const vs = vsShares(rows)
    const want = (id: number) => rows.filter((c) => c.district_id === id && c.affiliation_name === 'Victorian Socialists').reduce((n, c) => n + (c.fp_pct ?? 0), 0)
    expect(vs.size).toBe(2)
    expect(vs.get(15998)).toBeCloseTo(want(15998))
    expect(vs.get(15962)).toBeCloseTo(want(15962))
    // The second socialist party in 15962 stays out of the figure.
    expect(rows.some((c) => c.district_id === 15962 && c.affiliation_name === 'Socialist Alliance')).toBe(true)
    expect(vs.get(15962)).toBeGreaterThan(0)
  })

  it('a seat with candidates but none for Victorian Socialists is 0 (did not stand); a VS candidate without a figure is null', () => {
    const vs = vsShares([cand(1, 'Australian Labor Party', 40), cand(2, 'Victorian Socialists', null), cand(2, 'Greens', 10)])
    expect(vs.get(1)).toBe(0)
    expect(vs.get(2)).toBeNull()
    expect(vs.has(3)).toBe(false)
  })

  it('matches the name loosely (case and spaces) but never another party', () => {
    expect(isVs(cand(1, ' victorian socialists ', 1))).toBe(true)
    expect(isVs(cand(1, 'Socialist Alliance', 1))).toBe(false)
    expect(isVs(cand(1, null, 1))).toBe(false)
  })
})

describe('liveRows for Victorian Socialists', () => {
  it('has no 2025 federal figures: every seat did not stand before counting starts', () => {
    const rows = partyRows([{ district_id: 1, share_2025: { ALP: 30, COA: 30, LIB: 30, NAT: 0, GRN: 10, ONP: 5, IND: 0, OTH: 25 }, stood_2025: {}, low_votes: false } as never], 'VS', new Map([[1, 'One']]))
    expect(rows[0]).toMatchObject({ pct: 0, notStanding: true, partial: false })
    expect(partySummary(rows, 'VS')).toContain('did not stand at the 2025 federal election')
    const live = liveRows(rows, [], 'VS', null)
    expect(live[0]).toMatchObject({ live: false, notStanding: true })
  })

  it('uses the candidate share past the gate, "did not stand" where no VS candidate, and "no figures yet" without candidate rows', () => {
    const vs = new Map<number, number | null>([[1, 13], [2, 0], [4, null]])
    const rows = liveRows([fed(1), fed(2), fed(3), fed(4), fed(5)], [seat(1, 40), seat(2, 40), seat(3, 40), seat(4, 40), seat(5, LIVE_MIN_PCT - 1)], 'VS', vs)
    const by = (id: number) => rows.find((r) => r.id === id)!
    expect(by(1)).toMatchObject({ live: true, pct: 13, notStanding: false })
    expect(by(2)).toMatchObject({ live: true, notStanding: true })
    expect(by(3)).toMatchObject({ noFigures: true })
    expect(by(4)).toMatchObject({ noFigures: true })
    expect(by(5)).toMatchObject({ noFigures: true })
    expect(liveSentence(by(1), 'VS')).toBe("Seat 1: Victorian Socialists 13.0% of first preferences in tonight's count.")
  })

  it('without candidate rows at all (a past tick on the live view) every counted seat waits', () => {
    const rows = liveRows([fed(1)], [seat(1, 40)], 'VS', null)
    expect(rows[0]).toMatchObject({ noFigures: true, live: false })
  })
})
