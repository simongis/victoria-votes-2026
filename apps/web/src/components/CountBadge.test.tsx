// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { CountBadge } from './CountBadge'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('CountBadge (VE-308)', () => {
  it('keeps "Label (n)" as the text while drawing the number as a badge', () => {
    const host = document.createElement('button')
    document.body.append(host)
    act(() => createRoot(host).render(<>Changed hands<CountBadge n={31} /></>))
    expect(host.textContent).toBe('Changed hands (31)')
    expect(host.querySelector('.chip__n')?.textContent).toBe('(31)')
    expect([...host.querySelectorAll('.chip__n .chip__br')].map((e) => e.textContent)).toEqual(['(', ')'])
    host.remove()
  })
})
