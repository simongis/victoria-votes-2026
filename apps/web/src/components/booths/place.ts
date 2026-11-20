import { toScreen, type Cam } from '../map/camera'
import { zoomScale } from './model'
import type { ScreenDot } from './hit'
import type { BoothDot } from './dots'

/** Phones are narrow, so the same dots are drawn a little smaller there. */
export const sizeFactor = (paneWidth: number): number => (paneWidth < 700 ? 0.78 : 1)

/** What multiplies a dot's whole-state radius at this zoom and pane width. */
export const dotScale = (cam: Cam, fitRes: number, paneWidth: number): number => zoomScale(fitRes, cam.res) * sizeFactor(paneWidth)

/** Halo stroke width in pixels for a dot scale: 1.2 at the state fit, easing to 0.7 when zoomed right in. */
export const haloWidth = (k: number): number => Math.max(0.7, 1.2 - 0.5 * ((k - 0.78) / 2.2))

/**
 * Puts every dot where the camera says. Dots are drawn in pixels, not scaled with the map, so a pan or zoom only moves
 * them: the same job as the declared ticks. Called on every camera change, so it reads the layer's circles directly
 * rather than going through React.
 */
export function placeBooths(layer: Element | null, cam: Cam, w: number, h: number, fitRes: number): void {
  if (!layer) return
  const k = dotScale(cam, fitRes, w)
  // The paper halo is widest where dots crowd (the whole state) and thins as zoom pulls them apart.
  ;(layer as SVGElement).style.setProperty('--booth-halo', `${haloWidth(k).toFixed(2)}px`)
  for (const el of layer.children) {
    const c = el as SVGCircleElement
    const d = c.dataset
    if (d.e === undefined) continue
    const [x, y] = toScreen(cam, w, h, Number(d.e), Number(d.n))
    c.setAttribute('cx', x.toFixed(1))
    c.setAttribute('cy', y.toFixed(1))
    c.setAttribute('r', (Number(d.r) * k + Number(d.pad ?? 0)).toFixed(2))
  }
}

/** The dots in pane pixels, for finding the one under a pointer. */
export function screenDots(dots: readonly BoothDot[], cam: Cam, w: number, h: number, fitRes: number): ScreenDot[] {
  const k = dotScale(cam, fitRes, w)
  return dots.map((d) => {
    const [x, y] = toScreen(cam, w, h, d.e, d.n)
    return { key: d.id, x, y, r: d.r0 * k }
  })
}
