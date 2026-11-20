// VE-89 (FB-74): the tour's steps. Plain words, each under about 20. Targets are existing elements; a step whose target
// is not on screen (the View button on desktop, Rewind in a held state) is skipped, which is how the phone variants differ.

export interface TourStep {
  id: string
  /** Candidates, in order; the first one that is laid out wins. */
  selector: string
  title: string
  text: string
  side: 'top' | 'bottom' | 'left' | 'right'
}

export const TOUR_STEPS: readonly TourStep[] = [
  // VE-217 (ADR 0032): a phone has one Victoria map the reader zooms, so the step says how (a desktop's wheel zooms too).
  { id: 'map', selector: '.panes', side: 'bottom', title: 'The seats', text: 'Each seat takes its leading party’s colour: faint for an early lead, solid once certain or won. Zoom in and tap a seat.' },
  // Phone only: the shape, the colours, "More ways to see it" and Rewind all live behind this button there (ADR 0018, VE-144a).
  { id: 'view', selector: '.view-sheet__btn', side: 'right', title: 'View', text: 'Map or Hex, the colours, more ways to see the results, and Rewind the night.' },
  { id: 'tally', selector: '.band .tl', side: 'bottom', title: 'The tally', text: 'Seats by party, solid colours first. 45 makes a majority.' },
  // Phone only: the one-row handle (headline, seats in doubt, "Seats") that pulls the list of seats up.
  { id: 'handle', selector: '.rail__handle', side: 'top', title: 'The list of seats', text: 'Pull this up for every seat, with the headline and the close seats.' },
  // VE-215 A20: search is how most people find their own seat. Phone: the Seats button opens it; desktop: the box is on screen.
  { id: 'find-phone', selector: '.rail__seats', side: 'top', title: 'Find your seat', text: 'Type a suburb, postcode or seat name.' },
  { id: 'find', selector: '.rail__search', side: 'left', title: 'Find your seat', text: 'Type a suburb, postcode or seat name.' },
  { id: 'chips', selector: '.stage > .colour-chips .segmented', side: 'top', title: 'Colour the seats', text: 'Ways to colour the seats.' },
  { id: 'rewind', selector: '.rewind__handle[aria-controls="rewind-panel"]', side: 'top', title: 'Rewind', text: 'Replay the count through the night.' },
  { id: 'explore', selector: '.more-ways-chip, .explore-peek, .explore-more', side: 'top', title: 'More ways', text: 'More ways to see the results.' },
  { id: 'info', selector: '.band .info__btn, .float .info__btn', side: 'bottom', title: 'The "i"', text: 'What everything means, and where the figures come from.' },
]

const visible = (el: Element): boolean => (el as HTMLElement).getClientRects().length > 0

/** The first laid-out element for a step, or null. */
export function findTarget(s: TourStep, root: ParentNode = document): HTMLElement | null {
  for (const el of root.querySelectorAll(s.selector)) if (visible(el)) return el as HTMLElement
  return null
}
