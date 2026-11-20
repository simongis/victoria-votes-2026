import { describe, expect, it } from 'vitest'
import {
  MIN_BASE,
  MIN_OTHERS,
  MIN_SEATS,
  flowLanes,
  flowReady,
  flowRows,
  flowSentence,
  parseFlowHistory,
  seatFlow,
  type BoothState,
} from './flow'

const fp = (o: Partial<Record<'ALP' | 'LIB' | 'NAT' | 'GRN' | 'ONP' | 'IND' | 'OTH', number>>) => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0, ...o })

/** A booth with first preferences and a two-candidate percentage for Labor (party a). */
const booth = (f: ReturnType<typeof fp>, pctA: number | null, a: 'ALP' | 'LIB' | 'GRN' = 'ALP'): BoothState => ({ fp: f, tcpA: pctA === null ? null : a, tcpPctA: pctA })

describe('seatFlow: the other candidates split between the top two, on matched booths only', () => {
  it('splits the others by the gain each finalist makes from first to two-candidate count', () => {
    // Formal 10,000: ALP 4,000, LIB 3,000, others 3,000. After preferences ALP 5,800 (58%), LIB 4,200: gains 1,800 and 1,200.
    const r = seatFlow('ALP', 'LIB', [booth(fp({ ALP: 4000, LIB: 3000, GRN: 2000, OTH: 1000 }), 58)])
    expect(r).toMatchObject({ ok: true, others: 3000, base: 10000, booths: 1 })
    if (r.ok) expect(r.shareA).toBeCloseTo(60, 6)
  })

  it('counts only booths that report both counts, so the two sides cover the same votes', () => {
    const both = booth(fp({ ALP: 4000, LIB: 3000, GRN: 2000, OTH: 1000 }), 58)
    // This booth has first preferences but no two-candidate count yet: counting it would make the others look bigger and shift the split.
    const fpOnly = booth(fp({ ALP: 500, LIB: 4000, GRN: 3000, OTH: 3000 }), null)
    const r = seatFlow('ALP', 'LIB', [both, fpOnly])
    expect(r).toMatchObject({ ok: true, base: 10000, booths: 1 })
    if (r.ok) expect(r.shareA).toBeCloseTo(60, 6)
  })

  it('reads a booth whose pair is listed the other way round', () => {
    // This booth's party a is the Liberal: 42% LIB means 58% ALP.
    const r = seatFlow('ALP', 'LIB', [booth(fp({ ALP: 4000, LIB: 3000, GRN: 2000, OTH: 1000 }), 42, 'LIB')])
    if (r.ok) expect(r.shareA).toBeCloseTo(60, 6)
    else throw new Error('expected a result')
  })

  it('ignores a booth whose two-candidate pair is a different pair', () => {
    const r = seatFlow('ALP', 'LIB', [booth(fp({ ALP: 4000, LIB: 3000, GRN: 3000 }), 60, 'GRN')])
    expect(r).toEqual({ ok: false, why: 'base' })
  })

  it('skips a seat where a finalist lost votes between the counts (negative gain)', () => {
    // ALP had 4,000 first preferences but only 3,400 in the two-candidate count: the counts do not describe the same votes.
    const r = seatFlow('ALP', 'LIB', [booth(fp({ ALP: 4000, LIB: 3000, GRN: 2000, OTH: 1000 }), 34)])
    expect(r).toEqual({ ok: false, why: 'negative' })
  })

  it('forgives a rounding-sized shortfall', () => {
    // Zero real flow to ALP: 4,000 of 7,000 is 57.142857 and the feed gives 57.14, so ALP's count is a fraction of a vote short.
    const r = seatFlow('ALP', 'LIB', [booth(fp({ ALP: 4000, LIB: 3000 }), 57.14)])
    expect(r.ok).toBe(false) // no others at all: nothing to split
    const r2 = seatFlow('ALP', 'LIB', [booth(fp({ ALP: 4000, LIB: 3000, GRN: MIN_OTHERS }), 4000 / (7000 + MIN_OTHERS) * 100 - 0.004)])
    expect(r2.ok).toBe(true)
    if (r2.ok) expect(r2.shareA).toBeGreaterThanOrEqual(0)
  })

  it('skips a seat whose matched booths hold too few votes or too few others', () => {
    expect(seatFlow('ALP', 'LIB', [booth(fp({ ALP: 300, LIB: 200, GRN: 100 }), 70)])).toEqual({ ok: false, why: 'base' })
    expect(MIN_BASE).toBeGreaterThan(600)
    const fewOthers = seatFlow('ALP', 'LIB', [booth(fp({ ALP: 6000, LIB: 4000, GRN: MIN_OTHERS - 1 }), 60)])
    expect(fewOthers).toEqual({ ok: false, why: 'others' })
  })

  it('skips a pair where a finalist shares a bucket with unknown other candidates', () => {
    expect(seatFlow('IND', 'LIB', [booth(fp({ IND: 4000, LIB: 3000, GRN: 3000 }), 50, 'ALP')])).toEqual({ ok: false, why: 'pair' })
    expect(seatFlow('ALP', 'OTH', [])).toEqual({ ok: false, why: 'pair' })
    expect(seatFlow('ALP', 'ALP', [])).toEqual({ ok: false, why: 'pair' })
  })

  it('sums booths before splitting, so a small booth cannot swing the seat', () => {
    const big = booth(fp({ ALP: 4000, LIB: 3000, GRN: 3000 }), 55) // gains ALP 1,500, LIB 1,500
    const small = booth(fp({ ALP: 100, LIB: 100, GRN: 100 }), 90) // gains ALP 170, LIB -70: a tiny booth that disagrees
    const r = seatFlow('ALP', 'LIB', [big, small])
    // Combined gains are ALP 1,670 and LIB 1,430: the small booth that disagrees only nudges the sum.
    expect(r.ok).toBe(true)
  })
})

describe('flowRows and readiness', () => {
  const history = parseFlowHistory({
    fields: ['snapshot_at', 'booth_id', 'district_id', 'fp_ALP', 'fp_LIB', 'fp_NAT', 'fp_GRN', 'fp_ONP', 'fp_IND', 'fp_OTH', 'tcp_party_a', 'tcp_pct_a'],
    rows: [
      [100, 1, 10, 4000, 3000, 0, 3000, 0, 0, 0, null, null],
      [200, 1, 10, 4000, 3000, 0, 3000, 0, 0, 0, 'ALP', 55],
      [300, 1, 10, 4400, 3300, 0, 3300, 0, 0, 0, 'ALP', 55],
    ],
  })
  const seat = (id: number, a: 'ALP' | 'LIB', b: 'LIB' | 'GRN') => ({ id, tcp: { a, b } })

  it('reads each booth at the chosen time: the latest row at or before it', () => {
    expect(flowRows([seat(10, 'ALP', 'LIB')], history, 100).rows).toHaveLength(0) // no two-candidate count yet
    const at200 = flowRows([seat(10, 'ALP', 'LIB')], history, 200).rows
    expect(at200).toHaveLength(1)
    expect(at200[0]).toMatchObject({ id: 10, a: 'ALP', b: 'LIB', others: 3000, base: 10000 })
    expect(flowRows([seat(10, 'ALP', 'LIB')], history, 300).rows[0]).toMatchObject({ others: 3300 })
  })

  it('counts every seat once and says why a seat was left out', () => {
    const res = flowRows([seat(10, 'ALP', 'LIB'), seat(11, 'ALP', 'LIB'), { id: 12, tcp: null }], history, 200)
    expect(res.rows).toHaveLength(1)
    expect(res.skipped).toBe(2)
  })

  it('is ready only once enough seats qualify', () => {
    const row = { id: 1, a: 'ALP', b: 'LIB', shareA: 50, others: 1000, base: 5000, booths: 3 } as const
    expect(flowReady([])).toBe(false)
    expect(flowReady(Array.from({ length: MIN_SEATS - 1 }, (_, i) => ({ ...row, id: i })))).toBe(false)
    expect(flowReady(Array.from({ length: MIN_SEATS }, (_, i) => ({ ...row, id: i })))).toBe(true)
  })
})

describe('words and lanes', () => {
  it('names the finalists in a fixed order and leans neither way', () => {
    const s = flowSentence({ id: 1, a: 'LIB', b: 'ALP', shareA: 38.4, others: 4210, base: 31000, booths: 12 }, 'Hawthorn')
    expect(s).toBe('Hawthorn: of 4,210 votes for candidates outside the top two, 38% went to Liberal and 62% to Labor (12 polling places counted so far).')
  })
  it('groups seats by pairing, one lane for each pair, with the same party first in every lane', () => {
    const rows = [
      { id: 1, a: 'LIB', b: 'ALP', shareA: 40, others: 1000, base: 9000, booths: 3 },
      { id: 2, a: 'ALP', b: 'LIB', shareA: 70, others: 1000, base: 9000, booths: 3 },
      { id: 3, a: 'ALP', b: 'GRN', shareA: 80, others: 1000, base: 9000, booths: 3 },
    ] as const
    const lanes = flowLanes(rows)
    expect(lanes.map((l) => `${l.x}-${l.y}:${l.items.length}`)).toEqual(['ALP-LIB:2', 'ALP-GRN:1'])
    // Seat 1 listed the Liberal first at 40%, so it reads 60% to Labor in the Labor-first lane.
    expect(lanes[0]!.items.find((i) => i.id === 1)!.shareX).toBeCloseTo(60, 6)
  })
})
