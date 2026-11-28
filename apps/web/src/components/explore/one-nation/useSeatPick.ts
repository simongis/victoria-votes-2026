import { useCallback, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { stepFocus } from '../../../derive/oneNation'

const idOf = (t: EventTarget | null): number | null => {
  const el = t instanceof Element ? t.closest<SVGElement | HTMLElement>('[data-id]') : null
  return el ? Number(el.dataset.id) : null
}

/**
 * Which seat the pill is about, shared by all three modes. Hover (mouse only) previews, a click, tap or Enter holds the
 * seat until it is tapped again, and keyboard focus previews too. Every mark is one roving tab stop; arrows move between marks.
 */
export function useSeatPick() {
  const [hover, setHover] = useState<number | null>(null)
  const [sticky, setSticky] = useState<number | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  const [tabStop, setTabStop] = useState<number | null>(null)
  const active = hover ?? focused ?? sticky
  // VE-282: the one-line pill follows hover and keyboard focus only; the held seat's details live in the side panel.
  const previewing = hover ?? focused

  const toggle = useCallback((id: number) => setSticky((s) => (s === id ? null : id)), [])
  const select = useCallback((id: number) => setSticky(id), [])
  const clear = useCallback(() => {
    setSticky(null)
    setHover(null)
  }, [])

  /** Handlers for the element that holds all the marks. */
  const container = {
    onPointerOver: (e: PointerEvent) => e.pointerType === 'mouse' && setHover(idOf(e.target)),
    onPointerOut: (e: PointerEvent) => e.pointerType === 'mouse' && setHover(idOf(e.relatedTarget)),
    onClick: (e: MouseEvent) => {
      const id = idOf(e.target)
      if (id === null) {
        setSticky(null)
        return
      }
      toggle(id)
      setHover(null)
    },
  }

  /** Props for one mark: a roving tab stop that previews on keyboard focus and speaks the pill's sentence. */
  const mark = (id: number, label: string, stop: number | null) => ({
    'data-id': id,
    role: 'button' as const,
    tabIndex: id === (tabStop ?? stop) ? 0 : -1,
    'aria-label': label,
    'aria-pressed': sticky === id,
    onFocus: (e: React.FocusEvent<Element>) => {
      setTabStop(id)
      // Only keyboard focus previews: a mouse click leaves focus behind, and the pill must go when the tap clears it.
      if (e.currentTarget.matches(':focus-visible')) setFocused(id)
    },
    onBlur: () => setFocused((f) => (f === id ? null : f)),
  })

  /** Arrow keys move between marks (by position), Enter or Space holds the seat. */
  const onKey = (e: KeyboardEvent<Element>, points: readonly { id: number; x: number; y: number }[]) => {
    const id = idOf(e.target)
    if (id === null) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle(id)
      return
    }
    const d: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }
    const step = d[e.key]
    if (!step) return
    e.preventDefault()
    const next = stepFocus(points, id, step[0], step[1])
    if (next !== id) e.currentTarget.querySelector<HTMLElement | SVGElement>(`[data-id="${next}"]`)?.focus()
  }

  return { active, previewing, sticky, hover, select, container, mark, onKey, clear }
}
export type SeatPick = ReturnType<typeof useSeatPick>
