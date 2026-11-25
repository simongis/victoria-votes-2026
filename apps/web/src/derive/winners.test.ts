import { describe, expect, it } from 'vitest'
import type { DistrictHistoryRow } from '@vic26/schema'
import { withDistrictWinners } from './winners'

const r = (id: number, over: Partial<DistrictHistoryRow> = {}) => ({ district_id: id, status: 'declared', elected_party: null, ...over }) as DistrictHistoryRow

describe('withDistrictWinners (ADR 0036)', () => {
  it('the districts layer beats the history row for a declared seat', () => {
    const out = withDistrictWinners([r(1, { elected_party: 'LIB' })], [{ district_id: 1, elected_party: 'ALP' }])
    expect(out[0]!.elected_party).toBe('ALP')
  })

  it('keeps the history value where the districts layer has none', () => {
    const out = withDistrictWinners([r(1, { elected_party: 'LIB' })], [{ district_id: 1, elected_party: null }])
    expect(out[0]!.elected_party).toBe('LIB')
  })

  it('fills a row from a view that lacks the history field', () => {
    const out = withDistrictWinners([r(1, { elected_party: undefined as never })], [{ district_id: 1, elected_party: 'NAT' }])
    expect(out[0]!.elected_party).toBe('NAT')
  })

  it('leaves undeclared seats and unknown districts alone, and does not mutate', () => {
    const open = r(2, { status: 'counting' as never })
    const rows = [open, r(3)]
    const out = withDistrictWinners(rows, [{ district_id: 2, elected_party: 'GRN' }])
    expect(out[0]).toBe(open)
    expect(out[1]).toBe(rows[1])
    expect(open.elected_party).toBeNull()
  })
})
