import { describe, expect, it } from 'vitest'
import { BIGGEST_MAX, biggestMoves, type MoveInput } from './biggestMoves'

// Lines are the holder-signed lead in points (derive/pulse.ts): positive while the holder is ahead.
const seat = (id: number, name: string, line: (number | null)[], holder: MoveInput['holder'] = 'ALP', other: MoveInput['other'] = 'GRN'): MoveInput => ({ id, name, line, holder, other })

describe('biggestMoves', () => {
  it('puts seats whose leader changed first, largest move first, then the biggest moves without a change', () => {
    const r = biggestMoves(
      [
        seat(1, 'Steady big', [10, 30]), // moved 20, no change
        seat(2, 'Flip small', [2, -3]), // changed, moved 5
        seat(3, 'Flip big', [8, -12]), // changed, moved 20
        seat(4, 'Steady small', [10, 14]), // moved 4
      ],
      false,
    )!
    expect(r.cards.map((c) => c.name)).toEqual(['Flip big', 'Flip small', 'Steady big', 'Steady small'])
    expect(r.cards.map((c) => c.changed)).toEqual([true, true, false, false])
  })

  it('breaks ties by seat name', () => {
    const r = biggestMoves([seat(1, 'Zed', [1, -5]), seat(2, 'Abbey', [1, -5]), seat(3, 'Mid', [1, -5])], false)!
    expect(r.cards.map((c) => c.name)).toEqual(['Abbey', 'Mid', 'Zed'])
  })

  it('leaves out seats with fewer than two points on their line, and gaps do not count', () => {
    const r = biggestMoves([seat(1, 'None', []), seat(2, 'One', [null, 5, null]), seat(3, 'Gap', [null, 5, null, 9]), seat(4, 'Null', [null, null])], false)!
    expect(r.cards.map((c) => c.name)).toEqual(['Gap'])
  })

  it('offers at most six', () => {
    const many = Array.from({ length: 10 }, (_, i) => seat(i + 1, `S${i + 1}`, [0.5, 5 + i * 3]))
    expect(BIGGEST_MAX).toBe(6)
    expect(biggestMoves(many, false)!.cards).toHaveLength(6)
    expect(biggestMoves(many, false)!.cards[0]!.name).toBe('S10')
  })

  it('says who the lead changed from and to, from the holder side of the line', () => {
    const r = biggestMoves([seat(1, 'Northcote', [6, -4], 'ALP', 'GRN')], false)!
    expect(r.cards[0]).toMatchObject({ leader: 'GRN', from: 'ALP', changed: true, line: 'Lead changed: Labor to Greens' })
    expect(r.cards[0]!.label).toBe('Northcote, lead changed from Labor to Greens, show on the grid')
    const back = biggestMoves([seat(2, 'Back', [-6, 4], 'ALP', 'GRN')], false)!
    expect(back.cards[0]).toMatchObject({ leader: 'ALP', from: 'GRN', line: 'Lead changed: Greens to Labor' })
  })

  it('says the leader lead is up or down, never won', () => {
    const up = biggestMoves([seat(1, 'Up', [10, 16])], false)!.cards[0]!
    expect(up.line).toBe('Labor lead up 6 pts')
    expect(up.label).toBe('Up, Labor lead up 6 points, show on the grid')
    // The challenger leads and their lead falls: down, in the challenger's terms.
    const down = biggestMoves([seat(2, 'Down', [-20, -13])], false)!.cards[0]!
    expect(down.line).toBe('Greens lead down 7 pts')
    expect(up.line + down.line).not.toMatch(/won/i)
  })

  it('treats a tick on zero as a tie, not a change, and skips moves that round to nothing', () => {
    expect(biggestMoves([seat(1, 'Tie', [5, 0, 7])], false)!.cards[0]!.changed).toBe(false)
    expect(biggestMoves([seat(1, 'Flat', [5, 5.2])], false)).toBeNull()
  })

  it('a lead that crossed and came back is a move in the lead, not a change', () => {
    const c = biggestMoves([seat(1, 'Round trip', [4, -2, 9])], false)!.cards[0]!
    expect(c.changed).toBe(false)
    expect(c.line).toBe('Labor lead up 5 pts')
  })

  it('a seat with no holder in the pairing still reads from the leader side', () => {
    const c = biggestMoves([seat(1, 'New', [3, 9], 'LIB', null)], false)!.cards[0]!
    expect(c.line).toBe('Liberal lead up 6 pts')
  })

  it('heading: tonight while live, of the night at Final; null when nothing moved', () => {
    const s = [seat(1, 'A', [1, 9])]
    expect(biggestMoves(s, false)!.heading).toBe('Biggest moves tonight')
    expect(biggestMoves(s, true)!.heading).toBe('Biggest moves of the night')
    expect(biggestMoves([], false)).toBeNull()
  })
})
