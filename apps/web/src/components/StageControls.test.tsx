// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setPhoneBit } from '../state/phoneBits'
import { ViewSheet } from './StageControls'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement | null = null
let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  host = root = null
  setPhoneBit('moreWays', null)
  setPhoneBit('rewind', null)
})

function render(onShape: (s: 'map' | 'hex') => void = () => {}) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(<ViewSheet shape="map" onShape={onShape} />))
  act(() => host!.querySelector<HTMLButtonElement>('.view-sheet__btn')!.click())
  return host
}

describe('ViewSheet contents (VE-144a)', () => {
  it('holds the shape choice and the colour slot, and no extra actions until they are published', () => {
    const el = render()
    expect(el.querySelector('[role=dialog][aria-label=View]')).not.toBeNull()
    expect(el.querySelectorAll('[role=radio]').length).toBeGreaterThanOrEqual(2)
    expect(el.querySelector('.view-sheet__colour')).not.toBeNull()
    expect(el.querySelector('[data-testid=view-more-ways]')).toBeNull()
    expect(el.querySelector('[data-testid=view-rewind]')).toBeNull()
  })

  it('offers More ways with its count and Rewind once their owners publish them', () => {
    const open = vi.fn()
    const toggle = vi.fn()
    setPhoneBit('moreWays', { count: 3, open })
    setPhoneBit('rewind', { toggle })
    const el = render()
    const more = el.querySelector<HTMLButtonElement>('[data-testid=view-more-ways]')!
    expect(more.textContent).toContain('(3)')
    expect(el.querySelector('[data-testid=view-rewind]')?.textContent).toContain('Rewind the night')
    act(() => more.click())
    expect(open).toHaveBeenCalledTimes(1)
    // Using an action closes the sheet.
    expect(el.querySelector('[role=dialog]')).toBeNull()
  })

  it('runs Rewind and closes', () => {
    const toggle = vi.fn()
    setPhoneBit('rewind', { toggle })
    const el = render()
    act(() => el.querySelector<HTMLButtonElement>('[data-testid=view-rewind]')!.click())
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(el.querySelector('[role=dialog]')).toBeNull()
  })

  it('picking a shape reports it and closes', () => {
    const onShape = vi.fn()
    const el = render(onShape)
    const hex = [...el.querySelectorAll<HTMLButtonElement>('[role=radio]')].find((b) => /hex/i.test(b.textContent ?? ''))!
    act(() => hex.click())
    expect(onShape).toHaveBeenCalledWith('hex')
    expect(el.querySelector('[role=dialog]')).toBeNull()
  })
})
