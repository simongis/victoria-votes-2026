import { describe, expect, it } from 'vitest'
import { isFramed, showFrameNotice } from './framed'

describe('isFramed', () => {
  it('is false when the window is its own top', () => {
    const w = {} as Window
    expect(isFramed({ top: w, self: w })).toBe(false)
  })
  it('is true inside a frame', () => {
    expect(isFramed({ top: {} as Window, self: {} as Window })).toBe(true)
  })
  it('is true when reading top throws (a cross-origin parent can make that happen)', () => {
    const w = {
      get top(): Window {
        throw new Error('blocked')
      },
      self: {} as Window,
    }
    expect(isFramed(w)).toBe(true)
  })
})

describe('showFrameNotice', () => {
  it('replaces the page with a short notice linking to the site in the top window', () => {
    const root = document.createElement('div')
    root.id = 'root'
    showFrameNotice(root, 'https://simongis.github.io/vic26election/')
    const a = root.querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://simongis.github.io/vic26election/')
    expect(a?.getAttribute('target')).toBe('_top')
    expect(root.textContent).toContain('Open')
  })
})
