const TZ = 'Australia/Melbourne'
const timeFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
const dayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })

// Intl puts a narrow no-break space before am/pm in some engines; normalise so labels wrap and match.
const ODD_SPACES = new RegExp(`[${String.fromCharCode(0x202f, 0xa0)}]`, 'g')
const tidy = (s: string): string => s.replace(ODD_SPACES, ' ').toLowerCase()

/** "9:05 pm" on the night; with the day once the count runs past the night (within 12 hours of `nightStart`). */
export function clockLabel(ms: number, nightStart: number): string {
  const t = tidy(timeFmt.format(ms))
  return ms - nightStart < 12 * 3600_000 ? t : `${dayFmt.format(ms).replace(',', '')}, ${t}`
}

export const num = new Intl.NumberFormat('en-AU')

/** "TAYLOR, Nina" reads better on screen as "Nina Taylor". */
export function personName(raw: string): string {
  const [sur, given] = raw.split(',').map((s) => s.trim())
  const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
  return given ? `${given} ${title(sur ?? '')}` : title(raw)
}
