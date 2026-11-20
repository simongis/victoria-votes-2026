import { describe, expect, it } from 'vitest'
import type { DistrictStatic } from '@vic26/schema'
import type { Seat } from './seats'
import { GRACE_MS, SHOW_DELAY_MS, hexLabel, labelDelay } from './hexLabel'

const seat = (over: Partial<Seat> = {}): Seat =>
  ({ id: 1, name: 'Richmond', leader: 'ALP', state: 'leading', tcp: { a: 'ALP', b: 'LIB', pctA: 54.24 }, pct: 62.4, ...over }) as Seat
const st = { base_tcp_party_a: 'ALP', base_tcp_party_b: 'LIB', base_tcp_pct_a: 52.1 } as DistrictStatic

describe('hexLabel', () => {
  it('Leader: name, who is leading, and the two-candidate share', () => {
    expect(hexLabel(seat(), 'leader', st)).toEqual({ name: 'Richmond', leader: 'ALP', lead: 'Labor leading', extra: 'Labor 54.2%, 62% counted' })
  })
  it('says won for a declared seat', () => {
    expect(hexLabel(seat({ state: 'won', tcp: { a: 'LIB', b: 'ALP', pctA: 51 }, leader: 'LIB' }), 'leader', undefined).lead).toBe('Liberal won')
  })
  it('says no figures yet when nothing is in', () => {
    expect(hexLabel(seat({ leader: null, state: 'none', tcp: null, pct: null }), 'leader', st)).toEqual({ name: 'Richmond', leader: null, lead: 'No figures yet', extra: null })
  })
  it('has only the counted figure when the two-candidate count is not in', () => {
    expect(hexLabel(seat({ tcp: null }), 'leader', st).extra).toBe('62% counted')
  })
  it('Trust: adds the swing in words once enough is counted', () => {
    expect(hexLabel(seat(), 'trust', st).extra).toBe('Labor 54.2%, swing 2.1 to Labor, 62% counted')
  })
  it('Trust: no swing while too little is counted', () => {
    expect(hexLabel(seat({ pct: 20 }), 'trust', st).extra).toBe('Labor 54.2%, 20% counted')
  })
it('a declared seat has no counted figure on the hex, so the label leaves it out too (FB-182)', () => {    expect(hexLabel(seat({ state: 'won' }), 'leader', st).extra).toBe('Labor 54.2%')  })
  it('How sure: the counted share', () => {
    expect(hexLabel(seat(), 'certainty', st).extra).toBe('62% counted')
    expect(hexLabel(seat({ pct: null }), 'certainty', st).extra).toBe('Nothing counted yet')
  })
})

describe('labelDelay (VE-120)', () => {
  it('waits a short beat on a fresh pointer hover', () => {
    expect(labelDelay({ keyboard: false, now: 10_000, lastShownAt: 0 })).toBe(SHOW_DELAY_MS)
  })
  it('shows at once on keyboard focus', () => {
    expect(labelDelay({ keyboard: true, now: 10_000, lastShownAt: 0 })).toBe(0)
  })
  it('shows at once when the last label went away a moment ago (moving between neighbours)', () => {
    expect(labelDelay({ keyboard: false, now: 10_000, lastShownAt: 10_000 - GRACE_MS + 1 })).toBe(0)
  })
  it('waits again once the grace has passed', () => {
    expect(labelDelay({ keyboard: false, now: 10_000, lastShownAt: 10_000 - GRACE_MS - 1 })).toBe(SHOW_DELAY_MS)
  })
  it('keeps the delay in the usual 150 to 300 ms band', () => {
    expect(SHOW_DELAY_MS).toBeGreaterThanOrEqual(150)
    expect(SHOW_DELAY_MS).toBeLessThanOrEqual(300)
  })
})
