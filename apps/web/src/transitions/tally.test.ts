import type { PartyBucket } from '@vic26/schema'
import { describe, expect, it } from 'vitest'
import { assignSlots, blockSub, layoutArc, layoutBar, majorityOf, partyRank, SEATS } from './tally'

const seats = (parties: (PartyBucket | null)[]) => parties.map((party, i) => ({ id: 100 + i, party, x: (i * 37) % 11 }))

describe('assignSlots', () => {
  const parties: (PartyBucket | null)[] = ['LIB', 'ALP', null, 'GRN', 'ALP', 'NAT', 'IND', 'ALP', 'ONP', 'LIB']
  const a = assignSlots(seats(parties))

  it('gives one unique slot per seat', () => {
    expect(a.bySeat.size).toBe(parties.length)
    expect(new Set([...a.bySeat.values()].map((s) => s.slot)).size).toBe(parties.length)
  })
  it('sorts slots by party order, Labor left and Coalition right', () => {
    const bySlot = [...a.bySeat.entries()].sort((p, q) => p[1].slot - q[1].slot).map(([id]) => parties[id - 100] ?? null)
    const ranks = bySlot.map(partyRank)
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y))
    expect(bySlot[0]).toBe('ALP')
    expect(bySlot[bySlot.length - 1]).toBe('LIB')
  })
  it('ranks seats within their party block from 0', () => {
    const alp = [...a.bySeat.entries()].filter(([id]) => parties[id - 100] === 'ALP').map(([, s]) => s.rank)
    expect(alp.sort()).toEqual([0, 1, 2])
  })
  it('counts Labor, the Coalition (LIB + NAT), minors and undecided', () => {
    expect(a.counts.alp).toBe(3)
    expect(a.counts.coalition).toBe(3)
    expect(a.counts.undecided).toBe(1)
    expect(a.counts.minor.get('GRN')).toBe(1)
    expect(a.counts.minor.get('ONP')).toBe(1)
  })
  it('is stable: the same input gives the same slots', () => {
    expect(assignSlots(seats(parties)).bySeat).toEqual(a.bySeat)
  })
})

describe('layouts', () => {
  it('needs 45 of 88', () => {
    expect(majorityOf(88)).toBe(45)
  })
  it('bar: 88 slots, majority lines at 45 from the left and 45 from the right', () => {
    const w = 1000
    const l = layoutBar(w, 600)
    expect(l.slots).toHaveLength(SEATS)
    const x0 = l.slots[0]!.cx - l.slots[0]!.w / 2
    const sw = l.slots[0]!.w
    expect(l.lines[0]![0]).toBeCloseTo(x0 + 45 * sw, 6)
    expect(l.lines[1]![0]).toBeCloseTo(x0 + 43 * sw, 6)
    // 45 from the right is the same seat boundary as 43 from the left.
    expect(88 - 45).toBe(43)
  })
  it('arc: 88 slots inside the canvas, two majority lines', () => {
    const l = layoutArc(800, 500)
    expect(l.slots).toHaveLength(SEATS)
    expect(l.lines).toHaveLength(2)
    for (const s of l.slots) {
      expect(s.cx).toBeGreaterThan(0)
      expect(s.cx).toBeLessThan(800)
      expect(s.cy).toBeLessThanOrEqual(500)
    }
  })
})

describe('blockSub', () => {
  it('puts firm seats at the outer end of each block, as the top-band bar does', () => {
    const mk = (id: number, party: PartyBucket, firm: boolean) => ({ id, party, x: id, sub: blockSub(party, firm) })
    const a = assignSlots([mk(1, 'ALP', false), mk(2, 'ALP', true), mk(3, 'LIB', true), mk(4, 'LIB', false)])
    const slot = (id: number) => a.bySeat.get(id)!.slot
    expect(slot(2)).toBeLessThan(slot(1)) // Labor: firm on the left edge
    expect(slot(4)).toBeLessThan(slot(3)) // Coalition: firm on the right edge
  })
})
