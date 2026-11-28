// Bring a row into view by moving only its nearest scrollable ancestor. Element.scrollIntoView walks every ancestor,
// including overflow: hidden ones, which can slide the whole app shell up (VE-281).

/** The scrollTop that puts [rowTop, rowBottom] inside the viewport, moving as little as possible ("nearest"). */
export function nearestScrollTop(scrollTop: number, viewH: number, rowTop: number, rowBottom: number, marginTop = 0, marginBottom = 0): number {
  if (rowTop - marginTop < scrollTop) return Math.max(0, rowTop - marginTop)
  if (rowBottom + marginBottom > scrollTop + viewH) return Math.max(0, rowBottom + marginBottom - viewH)
  return scrollTop
}

function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

export function scrollRowIntoView(row: Element | null | undefined): void {
  if (!(row instanceof HTMLElement)) return
  const box = scroller(row)
  if (!box) return
  const b = box.getBoundingClientRect()
  const r = row.getBoundingClientRect()
  const cs = getComputedStyle(row)
  const top = box.scrollTop + (r.top - b.top)
  box.scrollTop = nearestScrollTop(box.scrollTop, box.clientHeight, top, top + r.height, parseFloat(cs.scrollMarginTop) || 0, parseFloat(cs.scrollMarginBottom) || 0)
}
