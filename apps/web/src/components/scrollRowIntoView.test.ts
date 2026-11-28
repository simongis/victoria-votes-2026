import { describe, expect, it } from 'vitest'
import { nearestScrollTop } from './scrollRowIntoView'

describe('nearestScrollTop', () => {
  it('leaves a visible row alone', () => expect(nearestScrollTop(100, 300, 150, 190)).toBe(100))
  it('scrolls up to a row above, clearing a sticky header', () => expect(nearestScrollTop(100, 300, 60, 100, 30)).toBe(30))
  it('scrolls down to a row below', () => expect(nearestScrollTop(0, 300, 400, 440)).toBe(140))
  it('never goes negative', () => expect(nearestScrollTop(10, 300, 5, 40, 30)).toBe(0))
})
