import { describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import { CLOSEST_FROM_PCT, CLOSEST_MAX, CLOSE_WAIT_NOTE, changingSeats, closestSeats, marginWords, noPreferencesYet } from './closest'
import type { Seat } from './seats'

const seat = (id: number, name: string, leader: PartyBucket | null, pctA: number | null, o: Partial<Seat> = {}): Seat =>
  ({ id, name, leader, state: 'leading', tcp: leader && pctA !== null ? { a: leader, b: 'LIB', pctA } : null, pct: 50, ...o }) as Seat

describe('closestSeats', () => {
  it('orders by the smallest margin in points, not by lead against votes left', () => {
    const seats = [seat(1, 'Wide', 'ALP', 60), seat(2, 'Narrow', 'GRN', 50.1), seat(3, 'Middle', 'LIB', 53)]
    const r = closestSeats(seats, 40, false)!
    expect(r.cards.map((c) => c.name)).toEqual(['Narrow', 'Middle', 'Wide'])
    expect(r.cards[0]!.margin).toBeCloseTo(0.2)
  })

  it('orders by the votes the cards show, closest first, even when the points disagree', () => {
    // South Barwon: the narrower margin in points but the larger lead in votes (a bigger seat); the card says votes.
    const seats = [
      { ...seat(1, 'South Barwon', 'ALP', 50.1), marginVotes: 400 } as Seat,
      { ...seat(2, 'Carrum', 'LIB', 50.3), marginVotes: 300 } as Seat,
    ]
    expect(closestSeats(seats, 40, false)!.cards.map((c) => c.name)).toEqual(['Carrum', 'South Barwon'])
  })

  it('breaks ties by seat name', () => {
    const seats = [seat(1, 'Zed', 'ALP', 51), seat(2, 'Abbey', 'GRN', 51), seat(3, 'Mid', 'LIB', 51)]
    expect(closestSeats(seats, 40, false)!.cards.map((c) => c.name)).toEqual(['Abbey', 'Mid', 'Zed'])
  })

  it('shows nothing before 5% is counted, and from 5% on', () => {
    const seats = [seat(1, 'A', 'ALP', 51), seat(2, 'B', 'GRN', 52)]
    expect(CLOSEST_FROM_PCT).toBe(5)
    expect(closestSeats(seats, 4.99, false)).toBeNull()
    expect(closestSeats(seats, 5, false)).not.toBeNull()
  })

  it('leaves out seats with no margin or no leader yet', () => {
    const seats = [seat(1, 'NoTcp', 'ALP', null), seat(2, 'NoLeader', null, 51), seat(3, 'Ok', 'GRN', 52)]
    expect(closestSeats(seats, 40, false)!.cards.map((c) => c.name)).toEqual(['Ok'])
  })

  it('is null when no seat qualifies', () => {
    expect(closestSeats([seat(1, 'NoTcp', 'ALP', null)], 40, false)).toBeNull()
    expect(closestSeats([], 40, false)).toBeNull()
  })

  it('keeps at most six', () => {
    const seats = Array.from({ length: 12 }, (_, i) => seat(i + 1, `S${String(i).padStart(2, '0')}`, 'ALP', 51 + i))
    const r = closestSeats(seats, 40, false)!
    expect(CLOSEST_MAX).toBe(6)
    expect(r.cards).toHaveLength(6)
    expect(r.cards.map((c) => c.name)).toEqual(['S00', 'S01', 'S02', 'S03', 'S04', 'S05'])
  })

  it('heads the block "Closest seats" through the night and "Closest results" at Final', () => {
    const seats = [seat(1, 'A', 'ALP', 51)]
    expect(closestSeats(seats, 40, false)!.heading).toBe('Closest seats')
    expect(closestSeats(seats, 100, true)!.heading).toBe('Closest results')
  })

  it('names the leader and the margin without saying won', () => {
    const c = closestSeats([{ ...seat(1, 'Pascoe Vale', 'GRN', 50.1), marginVotes: 1204 } as Seat], 40, false)!.cards[0]!
    expect(c.line).toBe('About 1,200 votes ahead')
    expect(c.label).toBe('Pascoe Vale, Greens, ahead by about 1,200 votes, show on the map')
    expect(c.leader).toBe('GRN')
  })
})

describe('marginWords', () => {
  it('uses one decimal and the singular for exactly one', () => {
    expect(marginWords(0.04)).toEqual({ short: '0.0 pts', long: '0.0 points' })
    expect(marginWords(1)).toEqual({ short: '1.0 pts', long: '1.0 points' })
  })
})

describe('changingSeats (VE-189, FB-222)', () => {
  const ch = (id: number, name: string, leader: PartyBucket, base: PartyBucket, pctA: number, o: Partial<Seat> = {}): Seat =>
    ({ id, name, leader, base, changing: leader !== base, state: 'firm', tcp: { a: leader, b: base, pctA }, pct: 50, ...o }) as Seat

  it('offers only the seats that changed hands, closest first', () => {
    const seats = [ch(1, 'Wide', 'ALP', 'LIB', 60), ch(2, 'Narrow', 'GRN', 'ALP', 50.2), ch(3, 'Held', 'ALP', 'ALP', 50.1), ch(4, 'Middle', 'LIB', 'ALP', 53)]
    const r = changingSeats(seats, 40, false)!
    expect(r.cards.map((c) => c.name)).toEqual(['Narrow', 'Middle', 'Wide'])
  })

  it('reads as the handle does, and says changed at Final', () => {
    const seats = [ch(1, 'A', 'ALP', 'LIB', 55)]
    expect(changingSeats(seats, 40, false)!.heading).toBe('Seats changing hands since 2022')
    expect(changingSeats(seats, 40, true)!.heading).toBe('Seats that changed hands since 2022')
  })

  it('names who now leads, never a win before the seat is declared', () => {
    const live = changingSeats([ch(1, 'A', 'GRN', 'ALP', 52.5, { marginVotes: 1_960 })], 40, false)!.cards[0]!
    expect(live.line).toBe('Greens lead by about 2,000 votes')
    expect(live.label).toContain('Labor to Greens')
    const won = changingSeats([ch(1, 'A', 'GRN', 'ALP', 52.5, { state: 'won', marginVotes: 1_960 })], 40, true)!.cards[0]!
    expect(won.line).toBe('Greens won by about 2,000 votes')
  })

  it('uses the Gains bar: below 20% counted, or a lead not yet firm, offers nothing', () => {
    expect(changingSeats([ch(1, 'A', 'GRN', 'ALP', 52)], 19.9, false)).toBeNull()
    expect(changingSeats([ch(1, 'A', 'GRN', 'ALP', 52, { state: 'leading', pct: 1 })], 40, false)).toBeNull()
  })

  it('keeps at most six', () => {
    const seats = Array.from({ length: 9 }, (_, i) => ch(i + 1, `S${i}`, 'ALP', 'LIB', 51 + i))
    expect(changingSeats(seats, 40, false)!.cards).toHaveLength(CLOSEST_MAX)
  })
})

describe('noPreferencesYet (VE-254, F5: "0 close" is not a fact without two-candidate counts)', () => {
  it('is true when no seat has a two-candidate count or a withheld one', () => {
    expect(noPreferencesYet([seat(1, 'A', 'ALP', null), seat(2, 'B', null, null, { state: 'none' })])).toBe(true)
    expect(noPreferencesYet([])).toBe(true)
  })
  it('is false once any seat has a count after preferences, or the VEC withholds one', () => {
    expect(noPreferencesYet([seat(1, 'A', 'ALP', null), seat(2, 'B', 'GRN', 51)])).toBe(false)
    expect(noPreferencesYet([seat(1, 'A', 'ALP', null, { tcpWithheld: true })])).toBe(false)
  })
  it('has one plain line for the empty phone map', () => {
    expect(CLOSE_WAIT_NOTE).toBe('Close seats show once preferences are counted')
  })
})
