// Clickjacking guard (VE-188). A meta CSP cannot carry frame-ancestors, so a page that finds itself inside someone
// else's frame shows a notice with a link to the real site instead of the app.

/** True when the page is inside a frame. A parent that blocks reading `top` also counts as framed. */
export function isFramed(w: { readonly top: unknown; readonly self: unknown }): boolean {
  try {
    return w.top !== w.self
  } catch {
    return true
  }
}

/** Replaces the root's contents with the notice. DOM calls only, so it works before React and needs no styles. */
export function showFrameNotice(root: HTMLElement, siteUrl: string): void {
  const p = document.createElement('p')
  p.style.cssText = 'font: 16px/1.5 system-ui, sans-serif; padding: 24px; max-width: 32em'
  p.append('This page should not be shown inside another site. ')
  const a = document.createElement('a')
  a.href = siteUrl
  a.target = '_top'
  a.textContent = 'Open the Victorian election results'
  p.append(a, '.')
  root.replaceChildren(p)
}
