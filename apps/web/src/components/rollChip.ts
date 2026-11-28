/**
 * The "+n" / "-n" beside a count that changed (VE-60), or null when there is nothing to say. `from` is the count the
 * reader was last given (the previous target, not a half-rolled number on screen); a change that rounds to nothing at
 * the shown precision is no change, so it never reads "+0" or "-0" (VE-291).
 */
export function rollChipText(from: number | null, to: number, digits: number): string | null {
  if (from === null) return null
  const diff = Number((to - from).toFixed(digits))
  if (diff === 0) return null
  return `${diff > 0 ? '+' : '-'}${Math.abs(diff).toFixed(digits)}`
}
