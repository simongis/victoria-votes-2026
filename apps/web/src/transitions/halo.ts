import { clamp01 } from './timeline'

/**
 * The seat-flip halo (ported from the VE-47a prototype): a one-shot ring that grows and fades on a seat whose
 * leader changed on a tick. Pure maths plus one draw call, on the same canvas as the transitions but never
 * while one is in flight (the runner enforces that).
 */

export const HALO_MS = 1100

export interface Halo {
  /** Canvas pixels. */
  x: number
  y: number
  /** Resting radius; the ring grows to about 2.4 times this. */
  r: number
  /** CSS colour (a theme colour, never a literal). */
  colour: string
}

export interface HaloSpec {
  width: number
  height: number
  halos: Halo[]
}

/** Ring scale and opacity at `ms` into the pulse: fast out, then a slow fade. */
export function haloAt(ms: number): { scale: number; alpha: number } {
  const t = clamp01(ms / HALO_MS)
  const out = 1 - (1 - t) ** 3
  return { scale: 1 + 1.4 * out, alpha: 0.9 * (1 - t) ** 1.5 }
}

export function drawHalos(c: CanvasRenderingContext2D, spec: HaloSpec, ms: number): void {
  c.clearRect(0, 0, spec.width, spec.height)
  const { scale, alpha } = haloAt(ms)
  if (alpha <= 0.005) return
  c.globalAlpha = alpha
  c.lineWidth = 3
  for (const h of spec.halos) {
    c.strokeStyle = h.colour
    c.beginPath()
    c.arc(h.x, h.y, h.r * scale, 0, Math.PI * 2)
    c.stroke()
  }
  c.globalAlpha = 1
}
