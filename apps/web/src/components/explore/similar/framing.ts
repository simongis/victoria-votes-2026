/**
 * VE-213: the Map framing for the similar-places lens. The picked seat and its five matches are fitted into the stage so
 * the threads can be read when they are all in one city; when the six span most of the state the whole state shows, as before.
 */
export type Frame = [number, number, number, number]
interface Box { x0: number; y0: number; x1: number; y1: number }

/** The six fill about this share of the stage at most (never zoomed in past it). */
const MAX_FILL = 0.7
/** Padding round the six, as a share of their span. */
const PAD = 0.12
/** At or above this share of the full extent the framing is not worth it: show the whole state. */
const NEAR_FULL = 0.85

/** The viewBox that fits `boxes` at the stage's aspect (width over height), or null when it is close to the full extent. */
export function frameFor(boxes: readonly Box[], full: Frame, aspect: number): Frame | null {
  if (boxes.length === 0) return null
  const x0 = Math.min(...boxes.map((b) => b.x0))
  const y0 = Math.min(...boxes.map((b) => b.y0))
  const x1 = Math.max(...boxes.map((b) => b.x1))
  const y1 = Math.max(...boxes.map((b) => b.y1))
  const bw = Math.max(x1 - x0, 1)
  const bh = Math.max(y1 - y0, 1)
  let w = Math.max(bw * (1 + 2 * PAD), bw / MAX_FILL)
  let h = Math.max(bh * (1 + 2 * PAD), bh / MAX_FILL)
  // Match the stage's shape so the fit is not wasted on empty margin (the SVG centres what it is given).
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  if (w >= full[2] * NEAR_FULL || h >= full[3] * NEAR_FULL) return null
  return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h]
}

const ease = (t: number): number => 1 - (1 - t) ** 3

/** Eases from one frame to another over `ms`, calling `apply` each animation frame. Returns a stop function. */
export function tweenFrame(from: Frame, to: Frame, ms: number, apply: (f: Frame) => void): () => void {
  let raf = 0
  const t0 = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms)
    const k = ease(t)
    apply(from.map((v, i) => v + (to[i]! - v) * k) as Frame)
    if (t < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}
