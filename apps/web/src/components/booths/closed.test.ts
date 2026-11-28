import { describe, expect, it } from 'vitest'
import { boothLabel, buildDots, R_CLOSED, type DotInput } from './dots'
import { redirectOf } from './panelInput'
import { CLOSED_PLACES, closedEarlyWords } from '../../data/closedPlaces'
import { placePanel, type PlaceInput } from '../../derive/boothPanel'

// VE-306: Keysborough Gardens (19553) and Chapel (18556), both in Mordialloc (15919), as the booth layer has them.
const gardens = { id: 19553, name: 'Keysborough Gardens', districtId: 15919, e: 1, n: 1 }
const chapel = { id: 18556, name: 'Chapel', districtId: 15919, e: 2, n: 2 }
const other = { id: 5, name: 'Elsewhere', districtId: 15919, e: 3, n: 3 }

const dotInput = (): DotInput => ({
  booths: [gardens, chapel, other],
  byBooth: new Map(),
  maxFormal: 800,
  at: 200,
  focus: null,
  seats: new Map([[15919, { name: 'Mordialloc', close: false }]]),
  selected: null,
})

describe('closed place dot and label', () => {
  it('marks only the closed place, as a ring-sized dot', () => {
    const dots = buildDots(dotInput())
    expect(dots.find((d) => d.id === 19553)).toMatchObject({ closed: true, r0: R_CLOSED, leader: null })
    expect(dots.find((d) => d.id === 18556)?.closed).toBeUndefined()
  })
  it('stays drawn in Rewind (reportedOnly), where waiting places are dropped', () => {
    const ids = buildDots({ ...dotInput(), reportedOnly: true }).map((d) => d.id)
    expect(ids).toEqual([19553])
  })
  it('says closed today in the hover label', () => {
    const l = boothLabel(buildDots(dotInput()).find((d) => d.id === 19553)!)
    expect(l).toMatchObject({ name: 'Keysborough Gardens', lead: 'closed today', leader: null })
  })
})

const panelInput = (place: typeof gardens): PlaceInput => ({
  place, isEvc: false, rows: undefined, at: 200,
  seat: { id: 15919, name: 'Mordialloc', tcp: null, fp: [] },
  mates: [], sameElection: false, ticks: [],
})

// VE-310: Wodonga (19334) closed early in Benambra (15932); Victory (19176) takes the voters. Results still arrive.
const wodonga = { id: 19334, name: 'Wodonga', districtId: 15932, e: 1, n: 1 }
const victory = { id: 19176, name: 'Victory', districtId: 15932, e: 2, n: 2 }
const rows = [{ at: 100, fp: { ALP: 20, LIB: 60, NAT: 0, GRN: 5, ONP: 0, IND: 10, OTH: 5 }, total: 105, tcpA: 'LIB' as const, tcpPctA: 55 }]
const earlyInput = (at: number, r: typeof rows | undefined): PlaceInput => ({
  place: wodonga, isEvc: false, rows: r, at,
  seat: { id: 15932, name: 'Benambra', tcp: { a: 'LIB', b: 'IND', pctA: 52 }, fp: [] },
  mates: [], sameElection: false, ticks: [100],
})

describe('closed early place (VE-310)', () => {
  it('keeps the counted state and carries the note', () => {
    const p = placePanel(earlyInput(200, rows))
    expect(p.state).toBe('counted')
    expect(p.closed).toBeNull()
    expect(p.closedEarly?.redirect.label).toBe('Victory (Victory Lutheran College)')
    expect(p.votes).toBe(105)
  })
  it('carries the note while waiting too', () => {
    const p = placePanel(earlyInput(50, rows))
    expect(p.state).toBe('waiting')
    expect(p.closedEarly?.reason).toBe('poor weather')
  })
  it('words the note', () => {
    expect(closedEarlyWords(CLOSED_PLACES.find((c) => c.name === 'Wodonga')!)).toBe(
      'Closed early this afternoon (poor weather), so the count here is smaller. Voters were sent to Victory (Victory Lutheran College).',
    )
  })
  it('has no ring, and the hover label adds closed early', () => {
    const input = { ...dotInput(), booths: [wodonga, victory], byBooth: new Map([[19334, rows]]), seats: new Map([[15932, { name: 'Benambra', close: false }]]) }
    const d = buildDots(input).find((x) => x.id === 19334)!
    expect(d.closed).toBeUndefined()
    expect(d.closedEarly).toBe(true)
    expect(d.r0).not.toBe(R_CLOSED)
    const l = boothLabel(d)
    expect(l.leader).toBe('LIB')
    expect(l.extra).toContain('closed early')
    expect(l.extra).toContain('Benambra')
  })
  it('finds Victory to open', () => {
    expect(redirectOf({ booths: [wodonga, victory] }, wodonga)).toBe(19176)
  })
})

describe('closed place panel', () => {
  it('an all-day closure has no early note', () => {
    expect(placePanel(panelInput(gardens)).closedEarly).toBeNull()
  })
  it('is closed, not waiting, and carries the closure', () => {
    const p = placePanel(panelInput(gardens))
    expect(p.state).toBe('closed')
    expect(p.closed?.redirect.label).toBe('Chapel (Sirius College)')
  })
  it('an open place is unchanged', () => {
    expect(placePanel(panelInput(chapel)).state).toBe('waiting')
  })
  it('finds Chapel to open, or null when it is not in the data', () => {
    expect(redirectOf({ booths: [gardens, chapel] }, gardens)).toBe(18556)
    expect(redirectOf({ booths: [gardens] }, gardens)).toBeNull()
    expect(redirectOf({ booths: [gardens, chapel] }, chapel)).toBeNull()
  })
})
