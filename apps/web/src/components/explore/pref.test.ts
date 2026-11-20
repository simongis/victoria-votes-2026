import { beforeEach, describe, expect, it } from 'vitest'
import { PEEK_KEY, readPeek, writePeek } from './pref'

describe('explore peek preference', () => {
  beforeEach(() => localStorage.clear())
  it('shows the card open by default', () => {
    expect(readPeek()).toBe('open')
  })
  it('remembers minimised and dismissed, and open again', () => {
    writePeek('min')
    expect(readPeek()).toBe('min')
    writePeek('gone')
    expect(readPeek()).toBe('gone')
    writePeek('open')
    expect(readPeek()).toBe('open')
  })
  it('ignores a value it does not know', () => {
    localStorage.setItem(PEEK_KEY, 'weird')
    expect(readPeek()).toBe('open')
  })
  it('survives storage that throws', () => {
    const real = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    expect(readPeek()).toBe('open')
    Storage.prototype.getItem = real
  })
})
