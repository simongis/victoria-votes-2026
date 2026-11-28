import { describe, expect, it } from 'vitest'
import { rollChipText } from './rollChip'

// VE-291: the tally chips showed "+0" / "-0" (Labor 54 +0) when a count changed again while it was still rolling: the
// change was taken from the half-rolled number on screen (53.7 to 54 is +0.3, written "+0").
describe('rollChipText', () => {
  it('says the whole change from the last count, not from the half-rolled number', () => {
    expect(rollChipText(53, 54, 0)).toBe('+1')
    expect(rollChipText(15, 14, 0)).toBe('-1')
  })
  it('says nothing when the count did not change', () => {
    expect(rollChipText(54, 54, 0)).toBeNull()
    expect(rollChipText(null, 54, 0)).toBeNull()
  })
  it('never writes +0 or -0 for a change that rounds to nothing', () => {
    expect(rollChipText(53.7, 54, 0)).toBeNull()
    expect(rollChipText(15.2, 15, 0)).toBeNull()
    expect(rollChipText(10.04, 10, 1)).toBeNull()
    expect(rollChipText(10, 10.25, 1)).toBe('+0.3')
  })
})
