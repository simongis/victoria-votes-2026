import { describe, expect, it, vi } from 'vitest'
import { PARTY_COLOURS } from '../parties'
import { applyTheme, DEFAULT_THEME, getTheme, initTheme, parseColour, readPalette, resolveTheme, setTheme, THEME_KEY } from './theme'

describe('parseColour', () => {
  it('reads hex and rgb() values', () => {
    expect(parseColour('#e0343b')).toEqual([224, 52, 59])
    expect(parseColour(' #fff ')).toEqual([255, 255, 255])
    expect(parseColour('rgb(1, 2, 3)')).toEqual([1, 2, 3])
  })
  it('returns null for anything else', () => {
    expect(parseColour('')).toBeNull()
    expect(parseColour('tomato')).toBeNull()
  })
})

describe('readPalette', () => {
  it('reads party and surface colours from the theme tokens', () => {
    const tokens: Record<string, string> = { '--party-alp': '#010203', '--map-paper': 'rgb(9, 9, 9)' }
    const p = readPalette((name) => tokens[name] ?? '')
    expect(p.party.ALP).toEqual([1, 2, 3])
    expect(p.paper).toEqual([9, 9, 9])
  })
  it('falls back to the civic defaults when a token is missing, so the map never draws black', () => {
    const p = readPalette(() => '')
    expect(p.party.LIB).toEqual(parseColour(PARTY_COLOURS.LIB))
    expect(p.noResult).toEqual([255, 255, 255])
  })
})

describe('applyTheme', () => {
  it('sets data-theme on the root, civic by default', () => {
    const root = document.createElement('html')
    applyTheme(undefined, root)
    expect(root.dataset.theme).toBe('civic')
    expect(DEFAULT_THEME).toBe('civic')
  })
})

describe('resolveTheme', () => {
  it('is civic by default', () => {
    expect(resolveTheme('', null)).toBe('civic')
    expect(resolveTheme('?x=1', 'junk')).toBe('civic')
  })
  it('opens civic for a retired ?theme=console link or a stored console value (VE-116)', () => {
    expect(resolveTheme('?theme=console', null)).toBe('civic')
    expect(resolveTheme('?theme=console', 'console')).toBe('civic')
    expect(resolveTheme('', 'console')).toBe('civic')
    expect(resolveTheme('?theme=nonsense', 'console')).toBe('civic')
  })
  it('still accepts ?theme=default and ?theme=civic', () => {
    expect(resolveTheme('?theme=default', null)).toBe('civic')
    expect(resolveTheme('?theme=civic', 'junk')).toBe('civic')
  })
})

describe('initTheme', () => {
  it('applies civic and overwrites a remembered console value, with no error', async () => {
    localStorage.setItem(THEME_KEY, 'console')
    await initTheme('')
    expect(document.documentElement.dataset.theme).toBe('civic')
    expect(getTheme()).toBe('civic')
    expect(localStorage.getItem(THEME_KEY)).toBe('civic')
  })
  it('applies civic for ?theme=console', async () => {
    await initTheme('?theme=console')
    expect(document.documentElement.dataset.theme).toBe('civic')
  })
})

describe('setTheme', () => {
  const none = async () => undefined
  it('applies, remembers and reports the theme', async () => {
    const root = document.createElement('html')
    await setTheme('civic', { root, load: none })
    expect(root.dataset.theme).toBe('civic')
    expect(getTheme()).toBe('civic')
    expect(localStorage.getItem(THEME_KEY)).toBe('civic')
  })
  it('loads the theme assets before it applies the theme (the palette is read from them)', async () => {
    const root = document.createElement('html')
    const seen: string[] = []
    await setTheme('civic', {
      root,
      load: async () => {
        seen.push(root.dataset.theme ?? 'none')
      },
    })
    expect(seen).toEqual(['none'])
    expect(root.dataset.theme).toBe('civic')
  })
  it('keeps the current theme when the assets fail to load', async () => {
    const root = document.createElement('html')
    await setTheme('civic', {
      root,
      load: async () => {
        throw new Error('offline')
      },
    })
    expect(root.dataset.theme).toBeUndefined()
  })
  it('still works when storage throws', async () => {
    const root = document.createElement('html')
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await setTheme('civic', { root, load: none })
    expect(root.dataset.theme).toBe('civic')
    spy.mockRestore()
  })
})
