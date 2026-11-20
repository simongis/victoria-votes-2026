/** The hint on the Strongest tip (VE-227, finding 15): a phone says "Tap", a laptop or hybrid keeps "Click or tap". `coarse` is `(pointer: coarse)`. */
export const moreHint = (coarse: boolean): string => (coarse ? 'Tap for more.' : 'Click or tap for more.')

/** Is the main pointer a finger? False where matchMedia is missing (tests, old browsers). */
export const isCoarsePointer = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
