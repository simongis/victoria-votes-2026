import { describe, expect, it } from 'vitest'
import type { DistrictHistoryRow, DistrictStatic } from '@vic26/schema'
import { WITHHELD_LINE, aboutVotes, countedLeadLine, headlineOf, panelLeadLine, projectedLeadLine, seatFromHistory, seatsFromRows, sideTotals, statsOf, stillToCountTotal, tallyOf, tcpBasisLine, type Seat } from './seats'

// Only the fields the derivation reads; the rest of DistrictStatic is irrelevant here.
const st = (over: Partial<DistrictStatic> = {}): DistrictStatic =>
  ({
    district_id: 1,
    district_name: 'Testville District',
    enrolment: 50_000,
    base_winner_party: 'LIB',
    base_source: 'SE2022',
    ...over,
  }) as DistrictStatic

const row = (over: Partial<DistrictHistoryRow> = {}): DistrictHistoryRow =>
  ({
    snapshot_id: '20221126_210000',
    snapshot_at: 0,
    district_id: 1,
    pct_counted: 40,
    pct_booths: 40,
    fp_ALP: 9_000,
    fp_LIB: 8_000,
    fp_NAT: 0,
    fp_GRN: 2_000,
    fp_ONP: 0,
    fp_IND: 0,
    fp_OTH: 1_000,
    fp_total: 20_000,
    lead_party: 'ALP',
    tcp_party_a: 'ALP',
    tcp_party_b: 'LIB',
    tcp_pct_a: 52,
    tcp_withheld: false,
    changed_hands: true,
    status: 'counting',
    ...over,
  }) as DistrictHistoryRow

describe('seatFromHistory', () => {
  it('has no leader before any figures', () => {
    const s = seatFromHistory(
      row({ fp_total: 0, pct_counted: 0, lead_party: null, tcp_party_a: null, tcp_party_b: null, tcp_pct_a: null, status: 'no_results' }),
      st(),
    )
    expect(s.leader).toBeNull()
    expect(s.state).toBe('none')
    expect(s.name).toBe('Testville')
    expect(s.base).toBe('LIB')
    expect(s.inDoubt).toBe(false)
  })

  it('leads (not firm) on a narrow 2CP margin with votes still to count', () => {
    const s = seatFromHistory(row(), st())
    expect(s.leader).toBe('ALP')
    expect(s.state).toBe('leading')
    expect(s.changing).toBe(true)
    expect(s.pct).toBe(40)
    expect(s.inDoubt).toBe(false)
    expect(s.tcp).toEqual({ a: 'ALP', b: 'LIB', pctA: 52 })
  })

  it('is in doubt under 52% two-candidate-preferred', () => {
    expect(seatFromHistory(row({ tcp_pct_a: 51.9 }), st()).inDoubt).toBe(true)
  })

  it('is firm when the margin exceeds the estimated votes left', () => {
    const s = seatFromHistory(row({ fp_total: 46_000, pct_counted: 92, tcp_pct_a: 80 }), st())
    expect(s.state).toBe('firm')
    expect(s.marginVotes).toBeGreaterThan(s.stillToCount ?? Infinity)
  })

  it('falls back to the first-preference leader when the 2CP count is withheld, and is never firm', () => {
    const s = seatFromHistory(row({ tcp_withheld: true, tcp_pct_a: null, tcp_party_a: null, tcp_party_b: null, lead_party: 'GRN' }), st())
    expect(s.leader).toBe('GRN')
    expect(s.state).toBe('leading')
    expect(s.tcpWithheld).toBe(true)
    expect(s.tcp).toBeNull()
    expect(s.inDoubt).toBe(true)
  })

  it('is won only when VEC has declared the seat', () => {
    const s = seatFromHistory(row({ status: 'declared', tcp_pct_a: 51 }), st())
    expect(s.state).toBe('won')
    expect(s.inDoubt).toBe(false)
  })

  it('carries first preferences by party, largest first, with shares of the total', () => {
    const s = seatFromHistory(row(), st())
    expect(s.fp.map((f) => f.party)).toEqual(['ALP', 'LIB', 'GRN', 'OTH'])
    expect(s.fp[0]).toEqual({ party: 'ALP', votes: 9_000, pct: 45 })
  })

  it('divides first preferences by formal votes, not by all ballots (informal counts in fp_total)', () => {
    // 52 + 43 = 95 formal of 100 ballots: VEC shows 54.7%, not 52%.
    const s = seatFromHistory(row({ fp_total: 100, fp_ALP: 52, fp_LIB: 43, fp_GRN: 0, fp_OTH: 0 }), st())
    expect(s.fp[0]!.pct).toBeCloseTo(54.7, 1)
    expect(s.fp[1]!.pct).toBeCloseTo(45.3, 1)
  })

  it('names the later baseline for Prahran-style seats', () => {
    expect(seatFromHistory(row(), st({ base_source: 'PRAHRAN_BY_2025' })).baseNote).toBe('2025 by-election')
  })
})

describe('seatsFromRows', () => {
  it('gives every district a seat, blank where the tick has no row', () => {
    const statics = [st(), st({ district_id: 2, district_name: 'Otherton District' })]
    const seats = seatsFromRows([row()], statics)
    expect(seats.size).toBe(2)
    expect(seats.get(1)?.leader).toBe('ALP')
    expect(seats.get(2)?.state).toBe('none')
  })
})

const seat = (id: number, leader: Seat['leader'], state: Seat['state'], extra: Partial<Seat> = {}): Seat => ({
  ...seatFromHistory(row({ district_id: id }), st({ district_id: id })),
  leader,
  state,
  ...extra,
})

describe('tally and headline', () => {
  const seats = new Map<number, Seat>([
    [1, seat(1, 'ALP', 'firm')],
    [2, seat(2, 'ALP', 'leading')],
    [3, seat(3, 'LIB', 'won')],
    [4, seat(4, 'NAT', 'leading')],
    [5, seat(5, 'GRN', 'leading')],
    [6, seat(6, null, 'none')],
  ])

  it('counts firm-or-won and leading seats per party', () => {
    const t = tallyOf(seats)
    expect(t.firm.ALP).toBe(1)
    expect(t.leading.ALP).toBe(1)
    expect(t.firm.LIB).toBe(1)
    expect(t.leading.NAT).toBe(1)
    expect(t.leading.GRN).toBe(1)
  })

  it('adds Liberal and Nationals into the Coalition', () => {
    const s = sideTotals(tallyOf(seats))
    expect(s.ALP).toEqual({ firm: 1, all: 2 })
    expect(s.COA).toEqual({ firm: 1, all: 2 })
    expect(s.GRN).toEqual({ firm: 0, all: 1 })
  })

  it('reports leads, never calls government', () => {
    expect(headlineOf(tallyOf(seats))).toBe('Labor and Coalition level on 2')
    seats.set(6, seat(6, 'ALP', 'leading'))
    expect(headlineOf(tallyOf(seats))).toBe('Labor ahead in 3 seats')
    expect(headlineOf(tallyOf(new Map()))).toBe('Waiting for the first figures')
  })

  it('counts seats in doubt and changing hands', () => {
    const m = new Map<number, Seat>([
      [1, seat(1, 'ALP', 'leading', { inDoubt: true, changing: true })],
      [2, seat(2, 'LIB', 'firm', { inDoubt: false, changing: false })],
    ])
    expect(statsOf(m)).toEqual({ inDoubt: 1, close: 0, changing: 1, reporting: 2 })
  })
})

describe('stillToCountTotal and aboutVotes (VE-92)', () => {
  const withStill = (n: number | null): Seat => ({ ...seatFromHistory(row(), st()), stillToCount: n })

  it('sums the seats that have an estimate and ignores nulls', () => {
    const seats = new Map([[1, withStill(1_000)], [2, withStill(null)], [3, withStill(2_500)]])
    expect(stillToCountTotal(seats)).toBe(3_500)
  })

  it('is null when no seat has an estimate yet', () => {
    expect(stillToCountTotal(new Map([[1, withStill(null)]]))).toBeNull()
    expect(stillToCountTotal(new Map())).toBeNull()
  })

  it('rounds to a friendly "about" figure', () => {
    expect(aboutVotes(1_240_000)).toBe('about 1.2 million')
    expect(aboutVotes(1_960_000)).toBe('about 2 million')
    expect(aboutVotes(1_000_000)).toBe('about 1 million')
    expect(aboutVotes(483_400)).toBe('about 480,000')
    expect(aboutVotes(7_200)).toBe('about 7,000')
    expect(aboutVotes(0)).toBe('none')
  })
})

// VE-139: Lara at 9 pm on the replay (snapshot 20221126_210006). The final-two count covers only the booths that have
// finished preferences (4,691 votes); first preferences cover every counted booth (15,846 formal votes). Both are
// right, but they are different bases, so the panel says which is which and calls the lead a projection.
describe('Lara 9 pm panel figures (VE-139)', () => {
  const LARA = { alp: 3173, lib: 1518, fpFormal: 7996 + 3476 + 1679 + 400 + 2295, tcpPctA: 67.64, fpTotal: 16857 }

  it('says how many votes the final-two count covers, out of the votes counted', () => {
    expect(tcpBasisLine(LARA.alp + LARA.lib, LARA.fpFormal)).toBe('Preferences counted for 4,691 of 15,846 votes')
  })

  it('says nothing when the feed gives no final-two votes, or when it covers every counted vote', () => {
    expect(tcpBasisLine(0, LARA.fpFormal)).toBeNull()
    expect(tcpBasisLine(15_846, 15_846)).toBeNull()
  })

  it('projects the lead from the final-two share onto all counted votes, and names it a projection', () => {
    const margin = Math.round((Math.abs(2 * LARA.tcpPctA - 100) / 100) * LARA.fpTotal * 0.95)
    expect(margin).toBe(5650)
    expect(projectedLeadLine(margin, 25_812)).toBe('If the rest of the vote splits the same way, the lead would be about 5,700. About 26,000 votes still to count.')
    expect(projectedLeadLine(40, 25_812)).toBe('If the rest of the vote splits the same way, the lead would be under 100. About 26,000 votes still to count.')
    expect(projectedLeadLine(5650, 0)).toBe('If the rest of the vote splits the same way, the lead would be about 5,700. Nothing left to count.')
  })
})

describe('a declared seat has nothing left to count (VE-153)', () => {
  it('reads zero votes to count, so the Final band does not talk of votes to come', () => {
    const counting = seatFromHistory(row({ fp_total: 20_000, pct_counted: 40 }), st())
    expect(counting.stillToCount).toBeGreaterThan(0)
    const declared = seatFromHistory(row({ fp_total: 20_000, pct_counted: 40, status: 'declared' }), st())
    expect(declared.stillToCount).toBe(0)
  })
})

// VE-226, ADR 0033: "Likely" needs a margin, not just a count. On the 2022 replay at 9 pm all the seats shown as changing
// hands were wrong, and 11 seats were "Likely" for the party that lost at up to 56.6% after preferences.
describe('Likely needs 30% counted, 57% after preferences and preferences for half the counted votes (ADR 0033)', () => {
  it('is not Likely on a count alone: 40% counted at 56.9% stays an early lead', () => {
    const s = seatFromHistory(row({ pct_counted: 40, tcp_pct_a: 56.9 }), st())
    expect(s.state).toBe('leading')
    expect(s.likely).toBe(false)
  })

  it('is Likely at 57% after preferences once 30% is counted', () => {
    expect(seatFromHistory(row({ pct_counted: 30, tcp_pct_a: 57 }), st()).likely).toBe(true)
    expect(seatFromHistory(row({ pct_counted: 29.9, tcp_pct_a: 70 }), st()).likely).toBe(false)
  })

  it('needs a count after preferences: a first-preference lead alone is never Likely', () => {
    const s = seatFromHistory(row({ pct_counted: 60, tcp_party_a: null, tcp_party_b: null, tcp_pct_a: null, lead_party: 'ALP' }), st())
    expect(s.likely).toBe(false)
  })

  it('is not Likely while preferences cover under half the counted votes, and is once they cover half', () => {
    // 20,000 ballots, 19,000 formal: 9,000 votes after preferences is under half, 9,500 is half.
    expect(seatFromHistory(row({ pct_counted: 40, tcp_pct_a: 75 }), st(), 9_000).likely).toBe(false)
    expect(seatFromHistory(row({ pct_counted: 40, tcp_pct_a: 75 }), st(), 9_500).likely).toBe(true)
  })

  it('a firm or declared seat is not also Likely (it is a step above)', () => {
    expect(seatFromHistory(row({ fp_total: 46_000, pct_counted: 92, tcp_pct_a: 80 }), st()).likely).toBe(false)
    expect(seatFromHistory(row({ status: 'declared', tcp_pct_a: 80 }), st()).likely).toBe(false)
  })
})

// VE-226, finding 4: the lead in votes was projected from a sliver of preferences (Prahran at 9 pm: 9,000 from 1,146 votes).
describe('the lead after preferences while preferences cover under half the counted votes (finding 4)', () => {
  // Prahran at 9 pm on the replay: Greens 74.96% of 1,146 votes after preferences; 18,492 formal of about 19,500 ballots.
  const prahran = row({ pct_counted: 40, fp_total: 19_500, tcp_party_a: 'GRN', tcp_party_b: 'LIB', tcp_pct_a: 74.96, lead_party: 'GRN' })

  it('is the actual gap counted after preferences, not a projection, and never certain', () => {
    const s = seatFromHistory(prahran, st({ enrolment: 21_000 }), 1_146)
    expect(s.marginCounted).toBe(true)
    expect(s.marginVotes).toBe(572)
    expect(s.state).toBe('leading')
    expect(s.prefsShare).toBeCloseTo(1_146 / (19_500 * 0.95), 3)
  })

  it('projects as before once preferences cover half the counted votes, or when the source cannot say', () => {
    const half = seatFromHistory(prahran, st({ enrolment: 21_000 }), 10_000)
    expect(half.marginCounted).toBe(false)
    expect(half.marginVotes).toBe(Math.round(0.4992 * 19_500 * 0.95))
    const unknown = seatFromHistory(prahran, st({ enrolment: 21_000 }))
    expect(unknown.prefsShare).toBeNull()
    expect(unknown.marginCounted).toBe(false)
  })

  it('says the counted gap in plain words', () => {
    expect(countedLeadLine('Greens', 572, 1_146)).toBe('Greens ahead by 572 of 1,146 votes counted after preferences.')
    expect(countedLeadLine('Labor', 0, 2_000)).toBe('Labor level on 2,000 votes counted after preferences.')
  })
})

// VE-226, finding 3: a seat whose two-candidate count the VEC withholds (Maverick) is a three-way seat where the
// first-preference leader may well lose. 2022 has no such seat, so these are fixture rows.
describe('a withheld two-candidate count (finding 3)', () => {
  const withheld = row({ pct_counted: 80, fp_total: 40_000, tcp_withheld: true, tcp_party_a: null, tcp_party_b: null, tcp_pct_a: null, lead_party: 'GRN' })

  it('is always the faint step: never Likely or certain, however much is counted', () => {
    const s = seatFromHistory(withheld, st())
    expect(s.leader).toBe('GRN')
    expect(s.state).toBe('leading')
    expect(s.likely).toBe(false)
    expect(s.marginVotes).toBeNull()
  })

  it('stays in the close count', () => {
    const s = seatFromHistory(withheld, st())
    expect(s.close).toBe(true)
    expect(s.inDoubt).toBe(true)
  })

  it('has its own plain words', () => {
    expect(WITHHELD_LINE).toBe('Ahead on first preferences. The VEC is still working out the final two.')
  })
})

// VE-226, finding 7: seats with no count after preferences are unknown, not close. "N close" counts seats close on a real
// count (under 52% after preferences) and withheld seats; the rest of the in-doubt set waits for preferences.
describe('close is a real count; no preference count yet is its own state (finding 7)', () => {
  it('a seat under 52% after preferences is close', () => {
    const s = seatFromHistory(row({ tcp_pct_a: 51.5 }), st())
    expect(s.close).toBe(true)
    expect(s.noPrefs).toBe(false)
  })

  it('a counted seat with no count after preferences is waiting, not close, and still in doubt', () => {
    const s = seatFromHistory(row({ tcp_party_a: null, tcp_party_b: null, tcp_pct_a: null }), st())
    expect(s.close).toBe(false)
    expect(s.noPrefs).toBe(true)
    expect(s.inDoubt).toBe(true)
  })

  it('a declared seat is neither', () => {
    const s = seatFromHistory(row({ tcp_pct_a: 50.5, status: 'declared' }), st())
    expect(s.close).toBe(false)
    expect(s.noPrefs).toBe(false)
  })

  it('statsOf counts close seats apart from the wider in-doubt set', () => {
    const m = new Map<number, Seat>([
      [1, seatFromHistory(row({ district_id: 1, tcp_pct_a: 51 }), st({ district_id: 1 }))],
      [2, seatFromHistory(row({ district_id: 2, tcp_party_a: null, tcp_party_b: null, tcp_pct_a: null }), st({ district_id: 2 }))],
      [3, seatFromHistory(row({ district_id: 3, tcp_pct_a: 60 }), st({ district_id: 3 }))],
    ])
    expect(statsOf(m)).toMatchObject({ inDoubt: 2, close: 1 })
  })
})

// VE-226 (finding 4): the panel's lead line. The candidates' votes after preferences say how much of the count the share is
// built on; under half, the panel says the gap counted, not a projection.
describe('panelLeadLine (finding 4)', () => {
  const prahran = seatFromHistory(row({ pct_counted: 40, fp_total: 19_500, tcp_party_a: 'GRN', tcp_party_b: 'LIB', tcp_pct_a: 74.96, lead_party: 'GRN' }), st({ enrolment: 21_000 }))

  it('says the counted gap while preferences cover under half the counted votes', () => {
    expect(panelLeadLine(prahran, { a: 859, b: 287 }, 18_492)).toBe('Greens ahead by 572 of 1,146 votes counted after preferences.')
  })

  it('projects once preferences cover half the counted votes, and without candidate figures', () => {
    expect(panelLeadLine(prahran, { a: 7_000, b: 2_500 }, 18_492)).toMatch(/^If the rest of the vote splits the same way, the lead would be about /)
    expect(panelLeadLine(prahran, null, null)).toMatch(/^If the rest of the vote splits the same way/)
  })

  it('says the counted gap from the seat alone when the history knew the preferences were thin', () => {
    const thin = seatFromHistory(row({ pct_counted: 40, fp_total: 19_500, tcp_party_a: 'GRN', tcp_party_b: 'LIB', tcp_pct_a: 74.96, lead_party: 'GRN' }), st({ enrolment: 21_000 }), 1_146)
    expect(panelLeadLine(thin, null, null)).toBe('Greens ahead by 572 votes counted after preferences.')
  })

  it('has nothing to say for a declared seat, a withheld seat or one with no count after preferences', () => {
    expect(panelLeadLine({ ...prahran, state: 'won' }, null, null)).toBeNull()
    expect(panelLeadLine(seatFromHistory(row({ tcp_withheld: true, tcp_party_a: null, tcp_party_b: null, tcp_pct_a: null }), st()), null, null)).toBeNull()
  })
})

describe('declared winner (ADR 0034)', () => {
  const declaredRow = (over: Partial<DistrictHistoryRow> = {}) =>
    row({ status: 'declared', tcp_party_a: 'LIB', tcp_party_b: 'ALP', tcp_pct_a: 51, lead_party: 'LIB', ...over })

  it('names the Elected party, not the two-candidate leader, which can be on the wrong pair', () => {
    const s = seatFromHistory(declaredRow({ elected_party: 'ALP' }), st())
    expect(s.state).toBe('won')
    expect(s.leader).toBe('ALP')
  })

  it('ADR 0036: a declared seat with no Elected flag falls back to the two-candidate leader and counts for them', () => {
    const s = seatFromHistory(declaredRow({ elected_party: null }), st())
    expect(s.state).toBe('won')
    expect(s.leader).toBe('LIB')
    const t = tallyOf(new Map([[1, s]]))
    expect(t.firm.LIB + t.leading.LIB).toBe(1)
    // A row from a view without the field is the same.
    expect(seatFromHistory(declaredRow({ elected_party: undefined as never }), st()).leader).toBe('LIB')
  })

  it('falls back to the first-preference leader when the two-candidate count is withheld, never to nobody', () => {
    const s = seatFromHistory(declaredRow({ elected_party: null, tcp_withheld: true, tcp_party_a: null, tcp_party_b: null, tcp_pct_a: null, lead_party: 'GRN' }), st())
    expect(s.leader).toBe('GRN')
  })

  it('an undeclared seat is unaffected by elected_party', () => {
    const s = seatFromHistory(row({ elected_party: 'GRN' }), st())
    expect(s.leader).toBe('ALP')
  })
})
