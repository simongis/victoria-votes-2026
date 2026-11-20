import { describe, expect, it } from 'vitest'
import { MOTION_KEY, readChoice, resolveMotion, showDeviceNote, writeChoice, type StoreLike } from './motion'

const store = (init: Record<string, string> = {}): StoreLike & { data: Record<string, string> } => {
  const data = { ...init }
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v
    },
  }
}
const throwing: StoreLike = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('resolveMotion (URL beats storage, storage beats default)', () => {
  it('defaults to full motion, whatever the device reports (ADR 0027)', () => {
    expect(resolveMotion('', null)).toBe('full')
  })
  it('a stored off gives reduced, a stored on gives full', () => {
    expect(resolveMotion('', 'off')).toBe('reduced')
    expect(resolveMotion('', 'on')).toBe('full')
  })
  it('?motion=1 and ?motion=0 beat storage', () => {
    expect(resolveMotion('?motion=1', 'off')).toBe('full')
    expect(resolveMotion('?motion=0', 'on')).toBe('reduced')
    expect(resolveMotion('?cadence=600&motion=0', null)).toBe('reduced')
  })
  it('ignores other motion values', () => {
    expect(resolveMotion('?motion=maybe', 'off')).toBe('reduced')
  })
})

describe('stored choice', () => {
  it('reads absent as null and ignores junk', () => {
    expect(readChoice(store())).toBeNull()
    expect(readChoice(store({ [MOTION_KEY]: 'sideways' }))).toBeNull()
  })
  it('round-trips under vic26.motion', () => {
    const s = store()
    writeChoice('off', s)
    expect(s.data['vic26.motion']).toBe('off')
    expect(readChoice(s)).toBe('off')
    writeChoice('on', s)
    expect(readChoice(s)).toBe('on')
  })
  it('survives storage that throws or is missing', () => {
    expect(readChoice(throwing)).toBeNull()
    expect(() => writeChoice('off', throwing)).not.toThrow()
    expect(readChoice(null)).toBeNull()
    expect(() => writeChoice('off', null)).not.toThrow()
  })
})

describe('showDeviceNote', () => {
  it('shows only when the device asks for less motion and nothing is chosen', () => {
    expect(showDeviceNote(true, null)).toBe(true)
    expect(showDeviceNote(true, 'on')).toBe(false)
    expect(showDeviceNote(true, 'off')).toBe(false)
    expect(showDeviceNote(false, null)).toBe(false)
  })
})
