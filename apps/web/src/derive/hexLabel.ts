import type { DistrictStatic, PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../parties'
import type { Colour } from '../state/view'
import { swingShown } from './colour'
import type { Seat } from './seats'

export interface HexLabelText {
  name: string
  /** The leader's party, for the colour dot; null when no one leads yet. */
  leader: PartyBucket | null
  lead: string
  extra: string | null
}

/**
 * The words on a hexagon's hover label (VE-107). Kept short: the screen reader text is `seatLabel`, this is the quick
 * visual one, and what it adds depends on the colour story on show.
 */
export function hexLabel(s: Seat, colour: Colour, st: DistrictStatic | undefined): HexLabelText {
  if (!s.leader) return { name: s.name, leader: null, lead: 'No figures yet', extra: colour === 'certainty' ? 'Nothing counted yet' : null }
  const lead = `${PARTY_NAMES[s.leader]} ${s.state === 'won' ? 'won' : s.state === 'firm' ? 'certain lead' : 'leading'}`
  const share = s.tcp ? `${PARTY_NAMES[s.tcp.a]} ${s.tcp.pctA.toFixed(1)}%` : null
  // FB-182: the hex prints a bare % counted, so the label says what it is on every colour (a declared seat prints none).
  const counted = s.pct !== null && s.state !== 'won' ? `${Math.round(s.pct)}% counted` : null
  let extra = [share, counted].filter(Boolean).join(', ') || null
  if (colour === 'certainty') extra = s.pct === null ? 'Nothing counted yet' : `${Math.round(s.pct)}% counted`
  else if (colour === 'trust') {
    const sw = swingShown(s, st)
    const r = sw === null ? 0 : Math.round(Math.abs(sw) * 10) / 10
    const swing = sw === null || r === 0 ? null : `swing ${r.toFixed(1)} ${sw > 0 ? 'to' : 'from'} Labor`
    extra = [share, swing, counted].filter(Boolean).join(', ') || null
  }
  return { name: s.name, leader: s.leader, lead, extra }
}

/**
 * How long a hover waits before its label shows (VE-120). A short delay stops the label flickering as the pointer
 * crosses the hexes on its way elsewhere. 150 to 300 ms is the usual tooltip band (UNVERIFIED: the figure follows common
 * tooltip guidance, not a single cited source).
 */
export const SHOW_DELAY_MS = 200
/** A label that went away this recently is followed by the next at once, so sweeping across neighbours feels live. */
export const GRACE_MS = 400

export function labelDelay({ keyboard, now, lastShownAt }: { keyboard: boolean; now: number; lastShownAt: number }): number {
  if (keyboard) return 0
  return now - lastShownAt < GRACE_MS ? 0 : SHOW_DELAY_MS
}
