import { describe, expect, it } from 'vitest'
import { readStatusOutcome } from './useResults'

describe('readStatusOutcome (VE-233)', () => {
  it('treats no row before any row was seen as the quiet before-results state, not an error', () => {
    expect(readStatusOutcome(null, false)).toBe('no-row-yet')
  })

  it('treats no row after a row was seen as a failed read, so hold last good applies (hard rule 5)', () => {
    expect(readStatusOutcome(null, true)).toBe('failed')
  })

  it('treats a readable row as a row', () => {
    expect(readStatusOutcome({ state: 'live', data_mode: 'live', snapshot_id: null }, false)).toBe('row')
  })

  it('treats a malformed row as a failed read', () => {
    expect(readStatusOutcome({ state: 'on' }, false)).toBe('failed')
  })
})
