// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ReadingKey } from './TopBand'
import { ColourInfo } from './StageControls'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement | null = null
afterEach(() => {
  host?.remove()
  host = null
})

function open(pollNote?: string | null, final = false, colourInfo?: ReactNode) {
  host = document.createElement('div')
  document.body.append(host)
  act(() => createRoot(host!).render(<ReadingKey sourceNote={null} pollNote={pollNote} final={final} colourInfo={colourInfo} />))
  act(() => host!.querySelector<HTMLButtonElement>('.info__btn')!.click())
  return host
}

describe('ReadingKey poll note (VE-75)', () => {
  it('shows the note when set', () => {
    expect(open('Retrying shortly').querySelector('[data-testid=poll-note]')?.textContent).toBe('Retrying shortly')
  })
  it('shows nothing when empty or null', () => {
    expect(open(null).querySelector('[data-testid=poll-note]')).toBeNull()
  })
  it('explains each mark once: the tick, the outline, the top bar, Night and no result (VE-75b)', () => {
    const text = open().textContent ?? ''
    expect(text).not.toContain('A ring round a seat')
    expect(text).toContain('Declared by the VEC')
    expect(text).toContain('A dark outline marks seats you picked')
    expect(text).toContain('The top bar is the key')
    expect(text).toContain('Night')
    expect(text).toContain('No figures yet')
    // VE-170: the key itself no longer repeats the colour rule; the colour's own line says it once.
    expect(text).not.toContain('Seats take')
    expect(text).not.toContain('Seats updated')
  })
  it('says the colour rule once, with no Final bracket in the night sentence (VE-127, VE-170)', () => {
    const text = open(null, false, <ColourInfo colour="leader" placesOn={false} />).textContent ?? ''
    expect(text.match(/solid once certain or won/g)).toHaveLength(1)
    expect(text).not.toContain('Seats take')
    expect(text).not.toContain('plain colours')
  })
  it('drops the tick line at Final, when no tick is drawn (VE-166)', () => {
    expect(open(null, true).textContent).not.toContain('Declared by the VEC')
  })
  it('at Final reads finished: no leading-colour line, no "No figures yet", no Close sentence (VE-167)', () => {
    const el = open(null, true)
    el.querySelector('summary')?.click()
    const text = el.textContent ?? ''
    expect(text).not.toContain('Seats take')
    expect(text).not.toContain('No figures yet')
    expect(text).not.toMatch(/Close means|early in the night|leading party/)
  })
  it('says "Close" in the band note, not "In doubt" (VE-166)', () => {
    const el = open()
    el.querySelector('summary')?.click()
    const text = el.textContent ?? ''
    expect(text).toContain('Close: not declared')
    expect(text).toContain('the leader has under')
    expect(text).not.toMatch(/in doubt/i)
  })
})
