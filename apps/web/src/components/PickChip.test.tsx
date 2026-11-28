// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Seat } from '../derive/seats'
import { pickChipInfo } from '../derive/pickChip'
import type { Palette } from '../theme/theme'
import { PickChip } from './PickChip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const seat = (id: number, leader: Seat['leader'], state: Seat['state'], close = false) => ({ id, leader, state, close }) as Seat
const seats = new Map<number, Seat>([
  [1, seat(1, 'LIB', 'won')],
  [2, seat(2, 'LIB', 'firm')],
  [3, seat(3, 'LIB', 'leading')],
  [4, seat(4, 'NAT', 'won')],
  [5, seat(5, 'ONP', 'leading', true)],
  [6, seat(6, 'ALP', 'leading')],
  [7, seat(7, 'ALP', 'leading')],
])
const pal = { party: { LIB: [31, 95, 191], NAT: [10, 74, 74], ALP: [224, 52, 59], ONP: [242, 142, 28], GRN: [101, 201, 87], IND: [10, 138, 150], OTH: [160, 160, 160] }, paper: [255, 255, 255] } as unknown as Palette

let host: HTMLDivElement | null = null
afterEach(() => {
  host?.remove()
  host = null
})

describe('pickChipInfo (VE-286)', () => {
  it('says the party, the seat count and how sure the seats are, leaving out empty parts', () => {
    expect(pickChipInfo('LIB', seats).text).toBe('Liberal · 3 seats · 1 declared · 1 certain · 1 leading')
    expect(pickChipInfo('COA', seats).text).toBe('Coalition · 4 seats · 2 declared · 1 certain · 1 leading')
    expect(pickChipInfo('ALP', seats).text).toBe('Labor · 2 seats · all leading · none declared yet')
    expect(pickChipInfo('ONP', seats).text).toBe('One Nation · 1 seat · all leading · none declared yet · 1 close')
  })
  it('names a part without a breakdown', () => {
    expect(pickChipInfo('LIB:strong', seats).text).toBe('Liberal won or firm · 2 seats')
    expect(pickChipInfo('LIB:pale', seats).text).toBe('Liberal leading · 1 seat')
  })
  it('names the close seats plainly, with no party colour', () => {
    const i = pickChipInfo('DOUBT', seats)
    expect(i.text).toBe('1 close seat')
    expect(i.bucket).toBeNull()
  })
  it('gives a party colour and a darker edge for the outline', () => {
    const i = pickChipInfo('LIB', seats)
    expect(i.colour).toBe('rgb(31, 95, 191)')
    expect(i.edge).not.toBe(i.colour)
  })
})

describe('PickChip', () => {
  function show(focus: Parameters<typeof PickChip>[0]['focus'], preview: boolean, onClear = () => {}) {
    host = document.createElement('div')
    document.body.append(host)
    act(() => createRoot(host!).render(<PickChip focus={focus} seats={seats} pal={pal} preview={preview} onClear={onClear} />))
    return host
  }
  it('renders nothing without a pick', () => {
    expect(show(null, false).querySelector('[data-testid=pick-chip]')).toBeNull()
  })
  it('a committed pick has a clear button that clears it, and the name wears the party colour', () => {
    const onClear = vi.fn()
    const h = show('LIB:strong', false, onClear)
    expect(h.querySelector('[data-testid=pick-chip]')?.textContent).toContain('Liberal won or firm · 2 seats')
    expect(h.querySelector<HTMLElement>('.pickchip__text b')!.style.color).not.toBe('')
    const btn = h.querySelector<HTMLButtonElement>('[data-testid=pick-chip-clear]')!
    expect(btn.getAttribute('aria-label')).toBe('Clear the Liberal, certain highlight')
    act(() => btn.click())
    expect(onClear).toHaveBeenCalled()
  })
  it('a hover preview shows the chip without a clear button', () => {
    const h = show('ALP', true)
    expect(h.querySelector('[data-testid=pick-chip]')?.getAttribute('data-preview')).toBe('true')
    expect(h.querySelector('[data-testid=pick-chip-clear]')).toBeNull()
  })
})
