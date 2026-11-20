import { describe, expect, it } from 'vitest'
import { flippedIds } from './flips'
import type { Seat } from './seats'

const seat = (id: number, leader: Seat['leader']): Seat => ({ id, name: `S${id}`, leader, state: 'leading', tcp: null, marginVotes: null }) as unknown as Seat
const m = (...s: Seat[]) => new Map(s.map((x) => [x.id, x]))

describe('flippedIds', () => {
  it('reports only seats whose leader changed between two leaders', () => {
    const prev = m(seat(1, 'ALP'), seat(2, 'LIB'), seat(3, null), seat(4, 'ALP'))
    const next = m(seat(1, 'LIB'), seat(2, 'LIB'), seat(3, 'ALP'), seat(4, null))
    expect(flippedIds(prev, next)).toEqual([1])
  })
  it('ignores a seat missing from the previous tick', () => {
    expect(flippedIds(m(), m(seat(1, 'ALP')))).toEqual([])
  })
})
