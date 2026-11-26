/**
 * VE-234: a seat's first-preference change by party, the swing figure that exists in every seat. The two-candidate swing only
 * exists where the pair is unchanged, and in 2026 many seats will not be Labor v Coalition, so this leads the swing section.
 * Pure, so ordering, "new" and rounding are tested without a browser.
 */
import type { PartyBucket } from '@vic26/schema'
import { belowSwingMin } from '../../derive/colour'
import type { Seat } from '../../derive/seats'
import { PARTY_NAMES } from '../../parties'
import type { FpBaseline } from '../lenspanel/swing'

type Base = Partial<Record<PartyBucket, number>>

export interface FpChangeItem {
  /** The party, or null for the "others" total (parties not named, and the Other bucket). */
  party: PartyBucket | null
  /** Points up or down since the baseline; null for a new party (it has a share, not a change). */
  change: number | null
  /** Share now, in percent. */
  share: number
  /** The party did not stand at the baseline, so it is "new", never "+N" from nothing. */
  fresh: boolean
}

/** The most parties named before the rest are folded into "others". */
const NAMED = 3
const BUCKETS: readonly PartyBucket[] = ['ALP', 'LIB', 'NAT', 'GRN', 'ONP', 'IND']
/** Under this a move shows as 0.0 at one decimal place, so it is not worth a word. */
const visible = (n: number): boolean => Math.round(Math.abs(n) * 10) >= 1

/**
 * Named parties biggest mover first (a new party ranks by its share, since that is how far it moved), then one "others" row for
 * everything not named. Empty while the seat is too early (early booths mislead) or without a baseline.
 */
export function fpChangeItems(seat: Seat, base: Base | undefined): FpChangeItem[] {
  if (!base || belowSwingMin(seat.pct)) return []
  const now = (p: PartyBucket): number => seat.fp.filter((f) => f.party === p).reduce((a, f) => a + f.pct, 0)
  const rows = BUCKETS.map((party): FpChangeItem => {
    const share = now(party)
    const before = base[party] ?? 0
    const fresh = before <= 0 && share > 0
    return { party, share, fresh, change: fresh ? null : share - before }
  }).filter((r) => (r.fresh ? visible(r.share) : visible(r.change ?? 0)))
  const size = (r: FpChangeItem): number => (r.fresh ? r.share : Math.abs(r.change ?? 0))
  rows.sort((a, b) => size(b) - size(a) || String(a.party).localeCompare(String(b.party)))
  const named = rows.slice(0, NAMED)
  const left = rows.slice(NAMED)
  const others = left.reduce((a, r) => a + (r.fresh ? r.share : r.change ?? 0), 0) + (now('OTH') - (base.OTH ?? 0))
  const othersShare = left.reduce((a, r) => a + r.share, 0) + now('OTH')
  return visible(others) ? [...named, { party: null, change: others, share: othersShare, fresh: false }] : named
}

const signed1 = (n: number): string => `${n < 0 ? '-' : '+'}${(Math.round(Math.abs(n) * 10) / 10).toFixed(1)}`

/** "First preferences since 2022: One Nation new (21.0%), Labor -14.0, Greens +1.2, Other parties +0.3", or null with nothing to say. */
export function fpChangeText(items: readonly FpChangeItem[], since: string): string | null {
  if (items.length === 0) return null
  const parts = items.map((i) => {
    const name = i.party ? PARTY_NAMES[i.party] : 'Other parties'
    return i.fresh ? `${name} new (${i.share.toFixed(1)}%)` : `${name} ${signed1(i.change ?? 0)}`
  })
  return `First preferences since ${since}: ${parts.join(', ')}`
}

/** The same line for a seat, straight from the baseline map. */
export const fpChangeLine = (seat: Seat, baseline: FpBaseline | null): string | null =>
  fpChangeText(fpChangeItems(seat, baseline?.get(seat.id)), seat.baseNote || 'the last election')
