/**
 * The swing lens's panel (VE-125): every seat as a ranked row, from the same marks the stage draws (derive/arrows.ts), so the
 * list and the picture cannot disagree. Pure, so the ranking, the filters and the summary are tested without a browser.
 */
import type { DistrictStatic, PartyBucket } from '@vic26/schema'
import { belowSwingMin } from '../../derive/colour'
import { captionCounts, classifySeat, markSentence, type Mark } from '../../derive/arrows'
import { PARTY_NAMES } from '../../parties'
import type { Seat } from '../../derive/seats'

/** The lens's three filters. Little change, too early and no-count seats sit in none of them, only in the full list. */
export type SwingFilter = 'labor' | 'coalition' | 'other' | 'changed'

/** 2022 final first-preference share by party, per district (percent). */
export type FpBaseline = ReadonlyMap<number, Partial<Record<PartyBucket, number>>>

/** What a row in "Other contests" shows: the challenger in the top two and how its first preferences stand. */
export interface OtherDetail {
  /** The finalist that is neither Labor nor a Coalition party; null where the pair was Labor v Coalition now but different in 2022. */
  party: PartyBucket | null
  /** Its first-preference share now, in percent. */
  share: number | null
  /** Its change since 2022 in points; null while too early or when there is no 2022 figure to compare. */
  change: number | null
  /** Under the swing threshold: the row says "too early" and shows no figure (early booths mislead). */
  early: boolean
  /** Change in first preferences since the last contest for every party that moved, biggest first (VE-130); empty while too early or without a baseline. */
  movers: Mover[]
}

/** One party's change in first preferences since the last contest, in points. */
export interface Mover {
  party: PartyBucket
  /** Share now, in percent (0 where the party no longer stands). */
  share: number
  /** Points up (positive) or down (negative). For a `fresh` party it is its whole share, so never show it as a change. */
  change: number
  /** VE-226 (finding 8): the party did not stand last time, so it has a share but no change; it is never "+N" from nothing. */
  fresh: boolean
}

export interface SwingRow {
  id: number
  name: string
  seat: Seat
  mark: Mark
  filter: SwingFilter | null
  /** The size of the two-candidate swing in points, unsigned (the arrow says which way); null where there is no arrow or bar. */
  size: number | null
  detail: OtherDetail | null
}

const isMajor = (p: PartyBucket): boolean => p === 'ALP' || p === 'LIB' || p === 'NAT'

/** The finalist that is not Labor or the Coalition, or null (Labor v Coalition, or no pair yet). */
export function challengerOf(seat: Seat): PartyBucket | null {
  if (!seat.tcp || !seat.tcp.b) return null
  return [seat.tcp.b, seat.tcp.a].find((p) => !isMajor(p)) ?? null
}

const shareOf = (seat: Seat, party: PartyBucket): number | null => {
  const hit = seat.fp.filter((f) => f.party === party)
  return hit.length === 0 ? null : hit.reduce((a, f) => a + f.pct, 0)
}

/** The challenger's first-preference change since 2022, in points; null without a baseline or a current share. */
export function challengerChange(seat: Seat, base: Partial<Record<PartyBucket, number>> | undefined): number | null {
  const party = challengerOf(seat)
  if (!party || !base || base[party] === undefined) return null
  const now = shareOf(seat, party)
  return now === null ? null : now - base[party]
}

/** Moves under this are noise at one decimal place. */
const MOVER_MIN = 0.1
const MOVER_BUCKETS: readonly PartyBucket[] = ['ALP', 'LIB', 'NAT', 'GRN', 'ONP', 'IND']

/**
 * Each party's change in first preferences, biggest first (VE-130, ADR 0028). A party missing from the baseline did not
 * stand last time: it is `fresh`, listed after the parties that moved and never ranked as a change (VE-226, finding 8;
 * One Nation stood in 5 of 88 seats in 2022). One missing now has dropped out. The catch-all Other bucket is left out: it
 * lumps unrelated parties, so a move there says nothing about any one of them. Empty while the seat is too early.
 */
export function fpMovers(seat: Seat, base: Partial<Record<PartyBucket, number>> | undefined): Mover[] {
  if (!base || belowSwingMin(seat.pct)) return []
  return MOVER_BUCKETS.flatMap((party) => {
    const share = shareOf(seat, party) ?? 0
    const before = base[party] ?? 0
    const fresh = before <= 0
    const change = share - before
    return Math.abs(change) >= MOVER_MIN ? [{ party, share, change, fresh }] : []
  }).sort((a, b) => Number(a.fresh) - Number(b.fresh) || Math.abs(b.change) - Math.abs(a.change) || a.party.localeCompare(b.party))
}

/** The biggest real change (not a party new to the seat), for the triangle and the ranking; undefined when none moved. */
export const biggestMover = (movers: readonly Mover[] | undefined): Mover | undefined => movers?.find((m) => !m.fresh)

/**
 * The two movers a row shows: the biggest real change, then the biggest party new to the seat if there is one (it is often
 * the night's story, so it is never pushed out by a second change), else the second-biggest change (VE-224).
 */
export function shownMovers(movers: readonly Mover[]): Mover[] {
  const real = movers.filter((m) => !m.fresh)
  const fresh = movers.find((m) => m.fresh)
  return [real[0], fresh ?? real[1]].filter((m): m is Mover => m !== undefined)
}

/** "did not stand in 2022", "did not stand in the 2025 by-election". */
export const didNotStand = (since: string): string => `did not stand in ${/^(\d{4}$|the )/.test(since) ? since : `the ${since}`}`

const signed1 = (n: number): string => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(1)}`

/** The two biggest movers as the row shows them: "Greens +6.1, Labor -4.0", or "One Nation 9.0%, did not stand in 2022". */
export const moversText = (movers: readonly Mover[], since = '2022'): string =>
  shownMovers(movers).map((m) => (m.fresh ? `${PARTY_NAMES[m.party]} ${m.share.toFixed(1)}%, ${didNotStand(since)}` : `${PARTY_NAMES[m.party]} ${signed1(m.change)}`)).join(', ')

function detailOf(seat: Seat, base: Partial<Record<PartyBucket, number>> | undefined): OtherDetail {
  const party = challengerOf(seat)
  const early = belowSwingMin(seat.pct)
  return { party, share: party ? shareOf(seat, party) : null, change: early ? null : challengerChange(seat, base), early, movers: fpMovers(seat, base) }
}

/** Where a row sits in the full list: arrows, little change, too early (seats and other contests), other contests (change known first), no count. */
function tierOf(r: SwingRow): number {
  switch (r.mark.kind) {
    case 'arrow': return 0
    case 'flat': return 1
    case 'early': return 2
    // VE-215 A15: an other contest that is still too early reads "Too early", so it sits with the too-early seats.
    case 'other': return r.detail?.early ? 2 : r.detail?.change != null || r.detail?.movers.length ? 3 : 4
    // VE-285: Labor v Coalition now but a different 2022 pair: no figure to rank by, after the other contests that have a change.
    case 'changed': return 4
    case 'notin': return 5
  }
}

const sizeOf = (r: SwingRow): number => (r.mark.kind === 'other' ? Math.abs(biggestMover(r.detail?.movers)?.change ?? r.detail?.change ?? 0) : r.size ?? 0)

// Name breaks ties so the order is stable from one tick to the next.
const ranked = (rows: SwingRow[]): SwingRow[] => rows.sort((a, b) => tierOf(a) - tierOf(b) || sizeOf(b) - sizeOf(a) || a.name.localeCompare(b.name))

/** The same rows with the 2022 first preferences applied to the other contests (the panel loads the asset after the rows are built). */
export function withBaseline(rows: readonly SwingRow[], baseline: FpBaseline | null): SwingRow[] {
  if (!baseline) return [...rows]
  return ranked(rows.map((r) => (r.mark.kind === 'other' ? { ...r, detail: detailOf(r.seat, baseline.get(r.id)) } : r)))
}

/** Every seat, ranked the way the picture invites: biggest swing first, then the seats with nothing to rank. */
export function swingRows(seats: Iterable<Seat>, statics: ReadonlyMap<number, DistrictStatic>, baseline: FpBaseline | null = null): SwingRow[] {
  const rows = [...seats].map((seat): SwingRow => {
    const mark = classifySeat(seat, statics.get(seat.id))
    const filter: SwingFilter | null = mark.kind === 'arrow' ? (mark.toward === 'ALP' ? 'labor' : 'coalition') : mark.kind === 'other' ? 'other' : mark.kind === 'changed' ? 'changed' : null
    const size = mark.kind === 'arrow' || mark.kind === 'flat' ? Math.abs(mark.pts) : null
    return { id: seat.id, name: seat.name, seat, mark, filter, size, detail: mark.kind === 'other' ? detailOf(seat, baseline?.get(seat.id)) : null }
  })
  return ranked(rows)
}

/** The lens's answer in a sentence. The counts are the stage caption's own (captionCounts), so the two always agree. */
export function swingSummary(rows: readonly SwingRow[], final = false): string {
  const marks = rows.map((r) => r.mark)
  const { ready, all } = captionCounts(marks)
  if (all === 0) return final ? 'No seat to compare.' : 'No seat ready to compare yet.'
  const lead = `${ready} of ${all} Labor v Coalition seats ${final ? 'compared' : 'ready'}`
  if (ready === 0) return `${lead}.`
  const signed = marks.flatMap((m) => (m.kind === 'arrow' || m.kind === 'flat' ? [m.pts] : []))
  const avg = signed.reduce((a, p) => a + p, 0) / ready
  const rounded = Math.abs(avg).toFixed(1)
  // VE-224: the average is over the seats it names; the seats where Labor fell furthest may have left the pairing.
  const these = `in these ${ready} ${ready === 1 ? 'seat' : 'seats'}`
  const average = rounded === '0.0' ? `no average swing ${these}` : `average swing ${these} ${rounded} points to ${avg > 0 ? 'Labor' : 'the Coalition'}`
  return `${lead}; ${average}.`
}

/** The movers in words: "Greens up 6.1 points and Labor down 4.0 points since 2022", then any party new to the seat. */
function moversWords(movers: readonly Mover[], since: string): string {
  const two = shownMovers(movers)
  const moved = two.filter((m) => !m.fresh).map((m) => `${PARTY_NAMES[m.party]} ${m.change >= 0 ? 'up' : 'down'} ${Math.abs(m.change).toFixed(1)} points`)
  const fresh = two.filter((m) => m.fresh).map((m) => `${PARTY_NAMES[m.party]} ${m.share.toFixed(1)}%, ${didNotStand(since)}`)
  return [moved.length ? `${moved.join(' and ')} since ${since}` : '', ...fresh].filter(Boolean).join('; ')
}

/** The pill's line for a seat with first-preference movers: "First preferences: Greens up 6.1 points and Labor down 4.0 points since 2022." */
export function moversSentence(movers: readonly Mover[], since: string): string {
  return `First preferences: ${moversWords(movers, since)}.`
}

/** How many rows each filter would show, over every row (not narrowed by search), so a chip says what it would show. */
export function swingCounts(rows: readonly SwingRow[]): Record<SwingFilter, number> {
  return {
    labor: rows.filter((r) => r.filter === 'labor').length,
    coalition: rows.filter((r) => r.filter === 'coalition').length,
    other: rows.filter((r) => r.filter === 'other').length,
    changed: rows.filter((r) => r.filter === 'changed').length,
  }
}

/** A filter and a name search, both optional; the ranking is kept. */
export function filterSwing(rows: readonly SwingRow[], filter: SwingFilter | null, query: string): SwingRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => (filter === null || r.filter === filter) && (q === '' || r.name.toLowerCase().includes(q)))
}

/** One plain sentence for a row's tooltip and screen readers. Two-candidate rows say what the stage says. */
export function rowSentence(r: SwingRow): string {
  const d = r.detail
  if (r.mark.kind !== 'other' || !d || !d.party) return markSentence(r.mark)
  const party = PARTY_NAMES[d.party]
  const counted = r.seat.pct === null ? 'Nothing counted' : `${r.seat.pct.toFixed(1)}% counted`
  const since = r.seat.baseNote || 'the last election'
  if (d.early) return `${r.name}: ${party} are in the top two. Too early to compare first preferences (${counted}).`
  if (d.movers.length > 0) {
    if (d.movers[0]!.fresh) return `${r.name}: first preferences ${moversWords(d.movers, since)}. ${counted}.`
    const say = shownMovers(d.movers).filter((m) => !m.fresh).map((m) => `${PARTY_NAMES[m.party]} ${m.change >= 0 ? 'up' : 'down'} ${Math.abs(m.change).toFixed(1)} points`)
    const fresh = shownMovers(d.movers).filter((m) => m.fresh).map((m) => `; ${PARTY_NAMES[m.party]} ${m.share.toFixed(1)}%, ${didNotStand(since)}`)
    return `${r.name}: since ${since}, first preferences changed most for ${say.join(' and ')}${fresh.join('')}. ${counted}.`
  }
  if (d.change !== null && d.share !== null) return `${r.name}: ${party} first preferences ${d.share.toFixed(1)}%, little changed since ${since}. ${counted}.`
  if (d.share !== null) return `${r.name}: ${party} first preferences ${d.share.toFixed(1)}% so far. No ${since} comparison for first preferences yet. ${counted}.`
  return markSentence(r.mark)
}
