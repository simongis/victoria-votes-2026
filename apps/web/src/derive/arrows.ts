/**
 * Swing arrows (FB-109, FB-110): what each seat gets, and the plain geometry and words. Pure, so it is tested without a
 * browser. The rules are Simon's: an arrow only where the top two are Labor and the Coalition (now and at the
 * baseline), only past the swing threshold (swingShown), toward Labor or toward the Coalition, never left or right.
 */
import type { DistrictStatic, PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../parties'
import { SWING_EDGE, SWING_MIN_PCT, belowSwingMin, swingShown } from './colour'
import type { Seat } from './seats'

export type Mark =
  | { kind: 'arrow'; seat: Seat; toward: 'ALP' | 'COA'; pts: number }
  /** Labor v Coalition, counted enough, but the swing is within SWING_EDGE of nil: a short level bar, not an arrow. */
  | { kind: 'flat'; seat: Seat; pts: number }
  /** Labor v Coalition but under the swing threshold: a ring. */
  | { kind: 'early'; seat: Seat }
  /** Another pairing, or no comparable baseline pairing: a dot. */
  | { kind: 'other'; seat: Seat }
  /** No two-candidate figure yet: nothing drawn. */
  | { kind: 'notin'; seat: Seat }

const isCoalition = (p: PartyBucket | null): boolean => p === 'LIB' || p === 'NAT'
/** The caller has already checked that both candidates are known. */
const isLaborVCoalition = (s: Seat & { tcp: { b: PartyBucket } }): boolean =>
  (s.tcp.a === 'ALP' && isCoalition(s.tcp.b)) || (s.tcp.b === 'ALP' && isCoalition(s.tcp.a))

export function classifySeat(seat: Seat, st: DistrictStatic | undefined): Mark {
  if (seat.tcp === null || seat.tcp.b === null) return { kind: 'notin', seat }
  if (!isLaborVCoalition(seat as Seat & { tcp: { b: PartyBucket } })) return { kind: 'other', seat }
  if (belowSwingMin(seat.pct)) return { kind: 'early', seat }
  const pts = swingShown(seat, st) // positive is toward Labor; null when the baseline pair differed
  if (pts === null) return { kind: 'other', seat }
  // A zero swing has no direction: a Labor arrow would be a claim the data does not make.
  if (Math.abs(pts) < SWING_EDGE) return { kind: 'flat', seat, pts }
  return { kind: 'arrow', seat, toward: pts >= 0 ? 'ALP' : 'COA', pts }
}

/** Longer swings stop growing, so one odd seat cannot cross the map. */
export const MAX_PTS = 10
const MIN_LEN = 4
/** Pixel length of an arrow for a swing, at `ppp` pixels per point. */
export const arrowLength = (pts: number, ppp: number): number => Math.max(MIN_LEN, Math.min(Math.abs(pts), MAX_PTS) * ppp)

export const ARROW_ANGLE = (30 * Math.PI) / 180

export interface ArrowGeometry {
  /** The shaft runs from the origin to here (the base of the head). */
  base: [number, number]
  tip: [number, number]
  /** Triangle points: the tip and the two back corners. */
  head: [[number, number], [number, number], [number, number]]
}

/** An arrow in pixels with its tail at the origin. `dir` is -1 toward Labor (left), 1 toward the Coalition (right); `angled` tilts it up 30 degrees. */
export function arrowGeometry(len: number, dir: 1 | -1, angled: boolean): ArrowGeometry {
  const dx = dir * Math.cos(angled ? ARROW_ANGLE : 0)
  const dy = angled ? -Math.sin(ARROW_ANGLE) : 0
  const tip: [number, number] = [dx * len, dy * len]
  const hs = Math.min(7, Math.max(4, len * 0.45))
  const px = -dy
  const py = dx
  const base: [number, number] = [tip[0] - dx * hs, tip[1] - dy * hs]
  return { base, tip, head: [tip, [base[0] + px * hs * 0.55, base[1] + py * hs * 0.55], [base[0] - px * hs * 0.55, base[1] - py * hs * 0.55]] }
}

/** The arrows only, most toward Labor first. */
export function rankedArrows(marks: Iterable<Mark>): Extract<Mark, { kind: 'arrow' }>[] {
  return [...marks].filter((m): m is Extract<Mark, { kind: 'arrow' }> => m.kind === 'arrow').sort((a, b) => b.pts - a.pts)
}

/** Labor v Coalition seats ready to compare (an arrow or a level bar) and all of them (including those still too early). */
export function captionCounts(marks: Iterable<Mark>): { ready: number; all: number } {
  let ready = 0
  let early = 0
  for (const m of marks) {
    if (m.kind === 'arrow' || m.kind === 'flat') ready++
    else if (m.kind === 'early') early++
  }
  return { ready, all: ready + early }
}

export function captionOf(marks: Iterable<Mark>, final = false): string {
  const { ready, all } = captionCounts(marks)
  // VE-167: nothing is "ready" once the count is over.
  if (final) return all === 0 ? 'No seat to compare' : `${ready} of ${all} seats compared`
  return all === 0 ? 'No seat ready to compare yet' : `${ready} of ${all} seats ready to compare`
}

const pairWords = (seat: Seat): string => (seat.tcp && seat.tcp.b ? `${PARTY_NAMES[seat.tcp.a]} v ${PARTY_NAMES[seat.tcp.b]}` : 'no two-candidate count yet')

/** One plain sentence for a seat's tooltip: its name, the two parties, the swing, the share counted. */
export function markSentence(m: Mark): string {
  const counted = m.seat.pct === null ? 'nothing counted' : `${m.seat.pct.toFixed(1)}% counted`
  const since = m.seat.baseNote ? `since ${m.seat.baseNote}` : 'since the last election'
  switch (m.kind) {
    case 'arrow':
      return `${m.seat.name}: ${pairWords(m.seat)}. ${Math.abs(m.pts).toFixed(1)} points ${m.toward === 'ALP' ? 'toward Labor' : 'toward the Coalition'} ${since}. ${counted}.`
    case 'flat':
      return `${m.seat.name}: ${pairWords(m.seat)}. Little change: ${Math.abs(m.pts).toFixed(1)} points ${since}. ${counted}.`
    case 'early':
      return `${m.seat.name}: ${pairWords(m.seat)}. ${counted}; the swing shows from ${SWING_MIN_PCT}%.`
    case 'other':
      return `${m.seat.name}: ${pairWords(m.seat)}. No arrow: not a Labor v Coalition seat, or the pair was different last time. ${counted}.`
    case 'notin':
      return `${m.seat.name}: no two-candidate count yet. ${counted}.`
  }
}
