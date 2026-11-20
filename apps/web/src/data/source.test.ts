import { describe, expect, it } from 'vitest'
import { chooseSourceKind } from './source'

describe('chooseSourceKind', () => {
  it('defaults to the replay in dev', () => {
    expect(chooseSourceKind({ search: '', env: undefined, dev: true })).toBe('replay')
  })
  it('defaults to AGOL in a production build', () => {
    expect(chooseSourceKind({ search: '', env: undefined, dev: false })).toBe('agol')
  })
  it('lets the env var override the default', () => {
    expect(chooseSourceKind({ search: '', env: 'agol', dev: true })).toBe('agol')
    expect(chooseSourceKind({ search: '', env: 'replay', dev: false })).toBe('replay')
  })
  it('lets ?source= override the env var', () => {
    expect(chooseSourceKind({ search: '?source=agol', env: 'replay', dev: true })).toBe('agol')
    expect(chooseSourceKind({ search: '?x=1&source=replay', env: 'agol', dev: false })).toBe('replay')
  })
  it('ignores unknown values', () => {
    expect(chooseSourceKind({ search: '?source=scrape', env: 'nope', dev: true })).toBe('replay')
  })
})
