import type { ScreenFn } from '../transitions'
import { vicgrid } from '../components/map/vicgrid'

/**
 * Planar (Web Mercator metres) to overlay pixels for each real view, so the transition canvas can draw exactly
 * where the views are, including where they WILL be after a layout change (desktop swaps the primary pane; mobile
 * shows the other pane). Both are linear, so they can be predicted from a camera and a rectangle without waiting
 * for the views to resize.
 */

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The MapView's centre and resolution in its own units: Web Mercator metres (the app's view) or degrees (a
 * geographic view, plate carree). `resolution` is view units per CSS pixel.
 */
export interface MapCamera {
  cx: number
  cy: number
  resolution: number
  units: 'degrees' | 'metres' | 'vicgrid'
}

const R = 6378137
const toLon = (x: number): number => (x * 180) / (Math.PI * R)
const toLat = (y: number): number => ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI

/** The overlay's top-left in page pixels: the canvas draws in its own pixels. */
export interface Origin {
  left: number
  top: number
}

/** Web Mercator metres in, overlay pixels out. The map keeps its centre and scale when the container resizes, so this holds for a new rect. */
export function mapScreen(cam: MapCamera, rect: Rect, origin: Origin): ScreenFn {
  const ox = rect.left - origin.left + rect.width / 2
  const oy = rect.top - origin.top + rect.height / 2
  // The inputs are Web Mercator metres (the transition geometry is built in them); the SVG map is drawn in VicGrid, so unproject and reproject.
  if (cam.units === 'vicgrid')
    return ([x, y]) => {
      const [e, n] = vicgrid(toLon(x), toLat(y))
      return [ox + (e - cam.cx) / cam.resolution, oy - (n - cam.cy) / cam.resolution]
    }
  // A geographic view is linear in degrees, so unproject first.
  if (cam.units === 'degrees') return ([x, y]) => [ox + (toLon(x) - cam.cx) / cam.resolution, oy - (toLat(y) - cam.cy) / cam.resolution]
  return ([x, y]) => [ox + (x - cam.cx) / cam.resolution, oy - (y - cam.cy) / cam.resolution]
}

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

/** SVG units per Web Mercator metre in SeatsPane (views/geometry.ts projectSvg: lon * 100, y negated). */
const SVG_PER_METRE = (100 * 180) / (Math.PI * 6378137)

/** `rect` is the SVG's content box (inside its CSS padding); the viewBox is fitted xMidYMid meet. */
export function seatsScreen(vb: ViewBox, rect: Rect, origin: Origin): ScreenFn {
  const s = Math.min(rect.width / vb.w, rect.height / vb.h)
  const ox = rect.left - origin.left + (rect.width - vb.w * s) / 2 - vb.x * s
  const oy = rect.top - origin.top + (rect.height - vb.h * s) / 2 - vb.y * s
  return ([x, y]) => [ox + x * SVG_PER_METRE * s, oy - y * SVG_PER_METRE * s]
}
