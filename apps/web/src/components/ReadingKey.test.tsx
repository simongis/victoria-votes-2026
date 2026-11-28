// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { AboutSheet, ReadingKey } from './TopBand'
import { ColourInfo } from './StageControls'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement | null = null
afterEach(() => {
  host?.remove()
  host = null
})

/** The map's "i" (the phone's float). The first argument is unused since VE-307 moved the poll note to About. */
function open(_unused?: string | null, final = false, colourInfo?: ReactNode) {
  return mount(<ReadingKey sourceNote={null} final={final} colourInfo={colourInfo} />)
}

function mount(node: ReactNode) {
  host = document.createElement('div')
  document.body.append(host)
  act(() => createRoot(host!).render(node))
  act(() => host!.querySelector<HTMLButtonElement>('.info__btn')!.click())
  return host
}

describe('About (VE-75, VE-307)', () => {
  it('shows the poll note when set', () => {
    expect(mount(<AboutSheet pollNote="Retrying shortly" />).querySelector('[data-testid=poll-note]')?.textContent).toBe('Retrying shortly')
  })
  it('shows no poll note when empty or null', () => {
    expect(mount(<AboutSheet pollNote={null} />).querySelector('[data-testid=poll-note]')).toBeNull()
  })
  it('says what the app is, the VEC notice verbatim, the forecast credit, the tour and the two links; nothing else', () => {
    const el = mount(<AboutSheet />)
    expect(el.querySelector('[data-testid=provisional]')?.textContent).toBe('Provisional. Data sourced from the Victorian Electoral Commission.')
    expect(el.querySelector('[data-testid=about-forecast]')?.textContent).toBe('Seat forecasts and place similarity: SpatialSearch')
    const credit = el.querySelector<HTMLAnchorElement>('[data-testid=about-forecast-link]')
    expect(credit?.getAttribute('href')).toBe('https://spatialsearch.io/elections/')
    expect(credit?.target).toBe('_blank')
    expect(credit?.rel).toContain('noopener')
    expect(el.querySelector('[data-testid=tour-open]')).not.toBeNull()
    expect(el.querySelectorAll('[data-testid=made-by] a')).toHaveLength(2)
    expect(el.querySelector('[aria-label="Simon Jackson on Bluesky"]')).not.toBeNull()
    expect(el.querySelector('[aria-label="Simon Jackson on X"]')).not.toBeNull()
    const text = el.textContent ?? ''
    expect(text).not.toContain('Made by')
    expect(text).not.toContain('Animations')
    expect(el.querySelector('[role=switch]')).toBeNull()
    for (const id of ['colour-info', 'legend-art-race', 'info-majority', 'info-settle']) expect(el.querySelector(`[data-testid=${id}]`)).toBeNull()
  })
  it('says declared once every seat is', () => {
    expect(mount(<AboutSheet final />).querySelector('[data-testid=provisional]')?.textContent).toBe('Declared results. Data sourced from the Victorian Electoral Commission.')
  })
  it('stays live while a lens is open (data-keep-live)', () => {
    expect(mount(<AboutSheet />).querySelector('[data-keep-live]')).not.toBeNull()
  })
})

describe('the map "i" on a phone (VE-307)', () => {
  it('carries no notice, no tour and no maker links', () => {
    const el = open()
    for (const id of ['provisional', 'tour-open', 'made-by', 'motion-switch']) expect(el.querySelector(`[data-testid=${id}]`)).toBeNull()
  })
})

describe('ReadingKey', () => {
  it('explains each mark once: the tick, the outline, the top bar, Night and no result (VE-75b)', () => {
    const text = open().textContent ?? ''
    expect(text).not.toContain('A ring round a seat')
    expect(text).toContain('Declared by the VEC')
    expect(text).toContain('An outline marks the seats picked in the tally')
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
  it('starts the colour text with a heading naming the view, matching the chip (VE-302)', () => {
    const head = (c: 'leader' | 'trust' | 'gains' | 'lvc', placesOn = false, final = false) =>
      open(null, false, <ColourInfo colour={c} placesOn={placesOn} final={final} />).querySelector('[data-testid=colour-info-heading]')?.textContent
    expect(head('leader')).toBe('About this map: Leader')
    expect(head('trust')).toBe('About this map: Swing')
    expect(head('lvc')).toBe('About this map: Labor v Coalition')
    expect(head('gains')).toBe('About this map: Changing hands')
    expect(head('gains', false, true)).toBe('About this map: Changed hands')
    expect(head('leader', true)).toBe('About this map: Polling places')
  })
  it('shows a changed-hands diagram only in that view (VE-302)', () => {
    expect(open(null, false, <ColourInfo colour="gains" placesOn={false} />).querySelector('svg.gains-diagram')).not.toBeNull()
    expect(open(null, false, <ColourInfo colour="leader" placesOn={false} />).querySelector('svg.gains-diagram')).toBeNull()
  })
  it('opens each view with its own illustrated legend (VE-303)', () => {
    const art = (c: 'leader' | 'trust' | 'gains' | 'lvc', placesOn = false, final = false) =>
      [...open(null, false, <ColourInfo colour={c} placesOn={placesOn} final={final} />).querySelectorAll('[data-testid=colour-info] svg.legend-art')].map((s) => s.getAttribute('data-testid'))
    expect(art('leader')).toEqual(['legend-art-leader'])
    expect(art('trust')).toEqual(['legend-art-swing'])
    expect(art('lvc')).toEqual(['legend-art-lvc'])
    expect(art('gains')).toEqual(['legend-art-gains'])
    expect(art('trust', true)).toEqual(['legend-art-places'])
    expect(art('leader', false, true)).toEqual([])
  })
  it('draws the race to 45 in the shared part of the "i" (VE-303)', () => {
    expect(open().querySelector('[data-testid=legend-art-race]')).not.toBeNull()
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
