export const INSET_KEY = 'vic26.inset'

/** Is the hex inset minimised? Storage can be blocked or empty (private windows), so every access is guarded. */
export function readMinimised(): boolean {
  try {
    return localStorage.getItem(INSET_KEY) === 'min'
  } catch {
    return false
  }
}

export function writeMinimised(min: boolean): void {
  try {
    if (min) localStorage.setItem(INSET_KEY, 'min')
    else localStorage.removeItem(INSET_KEY)
  } catch {
    /* the choice just won't be remembered */
  }
}
