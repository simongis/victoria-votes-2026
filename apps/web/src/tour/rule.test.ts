import { describe, expect, it } from 'vitest'
import { TOUR_KEY, markSeen, readMark, shouldAutoShow, writeMark, type ShowContext, type StorageLike } from './rule'

const base: ShowContext = { mark: null, shownThisSession: false, rewinding: false, seatOpen: false, exploreOpen: false, automated: false, optedIn: false }
const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}
const blocked: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
}

describe('shouldAutoShow', () => {
  it('shows on a first visit', () => expect(shouldAutoShow(base)).toBe(true))
  it('not once seen or skipped', () => expect(shouldAutoShow({ ...base, mark: 'seen' })).toBe(false))
  it('not after "never"', () => expect(shouldAutoShow({ ...base, mark: 'never' })).toBe(false))
  it('not twice in one page load, even if storage forgets', () => expect(shouldAutoShow({ ...base, shownThisSession: true })).toBe(false))
  it('not under Rewind', () => expect(shouldAutoShow({ ...base, rewinding: true })).toBe(false))
  it('not with a seat panel open', () => expect(shouldAutoShow({ ...base, seatOpen: true })).toBe(false))
  it('not with an Explore lens open', () => expect(shouldAutoShow({ ...base, exploreOpen: true })).toBe(false))
  it('not in automated browsers unless a test opts in', () => {
    expect(shouldAutoShow({ ...base, automated: true })).toBe(false)
    expect(shouldAutoShow({ ...base, automated: true, optedIn: true })).toBe(true)
  })
})

describe('the stored mark', () => {
  it('round-trips under the app key', () => {
    const s = memory()
    expect(readMark(s)).toBeNull()
    writeMark('seen', s)
    expect(s.data.get(TOUR_KEY)).toBe('seen')
    expect(readMark(s)).toBe('seen')
  })
  it('ignores junk values', () => {
    const s = memory()
    s.data.set(TOUR_KEY, 'yes')
    expect(readMark(s)).toBeNull()
  })
  it('markSeen does not undo "never"', () => {
    const s = memory()
    writeMark('never', s)
    markSeen(s)
    expect(readMark(s)).toBe('never')
  })
  it('survives blocked storage', () => {
    expect(readMark(blocked)).toBeNull()
    expect(() => writeMark('seen', blocked)).not.toThrow()
    expect(() => markSeen(blocked)).not.toThrow()
    expect(readMark(null)).toBeNull()
  })
})
