import { describe, expect, it } from 'vitest'
import type { PartyRow } from '../../lenspanel/party'
import { LIVE_MIN_PCT, liveMarker, liveRows, liveSentence, type LiveSeat } from './live'

const fed = (id: number, pct: number, over: Partial<PartyRow> = {}): PartyRow => ({ id, name: `Seat ${id}`, pct, stood: 1, partial: false, notStanding: false, ...over })
const seat = (id: number, counted: number | null, fp: LiveSeat['fp']): LiveSeat => ({ id, pct: counted, fp })

describe('liveRows (VE-270: the 2026 count replaces the 2025 estimate once a seat has enough counted)', () => {
  it('keeps the 2025 estimate before any figures', () => {
    expect(liveRows([fed(1, 4.2)], [], 'ONP')[0]).toMatchObject({ pct: 4.2, live: false, noFigures: false })
    expect(liveRows([fed(1, 4.2)], [seat(1, null, []), seat(2, 0, [])], 'ONP')[0]).toMatchObject({ pct: 4.2, live: false, noFigures: false })
  })

  it('from the first figures on, a seat below the gate is "no figures yet", never its 2025 estimate (VE-282)', () => {
    const rows = liveRows([fed(1, 4.2), fed(2, 9)], [seat(1, LIVE_MIN_PCT - 0.1, [{ party: 'ONP', pct: 30 }]), seat(2, 40, [{ party: 'ONP', pct: 12 }])], 'ONP')
    expect(rows.find((r) => r.id === 2)).toMatchObject({ live: true, noFigures: false, pct: 12 })
    expect(rows.find((r) => r.id === 1)).toMatchObject({ live: false, noFigures: true, pct: 0, notStanding: false })
  })

  it('uses tonight\'s first-preference share at the gate', () => {
    const rows = liveRows([fed(1, 4.2)], [seat(1, LIVE_MIN_PCT, [{ party: 'ALP', pct: 40 }, { party: 'ONP', pct: 18.5 }])], 'ONP')
    expect(rows[0]).toMatchObject({ pct: 18.5, live: true, notStanding: false, partial: false })
  })

  it('adds Liberal and National for the Coalition', () => {
    const rows = liveRows([fed(1, 20)], [seat(1, 40, [{ party: 'LIB', pct: 25 }, { party: 'NAT', pct: 5 }])], 'COA')
    expect(rows[0]!.pct).toBeCloseTo(30)
  })

  it('shows a party with no votes in a live seat as did not stand, not 0%', () => {
    const rows = liveRows([fed(1, 4.2)], [seat(1, 40, [{ party: 'ALP', pct: 60 }, { party: 'LIB', pct: 40 }])], 'GRN')
    expect(rows[0]).toMatchObject({ live: true, notStanding: true })
  })

  it('a federal did-not-stand seat below the gate is "no figures yet" once counting has started (we cannot know yet)', () => {
    const rows = liveRows([fed(1, 0, { notStanding: true, stood: 0, partial: true }), fed(2, 5)], [seat(1, 1, []), seat(2, 40, [{ party: 'GRN', pct: 9 }])], 'GRN')
    expect(rows.find((r) => r.id === 1)).toMatchObject({ live: false, noFigures: true, notStanding: false })
  })

  it('puts seats with no figures after the live ones, even a live 0%', () => {
    const rows = liveRows([fed(1, 9), fed(2, 3), fed(3, 3)], [seat(2, 50, [{ party: 'ONP', pct: 22 }]), seat(3, 50, [{ party: 'ALP', pct: 22 }])], 'ONP')
    expect(rows.map((r) => r.id)).toEqual([2, 3, 1])
  })

  it('sorts highest first after the switch', () => {
    const rows = liveRows([fed(1, 9), fed(2, 3)], [seat(2, 50, [{ party: 'ONP', pct: 22 }])], 'ONP')
    expect(rows.map((r) => r.id)).toEqual([2, 1])
  })
})

describe('words', () => {
  it('labels tonight\'s figure and the federal one differently', () => {
    const live = liveRows([fed(1, 4)], [seat(1, 40, [{ party: 'ONP', pct: 18.52 }])], 'ONP')[0]!
    expect(liveSentence(live, 'ONP')).toBe("Seat 1: One Nation 18.5% of first preferences in tonight's count.")
    expect(liveSentence({ ...live, live: false, pct: 4 }, 'ONP')).toContain('2025 federal election')
    expect(liveSentence({ ...live, live: false, noFigures: true }, 'ONP')).toBe(`Seat 1: no figures yet (under ${LIVE_MIN_PCT}% counted).`)
    expect(liveSentence({ ...live, notStanding: true }, 'GRN')).toBe('Seat 1: Greens did not stand here.')
  })

  it('marker: all federal, mixed, all live', () => {
    expect(liveMarker(0, 88)).toBe('From the 2025 federal election, mapped to state seats')
    expect(liveMarker(12, 88)).toBe("Tonight's count in 12 of 88 seats")
    expect(liveMarker(1, 88)).toBe("Tonight's count in 1 of 88 seats")
    expect(liveMarker(0, 88, true)).toBe(`Counting has started: no seat has ${LIVE_MIN_PCT}% counted yet`)
    expect(liveMarker(88, 88)).toBe("Tonight's count in every seat.")
    expect(liveMarker(88, 88, true, true)).toBe('Final count in every seat.')
  })
})
