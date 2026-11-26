import { describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import { focusDetail, focusName, focusSummary, type FocusDetail, focusParties, inFocus, parseFocus, popStyle, toggleFocus, withFocus, withStatus } from './focus'
import type { Seat } from './seats'

const seat = (id: number, leader: PartyBucket | null, state: Seat['state'], inDoubt = false, close = inDoubt) => ({ id, leader, state, inDoubt, close, noPrefs: inDoubt && !close }) as Seat

describe('focus', () => {
  it('the Coalition covers Liberal and Nationals, the crossbench the three others; a party covers itself', () => {
    expect(focusParties('COA')).toEqual(['LIB', 'NAT'])
    expect(focusParties('XB')).toEqual(['IND', 'OTH'])
    expect(focusParties('GRN')).toEqual(['GRN'])
    expect(focusParties('LIB:pale')).toEqual(['LIB'])
  })
  it('reads a party and an optional part (strong is firm or won, pale is leading)', () => {
    expect(parseFocus('ALP')).toEqual({ who: 'ALP', part: null })
    expect(parseFocus('COA:strong')).toEqual({ who: 'COA', part: 'strong' })
    expect(parseFocus('NAT:pale')).toEqual({ who: 'NAT', part: 'pale' })
  })
  it('everything is in focus when nothing is picked; otherwise only the party leader seats', () => {
    expect(inFocus(null, null)).toBe(true)
    expect(inFocus('ALP', 'ALP')).toBe(true)
    expect(inFocus('ALP', 'LIB')).toBe(false)
    expect(inFocus('ALP', null)).toBe(false)
    expect(inFocus('COA', 'NAT')).toBe(true)
    expect(inFocus('XB', 'IND')).toBe(true)
    expect(inFocus('XB', 'GRN')).toBe(false)
    // VE-131: One Nation is its own pick, never folded into Others.
    expect(inFocus('XB', 'ONP')).toBe(false)
    expect(inFocus('ONP', 'ONP')).toBe(true)
  })
  it('a part keeps only the firm and won seats (strong) or only the leading ones (pale)', () => {
    expect(inFocus('ALP:strong', seat(1, 'ALP', 'firm'))).toBe(true)
    expect(inFocus('ALP:strong', seat(1, 'ALP', 'won'))).toBe(true)
    expect(inFocus('ALP:strong', seat(1, 'ALP', 'leading'))).toBe(false)
    expect(inFocus('ALP:pale', seat(1, 'ALP', 'leading'))).toBe(true)
    expect(inFocus('ALP:pale', seat(1, 'ALP', 'firm'))).toBe(false)
    expect(inFocus('COA:pale', seat(1, 'NAT', 'leading'))).toBe(true)
    expect(inFocus('ALP:pale', seat(1, 'LIB', 'leading'))).toBe(false)
    expect(inFocus('ALP', seat(1, 'ALP', 'leading'))).toBe(true)
    expect(inFocus(null, seat(1, null, 'none'))).toBe(true)
    // A leader alone carries no state, so a part cannot narrow it (the rail filters by party only).
    expect(inFocus('ALP:pale', 'ALP')).toBe(true)
  })
  it('choosing the focused party again clears it, and a part is its own choice', () => {
    expect(toggleFocus(null, 'ALP')).toBe('ALP')
    expect(toggleFocus('ALP', 'LIB')).toBe('LIB')
    expect(toggleFocus('ALP', 'ALP')).toBeNull()
    expect(toggleFocus('ALP', 'ALP:pale')).toBe('ALP:pale')
    expect(toggleFocus('ALP:pale', 'ALP:pale')).toBeNull()
  })
  it('names the pick in plain words', () => {
    expect(focusName('ALP')).toBe('Labor')
    expect(focusName('COA')).toBe('Coalition')
    expect(focusName('XB')).toBe('All others')
    expect(focusName('ALP:strong')).toBe('Labor, certain')
    expect(focusName('NAT:pale')).toBe('Nationals, leading')
  })
  it('an in-doubt pick lights the in-doubt seats whatever their leader, and a bare leader (the rail) cannot tell', () => {
    expect(inFocus('DOUBT', seat(1, 'ALP', 'leading', true))).toBe(true)
    expect(inFocus('DOUBT', seat(2, null, 'none', true))).toBe(true)
    expect(inFocus('DOUBT', seat(3, 'ALP', 'won'))).toBe(false)
    expect(inFocus('DOUBT', seat(4, 'LIB', 'firm'))).toBe(false)
    // The rail's own status chip does the narrowing, so a bare leader passes.
    expect(inFocus('DOUBT', 'ALP')).toBe(true)
    expect(focusParties('DOUBT')).toEqual([])
  })
  it('picks in doubt toggles and is named in plain words', () => {
    expect(toggleFocus(null, 'DOUBT')).toBe('DOUBT')
    expect(toggleFocus('DOUBT', 'DOUBT')).toBeNull()
    expect(toggleFocus('DOUBT', 'ALP')).toBe('ALP')
    expect(toggleFocus('ALP', 'DOUBT')).toBe('DOUBT')
    expect(focusName('DOUBT')).toBe('Close seats')
  })
  it('the in-doubt pick counts the in-doubt seats', () => {
    const seats = new Map<number, Seat>([
      [1, seat(1, 'ALP', 'leading', true)],
      [2, seat(2, 'LIB', 'firm')],
      [3, seat(3, null, 'none', true)],
    ])
    expect(focusDetail(seats, 'DOUBT')).toEqual({ name: 'Close seats', total: 2, declared: 0, firm: 0, leading: 1, inDoubt: 2 })
  })
  it('the band button and the rail chip are one pick: setting or clearing either moves both, a party replaces it', () => {
    const none = { focus: null, status: null }
    expect(withFocus(none, 'DOUBT')).toEqual({ focus: 'DOUBT', status: 'doubt' })
    expect(withStatus(none, 'doubt')).toEqual({ focus: 'DOUBT', status: 'doubt' })
    expect(withFocus({ focus: 'DOUBT', status: 'doubt' }, null)).toEqual(none)
    expect(withStatus({ focus: 'DOUBT', status: 'doubt' }, null)).toEqual(none)
    expect(withFocus({ focus: 'DOUBT', status: 'doubt' }, 'ALP')).toEqual({ focus: 'ALP', status: null })
    // The other chips are their own filters and stay out of the way of a party pick, and of the doubt pick being cleared.
    expect(withFocus({ focus: null, status: 'won' }, 'ALP')).toEqual({ focus: 'ALP', status: 'won' })
    expect(withStatus({ focus: 'DOUBT', status: 'doubt' }, 'won')).toEqual({ focus: null, status: 'won' })
    expect(withStatus({ focus: 'ALP', status: null }, 'won')).toEqual({ focus: 'ALP', status: 'won' })
    expect(withStatus({ focus: 'ALP', status: null }, 'doubt')).toEqual({ focus: 'DOUBT', status: 'doubt' })
  })
  it('the pop is staggered by a few tens of ms and the stagger is capped', () => {
    expect(popStyle(0, 1.15)).toEqual({ '--pop-delay': '0ms', '--pop-scale': '1.15' })
    expect(popStyle(3, 1.15)['--pop-delay']).toBe('90ms')
    expect(popStyle(60, 2)['--pop-delay']).toBe('420ms')
  })
  it('counts leading, declared and in-doubt seats for the focus', () => {
    const seats = new Map<number, Seat>([
      [1, seat(1, 'ALP', 'won')],
      [2, seat(2, 'ALP', 'firm')],
      [3, seat(3, 'ALP', 'leading', true)],
      [4, seat(4, 'LIB', 'leading', true)],
      [5, seat(5, 'NAT', 'won')],
      [6, seat(6, null, 'none', true)],
    ])
    expect(focusDetail(seats, 'ALP')).toEqual({ name: 'Labor', total: 3, declared: 1, firm: 1, leading: 1, inDoubt: 1 })
    expect(focusDetail(seats, 'COA')).toEqual({ name: 'Coalition', total: 2, declared: 1, firm: 0, leading: 1, inDoubt: 1 })
    expect(focusDetail(seats, 'ALP:pale')).toEqual({ name: 'Labor, leading', total: 1, declared: 0, firm: 0, leading: 1, inDoubt: 1 })
    expect(focusDetail(seats, 'ALP:strong')).toEqual({ name: 'Labor, certain', total: 2, declared: 1, firm: 1, leading: 0, inDoubt: 0 })
  })
})

describe('focusSummary (VE-109)', () => {
  const d = (over: Partial<FocusDetail>): FocusDetail => ({ name: 'Close seats', total: 10, declared: 0, firm: 0, leading: 10, inDoubt: 10, ...over })
  it('says the in-doubt pick as one plain phrase', () => {
    expect(focusSummary('DOUBT', d({}))).toBe('10 close seats')
    expect(focusSummary('DOUBT', d({ total: 1, inDoubt: 1 }))).toBe('1 close seat')
  })
  it('the close-seats pick is the close seats only, not those waiting for a count after preferences (VE-226, finding 7)', () => {
    const seats = new Map<number, Seat>([
      [1, seat(1, 'ALP', 'leading', true)],
      [2, seat(2, 'LIB', 'leading', true, false)],
    ])
    expect(focusDetail(seats, 'DOUBT')).toMatchObject({ total: 1, inDoubt: 1 })
    expect(inFocus('DOUBT', seats.get(2)!)).toBe(false)
  })
  it('says the party won its seats, with no breakdown, once every one is declared (VE-153)', () => {
    expect(focusSummary('ALP', d({ name: 'Labor', total: 56, declared: 56, firm: 0, leading: 0, inDoubt: 0 }))).toBe('Labor won 56 seats')
    expect(focusSummary('ALP', d({ name: 'Greens', total: 1, declared: 1, firm: 0, leading: 0, inDoubt: 0 }))).toBe('Greens won 1 seat')
  })
  it('keeps the breakdown for a party pick', () => {
    expect(focusSummary('ALP', d({ name: 'Labor', total: 5, declared: 1, firm: 1, leading: 3, inDoubt: 2 }))).toBe('Labor 5 seats: 1 declared, 1 certain, 3 leading, 2 close')
  })
})
