import { votesRounded } from './panel'

const au = new Intl.NumberFormat('en-AU')

/** The rail column and the closest-seat cards: "Lead", in votes. "Margin" and "points" mean little to most readers (FB-226). */
export const LEAD_HEADER = 'Lead'
export const LEAD_HINT = 'About how many votes ahead the leader is'

/**
 * The leader's lead in votes, short enough for a table cell. It is an estimate (the two-candidate share applied to every
 * counted vote), so it is rounded, never exact.
 */
export function leadCell(votes: number | null): string {
  if (votes === null) return '-'
  const v = votesRounded(votes)
  return v === 0 ? '<100' : au.format(v)
}

/** The same lead as a sentence for a panel or card. Null with no figure. */
export function aheadLine(votes: number | null): string | null {
  if (votes === null) return null
  const v = votesRounded(votes)
  return v === 0 ? 'Ahead by under 100 votes' : `Ahead by about ${au.format(v)} votes`
}

/** The same lead for a closest-seat card, which is about 150 px wide on a phone: shorter than aheadLine so it never truncates. */
export function aheadCardLine(votes: number | null): string | null {
  if (votes === null) return null
  const v = votesRounded(votes)
  return v === 0 ? 'Under 100 votes ahead' : `About ${au.format(v)} votes ahead`
}

/** The lead as the end of a sentence, "by about 3,100 votes", for the Gains cards (FB-226: votes, not points). Null with no figure. */
export function byVotes(votes: number | null | undefined): string | null {
  if (votes === null || votes === undefined) return null
  const v = votesRounded(votes)
  return v === 0 ? 'by under 100 votes' : `by about ${au.format(v)} votes`
}
