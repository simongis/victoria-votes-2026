import { describe, expect, it } from 'vitest'
import { moreHint } from './moreHint'

describe('moreHint (VE-227, finding 15: a phone has nothing to click)', () => {
  it('says "Tap for more." on a touch screen', () => {
    expect(moreHint(true)).toBe('Tap for more.')
  })
  it('keeps "Click or tap for more." where a mouse is possible', () => {
    expect(moreHint(false)).toBe('Click or tap for more.')
  })
})
