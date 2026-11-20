import { describe, expect, it } from 'vitest'
import { keyOthers } from './tallyKey'

describe('keyOthers (VE-131)', () => {
  it('keeps One Nation out of Others and always gives it a chip, even on no seats', () => {
    expect(keyOthers(() => 0)).toEqual({ onp: true, others: [] })
  })
  it('lists only the independents and small parties that lead a seat', () => {
    expect(keyOthers((q) => (q === 'IND' ? 2 : q === 'ONP' ? 1 : 0))).toEqual({ onp: true, others: ['IND'] })
    expect(keyOthers((q) => (q === 'IND' || q === 'OTH' ? 1 : 0)).others).toEqual(['IND', 'OTH'])
  })
})
