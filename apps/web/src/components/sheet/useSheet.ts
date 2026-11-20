import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { CLOSE_PX, dragPlace, settle, sheetStops, tapNext, velocity, type Detent, type Sample, type Stop } from './sheet'

/**
 * One bottom sheet for every phone panel (ADR 0035, VE-228): the seat and polling place panels, the Seats list (and the lens
 * lists it carries) and Seats like yours. The sheet has peek, half and (for long content) full heights; a drag on its handle or
 * header row follows the finger and settles on release; a tap on the handle steps through the heights.
 *
 * The hook moves the sheet through the CSSOM only (two CSS variables and data attributes, never a style string, for the
 * production CSP). It sets `data-detent` only while `query` matches, and the sheet CSS keys on that attribute, so a desktop
 * or a phone held sideways keeps its old layout and nothing here runs there.
 */

/** A pointer must move this far before a press on the header row becomes a drag (so its buttons still take taps). */
const SLOP_PX = 6
/** A click this soon after a drag ends is the drag's own click, not a tap. */
const CLICK_AFTER_DRAG_MS = 350

/** Where the seat and polling place panels are bottom sheets: narrow screens, except a phone held sideways (panel.css). */
export const PANEL_SHEET_QUERY = '(max-width: 1023px) and (orientation: portrait), (max-width: 1023px) and (min-height: 501px)'

/**
 * The seat panel and the polling place panel hand over to each other in the same frame (VE-208b), so the height the reader left
 * one at carries to the other instead of jumping back to half.
 */
export const panelSheetMemory: { last: Detent } = { last: 'half' }

export interface SheetOptions {
  /** Where this is a bottom sheet. */
  query: string
  initial?: Detent
  /** Half as a share of the room (sheet.ts PANEL_HALF or LIST_HALF). */
  share: number
  /** Whether the sheet may have a full height (sheetStops). */
  full: boolean
  /** Room left above full (sheet.ts FLOAT_ROW_PX on the main stage). */
  gap?: number
  /** Short content stops at its own height and has no full (the seat, polling place and Seats like yours sheets). */
  fit?: boolean
  /** Below peek: 'close' calls onClose (the seat and polling place panels), 'closed' rests at `closedPx`, null stops at peek. */
  below?: 'close' | 'closed' | null
  closedPx?: number
  onClose?: () => void
  /** The content that scrolls: at full, a pull down on it from its top drags the sheet. */
  scroller: () => HTMLElement | null
  /** Told the heights each time the sheet is placed (Seats like yours keeps its map clear of the peek). */
  onPlace?: (stops: readonly Stop[], at: Detent) => void
}

export interface Sheet {
  /** The sheet is a bottom sheet here (the media query matches). */
  active: boolean
  detent: Detent
  set: (d: Detent | ((d: Detent) => Detent)) => void
  /** Where the next tap on the handle goes. */
  next: Detent
  /** A tap on the handle. Where this is not a bottom sheet, it toggles between peek and half as the old handles did. */
  step: () => void
  /** Pointer handlers for the handle and the header row. */
  zone: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
  }
}

interface Drag {
  id: number | 'touch'
  y0: number
  h0: number
  moved: boolean
  stops: Stop[]
  samples: Sample[]
  h: number
  el: HTMLElement | null
}

function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof matchMedia !== 'function') return () => undefined
      const mq = matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => (typeof matchMedia === 'function' ? matchMedia(query).matches : false), () => false)
}

/**
 * The heights the sheet has now, read from the page. Content a sheet does not draw at rest (Seats like yours at peek) is laid
 * out for the reads via data-measuring and taken away again before anything is painted.
 */
function measure(el: HTMLElement, o: SheetOptions): Stop[] {
  el.dataset['measuring'] = ''
  try {
    return measureNow(el, o)
  } finally {
    delete el.dataset['measuring']
  }
}

function measureNow(el: HTMLElement, o: SheetOptions): Stop[] {
  const room = (el.offsetParent as HTMLElement | null)?.clientHeight ?? window.innerHeight
  const top = el.getBoundingClientRect().top
  const sc = o.scroller()
  let peek = 0
  // The peek line is the bottom of the lowest [data-sheet-peek] mark, measured as if the content were scrolled to the top.
  el.querySelectorAll<HTMLElement>('[data-sheet-peek]').forEach((m) => {
    const r = m.getBoundingClientRect()
    if (r.height === 0 && r.width === 0) return
    peek = Math.max(peek, r.bottom - top + (sc && sc.contains(m) ? sc.scrollTop : 0))
  })
  const natural = o.fit ? (sc ? el.offsetHeight - sc.clientHeight + sc.scrollHeight : el.scrollHeight) : null
  // Under the peek line the sheet keeps its own bottom padding (it clears the Rewind handle), so the headline is not on the edge.
  const pad = parseFloat(getComputedStyle(el).paddingBottom) || 0
  return sheetStops({ room, peek: Math.min(room, peek + pad), share: o.share, full: o.full, natural, closed: o.below === 'closed' ? (o.closedPx ?? 44) : null, gap: o.gap ?? 0 })
}

/** How tall the sheet looks now (mid-settle or slid down included): from its top to the bottom of its room. */
function shownHeight(el: HTMLElement): number {
  const room = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect().bottom ?? window.innerHeight
  return room - el.getBoundingClientRect().top
}

const stopOf = (stops: readonly Stop[], d: Detent): Stop => stops.find((s) => s.name === d) ?? (d === 'full' ? stops[stops.length - 1]! : stops.find((s) => s.name === 'peek')!)

export function useSheet(ref: RefObject<HTMLElement | null>, opts: SheetOptions): Sheet {
  const active = useMedia(opts.query)
  const [detent, setDetent] = useState<Detent>(opts.initial ?? 'peek')
  const [dir, setDir] = useState<1 | -1>(1)
  const [hasFull, setHasFull] = useState(opts.full)
  const o = useRef(opts)
  const at = useRef(detent)
  const drag = useRef<Drag | null>(null)
  // No drag yet: a click straight after the page loads is still a tap.
  const dragEnd = useRef(-Infinity)
  // Dragged shut: the panel leaves from where the finger let go, so nothing puts it back at peek on the way out.
  const leaving = useRef(false)
  useLayoutEffect(() => {
    o.current = opts
    at.current = detent
  })

  const order: Detent[] = hasFull ? ['peek', 'half', 'full'] : ['peek', 'half']
  const next = active ? tapNext(order, detent, dir).to : detent === 'peek' || detent === 'closed' ? 'half' : 'peek'

  /** Puts the sheet at a height (or, between heights, where the finger is). Writes only CSS variables and data attributes. */
  const put = useCallback((el: HTMLElement, px: number, drop: number) => {
    el.style.setProperty('--sheet-px', `${px}px`)
    el.style.setProperty('--sheet-drop', `${drop}px`)
  }, [])

  const place = useCallback(() => {
    const el = ref.current
    if (!el || drag.current?.moved || leaving.current) return
    const stops = measure(el, o.current)
    const want = at.current
    const s = stopOf(stops, want)
    put(el, s.h, 0)
    el.dataset['detent'] = s.name
    el.dataset['sheetPx'] = String(s.h)
    // The map frames above the half height whatever the sheet is at now (MapPane, VE-217 and VE-227).
    el.dataset['sheetHalf'] = String(stopOf(stops, 'half').h)
    const full = stops.some((x) => x.name === 'full')
    setHasFull(full)
    // A height the sheet no longer has (full, once the content got shorter) becomes the nearest one it has.
    if (s.name !== want && want !== 'closed') setDetent(s.name)
    o.current.onPlace?.(stops, s.name)
  }, [ref, put])

  // Placed on every render (cheap: a few reads and two variables), so new content, a new seat or a new height all land.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (!active) {
      el.style.removeProperty('--sheet-px')
      el.style.removeProperty('--sheet-drop')
      delete el.dataset['detent']
      delete el.dataset['sheetPx']
      delete el.dataset['sheetHalf']
      delete el.dataset['dragging']
      return
    }
    place()
  })

  // The room changing (rotation, Rewind) or the content growing (the profile loading, more candidates) moves the heights.
  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    let raf = 0
    const later = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(place)
    }
    const ro = new ResizeObserver(later)
    const room = el.offsetParent
    if (room) ro.observe(room)
    const mo = new MutationObserver(later)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
    }
  }, [ref, active, place])

  const begin = (d: Drag) => {
    d.moved = true
    const el = ref.current
    if (el) el.dataset['dragging'] = ''
  }
  const move = (d: Drag, y: number, t: number) => {
    const el = ref.current
    if (!el) return
    d.h = d.h0 - (y - d.y0)
    d.samples.push({ t, h: d.h })
    if (d.samples.length > 20) d.samples.shift()
    const p = dragPlace(d.h, d.stops, o.current.below === 'close')
    put(el, p.px, p.drop)
  }
  const finish = (d: Drag, t: number, cancelled: boolean) => {
    drag.current = null
    const el = ref.current
    if (!el || !d.moved) return
    delete el.dataset['dragging']
    dragEnd.current = performance.now()
    const peek = stopOf(d.stops, 'peek').h
    const v = cancelled || t - (d.samples[d.samples.length - 1]?.t ?? t) > 100 ? 0 : velocity(d.samples)
    const to = settle(d.h, v, d.stops, o.current.below === 'close' ? peek - CLOSE_PX : null)
    if (to === 'close') {
      // The panel leaves from where the finger left it (its leave animation runs on from this transform). Should it stay
      // mounted after all, it is placed again a moment later.
      leaving.current = true
      window.setTimeout(() => {
        leaving.current = false
        place()
      }, 1000)
      o.current.onClose?.()
      return
    }
    const top = d.stops[d.stops.length - 1]!.name
    const low = d.stops[0]!.name
    setDir(to === top ? 1 : to === low ? -1 : stopOf(d.stops, to).h >= d.h0 ? 1 : -1)
    at.current = to
    setDetent(to)
    place()
  }

  // A drag's own click is not a tap on whatever the finger let go over; and at full, a pull down on content scrolled to
  // its top drags the sheet (touch events, as the browser would otherwise take the gesture for scrolling).
  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    const onClick = (e: MouseEvent) => {
      if (performance.now() - dragEnd.current < CLICK_AFTER_DRAG_MS) {
        e.stopPropagation()
        e.preventDefault()
      }
    }
    const onStart = (e: TouchEvent) => {
      const sc = o.current.scroller()
      const t = e.touches[0]
      if (e.touches.length !== 1 || !t || at.current !== 'full' || !sc || !sc.contains(e.target as Node) || sc.scrollTop > 0) return
      drag.current = { id: 'touch', y0: t.clientY, h0: shownHeight(el), moved: false, stops: measure(el, o.current), samples: [], h: 0, el: null }
    }
    const onMove = (e: TouchEvent) => {
      const d = drag.current
      const t = e.touches[0]
      if (!d || d.id !== 'touch' || !t) return
      const dy = t.clientY - d.y0
      if (!d.moved) {
        // A push up scrolls the content as usual; only a pull down from the top moves the sheet.
        if (dy < -SLOP_PX) drag.current = null
        if (dy <= SLOP_PX) return
        begin(d)
      }
      if (e.cancelable) e.preventDefault()
      move(d, t.clientY, e.timeStamp)
    }
    const onEnd = (e: TouchEvent) => {
      const d = drag.current
      if (d?.id === 'touch') finish(d, e.timeStamp, e.type === 'touchcancel')
    }
    el.addEventListener('click', onClick, true)
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('click', onClick, true)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
    // begin, move and finish read only refs and stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, active])

  const zone: Sheet['zone'] = {
    onPointerDown: (e) => {
      const el = ref.current
      if (!active || !el || drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return
      // The seat picker and other fields keep their own touch.
      if ((e.target as Element).closest('select, input, textarea')) return
      drag.current = { id: e.pointerId, y0: e.clientY, h0: shownHeight(el), moved: false, stops: measure(el, o.current), samples: [], h: 0, el: e.currentTarget }
    },
    onPointerMove: (e) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      if (!d.moved) {
        if (Math.abs(e.clientY - d.y0) < SLOP_PX) return
        begin(d)
        try {
          d.el?.setPointerCapture(e.pointerId)
        } catch {
          // The pointer is already gone; the up or cancel still ends the drag.
        }
      }
      move(d, e.clientY, e.timeStamp)
    },
    onPointerUp: (e) => {
      const d = drag.current
      if (d && d.id === e.pointerId) finish(d, e.timeStamp, false)
    },
    onPointerCancel: (e) => {
      const d = drag.current
      if (d && d.id === e.pointerId) finish(d, e.timeStamp, true)
    },
  }

  const set = useCallback((d: Detent | ((d: Detent) => Detent)) => {
    setDetent((cur) => {
      const n = typeof d === 'function' ? d(cur) : d
      at.current = n
      return n
    })
  }, [])

  const step = () => {
    if (!active) {
      set(detent === 'peek' || detent === 'closed' ? 'half' : 'peek')
      return
    }
    const n = tapNext(order, detent, dir)
    setDir(n.dir)
    set(n.to)
  }

  return { active, detent, set, next, step, zone }
}
