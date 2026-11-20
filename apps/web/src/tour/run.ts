// VE-89: the tour itself, on Driver.js (MIT). Lazy-loaded: nothing here is in the startup bundle.
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import '../styles/tour.css'
import { TOUR_STEPS, findTarget } from './steps'
import { markSeen } from './rule'
import { getMotion } from '../state/motion'

let active: Driver | null = null

/** Starts the tour on the steps whose target is on screen. False when fewer than two are (nothing worth showing). */
export function startTour(opts: { onEnd?: (done: boolean) => void }): boolean {
  if (active?.isActive()) return true
  const steps = TOUR_STEPS.filter((s) => findTarget(s))
  if (steps.length < 2) return false
  const calm = getMotion() === 'reduced'
  // Driver itself puts focus back where it was when it ends.
  let ended = false
  const last = steps.length - 1
  const d: Driver = driver({
    animate: !calm,
    smoothScroll: false,
    allowClose: true,
    allowKeyboardControl: true,
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    stagePadding: 6,
    stageRadius: 8,
    overlayOpacity: 0.45,
    popoverClass: 'vic-tour',
    disableActiveInteraction: true,
    steps: steps.map((s, i) => ({
      element: () => findTarget(s) ?? document.body,
      popover: {
        title: s.title,
        description: s.text,
        side: s.side,
        align: 'start' as const,
        // The last step's button is "Done": that, and only that, opens the key afterwards.
        ...(i === last
          ? {
              onNextClick: () => end(true),
            }
          : {}),
      },
    })),
    onPopoverRender: (pop) => {
      const skip = document.createElement('button')
      skip.type = 'button'
      skip.className = 'vic-tour__skip'
      skip.textContent = 'Skip the tour'
      skip.addEventListener('click', () => end(false))
      pop.wrapper.append(skip)
    },
    // Every other way out (the cross, Escape, a click outside) is a skip.
    onDestroyStarted: () => end(false),
  })
  // One way out for all of them. Driver's own onDestroyed is not used: it stays silent if the person moves faster than its
  // 400 ms step animation, and the end must always be reported.
  function end(done: boolean) {
    if (ended) return
    ended = true
    d.destroy()
    active = null
    opts.onEnd?.(done)
  }
  active = d
  markSeen() // once started it counts as seen, so a reload mid-tour does not start it again
  d.drive()
  return true
}

export function stopTour(): void {
  active?.destroy()
}
