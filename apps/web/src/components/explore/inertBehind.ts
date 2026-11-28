/** Marks an element that stays usable while a lens makes everything behind it inert (VE-307: the header's About). */
export const KEEP_LIVE_ATTR = 'data-keep-live'

/**
 * The elements to make inert while a lens fills the stage (VE-104): every sibling on the way from the lens up to the app
 * root. An inert ancestor cannot be undone by a descendant, so a sibling that holds a keep-live element (the About, which
 * carries the provisional notice and must be reachable from every view, ADR 0017 as changed by VE-307) is not made inert
 * itself; its own children are, all but the branch that leads to the kept element.
 */
export function inertBehind(lens: Element): Element[] {
  const out: Element[] = []
  const add = (el: Element) => {
    if (el.hasAttribute(KEEP_LIVE_ATTR)) return
    if (el.querySelector(`[${KEEP_LIVE_ATTR}]`)) {
      for (const c of el.children) add(c)
      return
    }
    out.push(el)
  }
  for (let node: Element | null = lens; node && !node.classList.contains('app'); node = node.parentElement) {
    for (const c of node.parentElement?.children ?? []) if (c !== node) add(c)
  }
  return out
}
