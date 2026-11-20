import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { labelDelay, type HexLabelText } from '../derive/hexLabel'
import { css, usePalette } from '../theme/theme'

/** Where the hexagon sits inside the label's container, in pixels. */
export interface HexAnchor {
  left: number
  right: number
  top: number
  bottom: number
}

const GAP = 6
const EDGE = 4
/** When a label last went away, kept outside React so the next one can tell it is following another straight on (VE-120). */
let lastShownAt = Number.NEGATIVE_INFINITY

/**
 * The quick label for a hovered or focused hexagon (VE-107): seat name, then the leader with a party-colour dot, then one
 * figure. Above the hexagon, flipping below near the top edge, and kept inside the stage. It never takes the pointer and is
 * hidden from assistive tech: the hexagon's own aria-label is the screen reader text.
 *
 * VE-120: on a pointer hover it shows after a short beat (none on keyboard focus, none when following another label
 * straight on).
 */
export function HexLabel({ text, anchor, bounds, keyboard }: { text: HexLabelText; anchor: HexAnchor; bounds: { width: number; height: number }; keyboard: boolean }) {
  const pal = usePalette()
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [shown, setShown] = useState(() => labelDelay({ keyboard, now: performance.now(), lastShownAt }) === 0)
  const shownRef = useRef(shown)
  useEffect(() => {
    shownRef.current = shown
  }, [shown])
  useEffect(() => {
    if (shown) return
    const t = window.setTimeout(() => setShown(true), labelDelay({ keyboard: false, now: performance.now(), lastShownAt }))
    return () => window.clearTimeout(t)
  }, [shown])
  useEffect(
    () => () => {
      if (shownRef.current) lastShownAt = performance.now()
    },
    [],
  )
  useLayoutEffect(() => {
    const el = ref.current
    if (el) setSize((p) => (p.w === el.offsetWidth && p.h === el.offsetHeight ? p : { w: el.offsetWidth, h: el.offsetHeight }))
  }, [text])
  const cx = (anchor.left + anchor.right) / 2
  const left = Math.min(Math.max(cx - size.w / 2, EDGE), Math.max(EDGE, bounds.width - size.w - EDGE))
  const above = anchor.top - GAP - size.h
  const top = above >= EDGE ? above : anchor.bottom + GAP
  return (
    <div ref={ref} className="hexlabel" data-testid="hex-label" aria-hidden style={{ left, top, visibility: size.w && shown ? 'visible' : 'hidden' }}>
      <b className="hexlabel__name">{text.name}</b>
      <span className="hexlabel__lead">
        {text.leader && <i className="hexlabel__dot" style={{ background: css(pal.party[text.leader]) }} />}
        {text.lead}
      </span>
      {text.extra && <span className="hexlabel__extra">{text.extra}</span>}
    </div>
  )
}
