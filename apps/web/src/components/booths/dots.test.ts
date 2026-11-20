import { describe, expect, it } from 'vitest'
import { boothLabel, buildDots, R_FLOOR, R_MAX, type DotInput } from './dots'
import { dotRadius, type BoothRow } from './model'

const fp = (o: Partial<BoothRow['fp']>): BoothRow['fp'] => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0, ...o })

const input = (over: Partial<DotInput> = {}): DotInput => ({
  booths: [
    { id: 1, name: 'Big Hall', districtId: 10, e: 1, n: 1 },
    { id: 2, name: 'Small School', districtId: 10, e: 2, n: 2 },
    { id: 3, name: 'Not Yet', districtId: 11, e: 3, n: 3 },
  ],
  byBooth: new Map([
    [1, [{ at: 100, fp: fp({ ALP: 600, LIB: 200 }) }]],
    [2, [{ at: 100, fp: fp({ LIB: 90, ALP: 10 }) }]],
    [3, [{ at: 500, fp: fp({ GRN: 50 }) }]],
  ]),
  maxFormal: 800,
  at: 200,
  focus: null,
  seats: new Map([
    [10, { name: 'Alpha', close: false }],
    [11, { name: 'Beta', close: true }],
  ]),
  selected: null,
  ...over,
})

describe('buildDots', () => {
  it('makes one dot per booth, so every plotted booth is accounted for', () => {
    expect(buildDots(input())).toHaveLength(3)
  })

  it('a booth is waiting (faint, small) until its first figures arrive', () => {
    const d = buildDots(input()).find((x) => x.id === 3)!
    expect(d.state).toBe('waiting')
    expect(d.leader).toBeNull()
    expect(d.r0).toBeLessThan(buildDots(input()).find((x) => x.id === 2)!.r0)
  })

  it('colours by leader and sizes by formal votes (area, so more votes means a bigger dot)', () => {
    const dots = buildDots(input())
    const big = dots.find((x) => x.id === 1)!
    const small = dots.find((x) => x.id === 2)!
    expect(big.leader).toBe('ALP')
    expect(small.leader).toBe('LIB')
    expect(big.formal).toBe(800)
    expect(big.r0).toBeGreaterThan(small.r0)
  })

  it('draws waiting booths first and big booths before small, so small dots are never hidden under big ones', () => {
    const order = buildDots(input()).map((d) => d.id)
    expect(order).toEqual([3, 1, 2])
  })

  it('a later time shows the booth that has reported since', () => {
    const d = buildDots(input({ at: 600 })).find((x) => x.id === 3)!
    expect(d.state).toBe('counted')
    expect(d.leader).toBe('GRN')
  })

  it('a tally pick lights the booths that party leads and fades the rest', () => {
    const dots = buildDots(input({ focus: 'ALP' }))
    expect(dots.find((x) => x.id === 1)!.lit).toBe(true)
    expect(dots.find((x) => x.id === 2)!.lit).toBe(false)
    expect(dots.find((x) => x.id === 3)!.lit).toBe(false)
  })

  it('no pick lights every booth', () => {
    expect(buildDots(input()).every((d) => d.lit)).toBe(true)
  })

  it('a picked seat outlines exactly its booths', () => {
    const dots = buildDots(input({ selected: 10 }))
    expect(dots.filter((d) => d.outlined).map((d) => d.id).sort()).toEqual([1, 2])
  })

  it('carries the seat name for the label', () => {
    expect(buildDots(input()).find((x) => x.id === 3)!.seatName).toBe('Beta')
  })
})

describe('boothLabel', () => {
  it('says booth, leader and share, then seat and votes', () => {
    const d = buildDots(input()).find((x) => x.id === 1)!
    expect(boothLabel(d)).toEqual({ name: 'Big Hall', leader: 'ALP', lead: 'Labor 75%', extra: 'Alpha, 800 votes' })
  })

  it('says no figures yet for a waiting booth', () => {
    const d = buildDots(input()).find((x) => x.id === 3)!
    expect(boothLabel(d)).toEqual({ name: 'Not Yet', leader: null, lead: 'No figures yet', extra: 'Beta' })
  })
})

describe('buildDots with early voting centres', () => {
  const evc = [{ key: 'k', name: 'Town Hall', e: 5, n: 5, ids: [90, 91], districtIds: [10, 11] }]
  it('draws a ringed dot per centre only when the source has results for them', () => {
    const none = buildDots(input({ evc }))
    expect(none.some((d) => d.evc)).toBe(false) // the 2022 replay: nothing changes
    const byBooth = new Map(input().byBooth)
    byBooth.set(90, [{ at: 100, fp: fp({ GRN: 30 }) }])
    byBooth.set(91, [{ at: 100, fp: fp({ GRN: 20, ALP: 5 }) }])
    const d = buildDots(input({ evc, byBooth })).find((x) => x.evc)!
    expect(d.leader).toBe('GRN')
    expect(d.formal).toBe(55)
    expect(d.name).toBe('Town Hall')
  })
})

describe('which place a dot opens (VE-208)', () => {
  it('a polling place opens itself; a centre opens its first id (its dot id is only a draw key)', () => {
    const byBooth = new Map(input().byBooth)
    byBooth.set(90, [{ at: 100, fp: fp({ GRN: 30 }) }])
    const dots = buildDots(input({ evc: [{ key: 'k', name: 'Town Hall', e: 5, n: 5, ids: [90, 91], districtIds: [10, 11] }], byBooth }))
    expect(dots.find((x) => x.id === 1)!.pick).toBe(1)
    const c = dots.find((x) => x.evc)!
    expect(c.id).toBeLessThan(0)
    expect(c.pick).toBe(90)
  })
})

describe('buildDots reportedOnly (Rewind, VE-153)', () => {
  it('leaves out the booths that had not reported by that moment, so they appear as the scrubber moves on', () => {
    const early = buildDots(input({ at: 150, reportedOnly: true }))
    expect(early.map((d) => d.id).sort()).toEqual([1, 2])
    expect(early.every((d) => d.state === 'counted')).toBe(true)
    const later = buildDots(input({ at: 600, reportedOnly: true }))
    expect(later.map((d) => d.id).sort()).toEqual([1, 2, 3])
  })

  it('leaves every booth in when not asked, as at the live edge', () => {
    expect(buildDots(input({ at: 150 }))).toHaveLength(3)
  })

  it('shows nothing before the first booth has reported', () => {
    expect(buildDots(input({ at: 1, reportedOnly: true }))).toHaveLength(0)
  })
})

describe('dot size range (VE-153)', () => {
  it('keeps the largest dot within 2.5 times the smallest counted dot by area', () => {
    const r = (v: number) => dotRadius(v, 3000, R_MAX, R_FLOOR)
    const ratio = (r(3000) / r(1)) ** 2
    expect(ratio).toBeLessThanOrEqual(2.5)
    expect(ratio).toBeGreaterThan(1.5)
  })

  it('still grows with votes and never shrinks below the floor', () => {
    expect(dotRadius(1500, 3000, R_MAX, R_FLOOR)).toBeGreaterThan(dotRadius(300, 3000, R_MAX, R_FLOOR))
    expect(dotRadius(0, 3000, R_MAX, R_FLOOR)).toBe(R_FLOOR)
  })
})

describe('buildDots with a picked seat (VE-153)', () => {
  it('fades the booths of every other seat, and nothing when no seat is picked', () => {
    const picked = buildDots(input({ selected: 10 }))
    expect(picked.filter((d) => d.faded).map((d) => d.id)).toEqual([3])
    expect(picked.filter((d) => d.outlined).every((d) => !d.faded)).toBe(true)
    expect(buildDots(input()).some((d) => d.faded)).toBe(false)
  })
})
