import { describe, expect, it } from 'vitest'
import { CLOSED_PLACES, closedFor, closedWords } from './closedPlaces'

describe('closedFor', () => {
  it('finds Keysborough Gardens in Mordialloc, ignoring case and punctuation', () => {
    expect(closedFor(15919, 'Keysborough Gardens')?.reason).toBe('flooding')
    expect(closedFor(15919, ' keysborough  gardens ')).not.toBeNull()
  })
  it('does not match another district or another Keysborough place', () => {
    expect(closedFor(15967, 'Keysborough Gardens')).toBeNull()
    expect(closedFor(15919, 'Keysborough Park')).toBeNull()
    expect(closedFor(15919, 'Chapel')).toBeNull()
  })
  it('reads a supplied list', () => {
    expect(closedFor(1, 'X', [{ districtId: 1, name: 'x', when: 'all-day', reason: 'fire', redirect: { name: 'Y', label: 'Y' } }])?.reason).toBe('fire')
    expect(CLOSED_PLACES.length).toBeGreaterThan(0)
  })
  it('words the panel line', () => {
    expect(closedWords(closedFor(15919, 'Keysborough Gardens')!)).toBe('Closed today (flooding). Votes are counted at Chapel (Sirius College).')
  })
})
