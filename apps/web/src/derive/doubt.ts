/**
 * The In doubt list's two bars (VE-111): the lead and the votes still to count, drawn on one scale so a glance shows
 * whether the count can still overturn the lead. Pure, so the scale is tested without a browser.
 */
import { votesRounded } from './panel'

const au = new Intl.NumberFormat('en-AU')

export interface LeadLeft {
  lead: number | null
  left: number | null
}

/** The largest figure of either kind across the rows that have both; 0 when none do (no bars to draw). */
export function barScale(rows: readonly LeadLeft[]): number {
  let max = 0
  for (const r of rows) {
    if (r.lead === null || r.left === null) continue
    max = Math.max(max, r.lead, r.left)
  }
  return max
}

/** Bar widths as percentages of the shared scale. The tick sits where the lead would equal the votes left. */
export function barWidths(lead: number | null, left: number | null, scale: number): { lead: number; left: number; tick: number } | null {
  if (lead === null || left === null || scale <= 0) return null
  const pct = (n: number) => Math.min(100, (100 * n) / scale)
  return { lead: pct(lead), left: pct(left), tick: pct(left) }
}

/** Screen reader text for a row's bars, rounded the way the panel's line is so it never claims more than the estimate knows. */
export function doubtWords(lead: number | null, left: number | null): string {
  if (lead === null || left === null) return 'No vote figures yet'
  const l = votesRounded(lead)
  const leadText = l === 0 ? 'Lead under 100 votes' : `Lead about ${au.format(l)} votes`
  const r = votesRounded(left)
  return `${leadText}, ${r === 0 ? 'nothing left to count' : `about ${au.format(r)} still to count`}`
}
