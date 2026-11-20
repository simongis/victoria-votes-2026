import { beforeEach, describe, expect, it } from 'vitest'
import { INSET_KEY, readMinimised, writeMinimised } from './pref'

describe('inset preference', () => {
  beforeEach(() => localStorage.clear())
  it('defaults to shown', () => {
    expect(readMinimised()).toBe(false)
  })
  it('remembers a minimised inset and a restored one', () => {
    writeMinimised(true)
    expect(readMinimised()).toBe(true)
    writeMinimised(false)
    expect(readMinimised()).toBe(false)
  })
  it('survives storage that throws', () => {
    const real = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    expect(readMinimised()).toBe(false)
    Storage.prototype.getItem = real
    expect(INSET_KEY).toMatch(/inset/)
  })
})
