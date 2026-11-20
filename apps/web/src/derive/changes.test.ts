import { describe, expect, it } from 'vitest'
import { changesBetween, FRESH_LIVE_MS, FRESH_REWIND_TICKS, freshness, type SeatChange } from './changes'
import type { Seat, SeatState } from './seats'

interface Over {
  leader?: Seat['leader']
  state?: SeatState
  pct?: number | null
  votes?: number
}
const seat = (id: number, o: Over = {}): Seat =>
  ({
    id,
    name: `S${id}`,
    leader: o.leader ?? null,
    state: o.state ?? 'leading',
    pct: o.pct ?? null,
    fp: o.votes ? [{ party: 'ALP', votes: o.votes, pct: 100 }] : [],
  }) as unknown as Seat
const m = (...s: Seat[]) => new Map(s.map((x) => [x.id, x]))

describe('changesBetween', () => {
  it('reports nothing when a snapshot changes nothing', () => {
    const a = m(seat(1, { leader: 'ALP', pct: 40, votes: 100 }), seat(2))
    expect(changesBetween(a, m(seat(1, { leader: 'ALP', pct: 40, votes: 100 }), seat(2))).size).toBe(0)
  })

  it('marks a seat whose count went up, with the rise in points', () => {
    const c = changesBetween(m(seat(1, { pct: 40, votes: 100 })), m(seat(1, { pct: 47, votes: 130 })))
    expect(c.get(1)).toEqual<SeatChange>({ counted: true, flipped: false, declared: false, countedDelta: 7 })
  })

  it('counts a first figure, or more votes at the same share, as counted up', () => {
    const first = changesBetween(m(seat(1)), m(seat(1, { pct: 3, votes: 20 })))
    expect(first.get(1)?.counted).toBe(true)
    expect(first.get(1)?.countedDelta).toBe(3)
    const more = changesBetween(m(seat(2, { pct: 50, votes: 100 })), m(seat(2, { pct: 50, votes: 120 })))
    expect(more.get(2)?.counted).toBe(true)
    expect(more.get(2)?.countedDelta).toBe(0)
  })

  it('does not mark a count that fell (a correction) as counted up', () => {
    expect(changesBetween(m(seat(1, { pct: 50, votes: 100 })), m(seat(1, { pct: 48, votes: 90 }))).size).toBe(0)
  })

  it('marks a flip only between two leaders, and a first leader is not one', () => {
    const c = changesBetween(
      m(seat(1, { leader: 'ALP', pct: 40, votes: 10 }), seat(2, { pct: 0 })),
      m(seat(1, { leader: 'LIB', pct: 41, votes: 11 }), seat(2, { leader: 'ALP', pct: 2, votes: 5 })),
    )
    expect(c.get(1)?.flipped).toBe(true)
    expect(c.get(2)?.flipped).toBe(false)
  })

  it('marks a seat newly declared once, even with no new votes', () => {
    const c = changesBetween(m(seat(1, { leader: 'ALP', state: 'firm', pct: 90, votes: 5 })), m(seat(1, { leader: 'ALP', state: 'won', pct: 90, votes: 5 })))
    expect(c.get(1)).toEqual<SeatChange>({ counted: false, flipped: false, declared: true, countedDelta: 0 })
    const again = changesBetween(m(seat(1, { leader: 'ALP', state: 'won', pct: 90, votes: 5 })), m(seat(1, { leader: 'ALP', state: 'won', pct: 90, votes: 5 })))
    expect(again.size).toBe(0)
  })

  it('ignores a seat missing from the previous tick', () => {
    expect(changesBetween(m(), m(seat(1, { pct: 5, votes: 9 }))).size).toBe(0)
  })
})

describe('freshness', () => {
  // Six ticks, 5 minutes apart. Seat 1 gains votes at ticks 1 and 4; seat 2 only at tick 2; seat 3 never.
  const votes: Record<number, number[]> = { 1: [1, 2, 2, 2, 3, 3], 2: [1, 1, 2, 2, 2, 2], 3: [1, 1, 1, 1, 1, 1] }
  const seatsAt = [0, 1, 2, 3, 4, 5].map((t) => m(...[1, 2, 3].map((id) => seat(id, { pct: votes[id]![t]!, votes: votes[id]![t]! }))))
  const ticks = seatsAt.map((_, i) => ({ snapshotAt: i * 300_000 }))

  it('live: 1 on the tick a seat was counted, and gone once the window has passed', () => {
    const f = freshness(seatsAt, ticks, 4, 'live')
    expect(f.get(1)).toBe(1)
    expect(f.has(2)).toBe(false) // counted two ticks (10 minutes) ago
    expect(f.has(3)).toBe(false) // never
    expect(freshness(seatsAt, ticks, 5, 'live').has(1)).toBe(false) // exactly one window ago
  })

  it('live: a seat counted a minute ago is still most of the way fresh', () => {
    const two = [m(seat(1, { pct: 1, votes: 1 })), m(seat(1, { pct: 2, votes: 2 })), m(seat(1, { pct: 2, votes: 2 }))]
    const t = [0, 60_000, 120_000].map((snapshotAt) => ({ snapshotAt }))
    expect(freshness(two, t, 2, 'live').get(1)).toBeCloseTo(1 - 60_000 / FRESH_LIVE_MS, 5)
  })

  it('Rewind: the window is counted in ticks, so it scales with the playback speed', () => {
    expect(freshness(seatsAt, ticks, 4, 'rewind').get(2)).toBeCloseTo(1 - 2 / FRESH_REWIND_TICKS, 5)
    expect(freshness(seatsAt, ticks, 5, 'rewind').get(1)).toBeCloseTo(1 - 1 / FRESH_REWIND_TICKS, 5)
    expect(freshness(seatsAt, ticks, 5, 'rewind').has(2)).toBe(false) // three ticks on: gone
  })

  it('has nothing at the first tick', () => {
    expect(freshness(seatsAt, ticks, 0, 'rewind').size).toBe(0)
  })
})
