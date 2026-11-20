/** Past this many times the full-state fit the inset goes away: the viewer is zoomed in and has their own room (ADR 0023). */
export const INSET_AWAY_ZOOM = 2.5

export const insetAway = (zoom: number): boolean => zoom > INSET_AWAY_ZOOM

/**
 * Turns the map's metres per pixel into "times zoomed in". The map never zooms out past its full-state fit, so the
 * coarsest resolution seen is the fit; zoom is that over the current one. MapApi does not expose the fit, and this
 * avoids touching MapPane. The map also reports when it sits at its fit (fit()), so a bigger window is learned too.
 */
export function createZoomGauge() {
  let fitRes = 0
  return {
    read(res: number | null): number {
      if (res === null || !(res > 0)) return 1
      if (res > fitRes) fitRes = res
      return fitRes / res
    },
    /** The map says it is at its full-state fit right now (data-fitted=true): learn the fit exactly, even if it got smaller. */
    fit(res: number | null): void {
      if (res !== null && res > 0) fitRes = res
    },
  }
}
