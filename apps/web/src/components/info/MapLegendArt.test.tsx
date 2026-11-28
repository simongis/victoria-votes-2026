// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import type { Tally } from '../../derive/seats'
import { LeaderArt, PlacesArt } from './MapLegendArt'
import { ArrowsDiagram } from '../explore/arrows/ArrowsExplain'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement | null = null
afterEach(() => {
  host?.remove()
  host = null
})
function render(node: ReactNode) {
  host = document.createElement('div')
  document.body.append(host)
  act(() => createRoot(host!).render(node))
  return host
}
const texts = (el: Element) => [...el.querySelectorAll('text')].map((t) => t.textContent ?? '')

/** A tally where only the given parties hold or lead seats. */
function tallyOf(seats: Partial<Record<PartyBucket, number>>): Tally {
  const zero = { ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0 } as Record<PartyBucket, number>
  return { firm: { ...zero, ...seats }, leading: { ...zero } } as unknown as Tally
}

describe('Leader map key: the full key (VE-308, round 2 pick L2)', () => {
  it('draws Labor, Liberal, Nationals and Greens always, then any other leading party, at all three strengths (VE-312)', () => {
    const el = render(<LeaderArt tally={tallyOf({ ALP: 40, LIB: 20, ONP: 3 })} />)
    const rows = [...el.querySelectorAll('[data-row]')].map((g) => g.getAttribute('data-row'))
    expect(rows).toEqual(['ALP', 'LIB', 'NAT', 'GRN', 'ONP'])
    for (const g of el.querySelectorAll('[data-row]')) expect(g.querySelectorAll('rect')).toHaveLength(3)
    const t = texts(el)
    for (const w of ['Early', 'Likely', 'Won', 'Labor', 'Liberal', 'One Nation', 'Declared', 'No figures yet']) expect(t).toContain(w)
  })
  it('still draws the main four rows before any figures (VE-312)', () => {
    const el = render(<LeaderArt tally={tallyOf({})} />)
    expect(el.querySelectorAll('[data-row]')).toHaveLength(4)
  })
})

describe('Polling places map key: three rules (VE-308, pick P1)', () => {
  it('says size, colour and status in a few words', () => {
    const t = texts(render(<PlacesArt />))
    expect(t).toEqual(['More votes', 'Topped the first count', 'None yet', 'Just counted'])
  })
  it('drops "None yet" once every place is in', () => {
    expect(texts(render(<PlacesArt final />))).not.toContain('None yet')
  })
})

describe('Swing arrows key: two rows, arrows and the other contests (VE-308, pick S1)', () => {
  it('separates the Labor v Coalition arrows from the triangles, and says what a triangle is', () => {
    const el = render(<ArrowsDiagram />)
    const t = texts(el).join(' | ')
    expect(t).toContain('Labor v Coalition seats: swing after preferences')
    expect(t).toContain('Other contests')
    expect(t).toMatch(/One Nation up 12 pts/)
    expect(t).toMatch(/Labor down 6 pts/)
    expect(t).toMatch(/changed most/)
    // Short and long arrows each way.
    expect(el.querySelectorAll('.arrows-diagram__arrow')).toHaveLength(4)
    expect(el.querySelectorAll('[data-row="arrows"]')).toHaveLength(1)
    expect(el.querySelectorAll('[data-row="others"]')).toHaveLength(1)
  })
})
