/**
 * VE-274: the swing view's seat readout as data, so the pill can use colour and layout instead of a paragraph. One row per
 * party (first-preference change since the last election), the two-candidate swing when there is one, and the share counted.
 * Pure, so the signs, "new" and the bar sizes are tested without a browser.
 */
import type { PartyBucket } from '@vic26/schema'
import type { Mark } from '../../../derive/arrows'
import { SWING_MIN_PCT, belowSwingMin } from '../../../derive/colour'
import { PARTY_NAMES } from '../../../parties'
import { fpChangeItems } from '../../swing/fpChange'
import { biggestMover, fpMovers } from '../../lenspanel/swing'

/** Points of change that fill a bar; bigger moves are clamped so one odd seat cannot swamp the rest. */
export const BAR_MAX = 15

export interface ReadoutRow {
  party: PartyBucket | null
  name: string
  /** Signed text for the change ("+5.2"), or "new 21.2%" for a party that did not stand last time. */
  text: string
  /** Signed bar length, -1 to 1 (down to up); 0 for a new party, which has a share but no change. */
  bar: number
  fresh: boolean
  /** The row the map's triangle stands for (the biggest real mover, in a seat that is not Labor v Coalition). */
  mover: boolean
}

export interface Readout {
  name: string
  pair: string | null
  since: string
  rows: ReadoutRow[]
  swing: { toward: 'ALP' | 'COA'; words: string; pts: string } | null
  note: string | null
  counted: string
}

const signed1 = (n: number): string => `${n < 0 ? '-' : '+'}${(Math.round(Math.abs(n) * 10) / 10).toFixed(1)}`

export function buildReadout(m: Mark, base: Partial<Record<PartyBucket, number>> | undefined): Readout {
  const s = m.seat
  const moverParty = m.kind === 'other' ? biggestMover(fpMovers(s, base))?.party : undefined
  const rows = fpChangeItems(s, base).map((i): ReadoutRow => {
    const change = i.change ?? 0
    return {
      party: i.party,
      name: i.party ? PARTY_NAMES[i.party] : 'Others',
      text: i.fresh ? `new ${i.share.toFixed(1)}%` : signed1(change),
      bar: i.fresh ? 0 : Math.max(-1, Math.min(1, change / BAR_MAX)),
      fresh: i.fresh,
      mover: i.party !== null && i.party === moverParty && !i.fresh,
    }
  })
  const pair = s.tcp && s.tcp.b ? `${PARTY_NAMES[s.tcp.a]} v ${PARTY_NAMES[s.tcp.b]}` : null
  const swing = m.kind === 'arrow' ? { toward: m.toward, words: m.toward === 'ALP' ? 'toward Labor' : 'toward the Coalition', pts: Math.abs(m.pts).toFixed(1) } : null
  const note = m.kind === 'early' || (m.kind === 'other' && belowSwingMin(s.pct)) ? `Too early: shows from ${SWING_MIN_PCT}%` : m.kind === 'flat' ? 'Little swing' : m.kind === 'changed' ? 'Different contest from 2022' : m.kind === 'notin' ? 'No two-candidate count yet' : null
  return {
    name: s.name,
    pair,
    since: s.baseNote || 'the last election',
    rows,
    swing,
    note,
    counted: s.pct === null ? 'nothing counted' : `${s.pct.toFixed(1)}% counted`,
  }
}
