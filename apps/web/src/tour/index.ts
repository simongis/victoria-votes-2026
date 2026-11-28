// VE-89: the tour's front door. Small and in the main chunk; Driver.js and its styles load only when the tour opens.
import { readMark, shouldAutoShow, type ShowContext } from './rule'

export { TOUR_KEY, readMark, writeMark, shouldAutoShow } from './rule'

let shownThisSession = false

type TourWindow = Window & { __VIC26_TOUR__?: boolean }

// VE-303: the map's own "How to read this map" (desktop stage, lens corner) or the phone's float "i".
const infoButtons = '.stage-info .info__btn, .float .info__btn'

/** After the tour: Done opens the "i" once so the key is on show (FB-79). Clicking the real button keeps its state in React. */
function afterTour(done: boolean): void {
  if (!done) return
  // A beat later: the Done click is still travelling up the page, and the "i" closes on any click outside it.
  window.setTimeout(() => {
    const btn = [...document.querySelectorAll<HTMLButtonElement>(infoButtons)].find((b) => b.getClientRects().length > 0)
    if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click()
  }, 0)
}

/** Opens the tour (lazily). "Show me around" calls this directly, so it ignores the stored choice. */
export async function openTour(): Promise<boolean> {
  // Close the "i" the button sat in: a click elsewhere is how it closes, and the tour's last step points at it.
  document.body.click()
  const { startTour } = await import('./run')
  const ok = startTour({ onEnd: afterTour })
  if (ok) shownThisSession = true
  return ok
}

/** Opens the tour by itself if the rules allow it. Returns whether it opened. */
export async function autoStartTour(where: { rewinding: boolean; seatOpen: boolean; exploreOpen: boolean }): Promise<boolean> {
  const ctx: ShowContext = {
    ...where,
    mark: readMark(),
    shownThisSession,
    automated: typeof navigator !== 'undefined' && navigator.webdriver === true,
    optedIn: (window as TourWindow).__VIC26_TOUR__ === true,
  }
  return shouldAutoShow(ctx) ? openTour() : false
}
