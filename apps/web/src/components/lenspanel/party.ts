/**
 * The party-strength lens's panel (VE-101e): every seat ranked by the chosen party's 2025 federal share, highest first.
 * The same rows, sentences and ramp for every party, so the list reads alike whoever is chosen.
 */
import type { PartyBucket, PartySharesSeat, ShareParty } from '@vic26/schema'
import { useEffect, useMemo, useState } from 'react'
import { coverage, partyLabel } from '../../derive/oneNation'
import type { Statics } from '../../data/types'
import { PARTY_NAMES } from '../../parties'
import { flowSentence, type SeatFlow } from '../explore/one-nation/flow'
import { loadPartyAsset, useFinal, useFlow, useLive, useParty } from '../explore/one-nation/partyStore'

export interface PartyRow {
  id: number
  name: string
  /** The party's share of formal first preferences, per cent. 0 where it did not stand. */
  pct: number
  /** The fraction of the seat's area where the party stood (1 when the file lists no gap). */
  stood: number
  /** Stood in only part of the seat, or none of it: the share is only partly comparable. */
  partial: boolean
  notStanding: boolean
}
export type PartyFilter = 'partial'

export function partyRows(shares: readonly PartySharesSeat[], party: ShareParty, names: ReadonlyMap<number, string>): PartyRow[] {
  return shares
    .map((s): PartyRow => {
      const stood = s.stood_2025[party] ?? 1
      const c = coverage(stood)
      return { id: s.district_id, name: names.get(s.district_id) ?? String(s.district_id), pct: s.share_2025[party], stood, partial: c !== 'full', notStanding: c === 'none' }
    })
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
}

const f1 = (n: number) => n.toFixed(1)

/** One line for the top of the panel, the same words for every party. Seats where the party did not stand are not "strongest". */
export function partySummary(rows: readonly PartyRow[], party: ShareParty, final = false): string {
  // VE-270: once any seat is on tonight's count the line is about those seats (rows are LiveRow from the lens; mixing in 2025 seats would rank unlike figures).
  const isLive = (r: PartyRow) => (r as { live?: boolean }).live === true
  const onTonight = rows.some(isLive) || rows.some((r) => (r as { noFigures?: boolean }).noFigures === true)
  const top = rows.filter((r) => !r.notStanding && (!onTonight || isLive(r))).slice(0, 3)
  if (top.length === 0) return rows.some((r) => (r as { noFigures?: boolean }).noFigures === true) ? 'Counting has started. Seats appear here once 5% of each is counted.' : 'These figures are not available.'
  if (onTonight) return `Strongest for ${partyLabel(party)} ${final ? 'in the final count' : 'tonight'}: ${top.map((r) => `${r.name} ${f1(r.pct)}%`).join(', ')}.`
  return `Strongest seats for ${partyLabel(party)} at the 2025 federal election: ${top.map((r) => `${r.name} ${f1(r.pct)}%`).join(', ')}.`
}

/** The row's tooltip, the pill's sentence and what a screen reader hears. */
export function partySentence(r: PartyRow, party: ShareParty): string {
  const label = partyLabel(party)
  if (r.notStanding) return `${r.name}: ${label} did not stand here at the 2025 federal election.`
  const base = `${r.name}: ${label} ${f1(r.pct)}% of first preferences at the 2025 federal election.`
  return r.partial ? `${base} ${label} stood in about ${Math.round(r.stood * 100)}% of this seat's area, so the figure is only partly comparable.` : base
}

export function partyCounts(rows: readonly PartyRow[]): Record<PartyFilter, number> {
  return { partial: rows.filter((r) => r.partial).length }
}

export function filterParty(rows: readonly PartyRow[], filter: PartyFilter | null, query: string): PartyRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => (filter === null || r.partial) && (q === '' || r.name.toLowerCase().includes(q)))
}

/** The summary line for the chosen party, for the phone Seats sheet handle (it sits outside PartyPanel). Empty until the asset loads, and while `enabled` is false so other lenses never load it. */
export function usePartySummary(statics: Statics | null, enabled: boolean): string {
  const party = useParty()
  const flow = useFlow()
  const live = useLive()
  const final = useFinal()
  const [shares, setShares] = useState<readonly PartySharesSeat[] | null>(null)
  useEffect(() => {
    if (!enabled || !statics) return
    let alive = true
    loadPartyAsset(new Set(statics.districtById.keys())).then((a) => alive && setShares(a?.party_shares ?? null))
    return () => {
      alive = false
    }
  }, [enabled, statics])
  return useMemo(() => {
    if (!enabled || !statics) return ''
    const names = new Map([...statics.districtById].map(([id, d]) => [id, d.short_name] as const))
    // The lens's Other votes view is open: the handle says what the panel ranks.
    if (flow) return flowPanelSummary(flowPanelRows(flow, names))
    // The lens publishes the rows its map shows (tonight's count where counted), so the handle agrees with it.
    if (live) return partySummary(live, party, final)
    if (!shares) return ''
    return partySummary(partyRows(shares, party, names), party)
  }, [enabled, statics, shares, party, flow, live, final])
}

// ---- the "Other votes" view's panel (VE-101g) ----

/** One seat in the other-votes ranking: which of the top two got more of the other candidates' votes, and how much. */
export interface FlowPanelRow {
  id: number
  name: string
  lead: PartyBucket
  other: PartyBucket
  /** The larger side of the split, per cent (50 to 100). */
  leadPct: number
  /** The seat's sentence, the same one the lens speaks. */
  words: string
}

/** Ranked by how one-sided the split is, whichever party is on the larger side, so no party's seats are favoured. */
export function flowPanelRows(rows: readonly SeatFlow[], names: ReadonlyMap<number, string>): FlowPanelRow[] {
  return rows
    .map((r): FlowPanelRow => {
      const aLeads = r.shareA >= 50
      const name = names.get(r.id) ?? String(r.id)
      return { id: r.id, name, lead: aLeads ? r.a : r.b, other: aLeads ? r.b : r.a, leadPct: aLeads ? r.shareA : 100 - r.shareA, words: flowSentence(r, name) }
    })
    .sort((x, y) => y.leadPct - x.leadPct || x.name.localeCompare(y.name))
}

export function flowPanelSummary(rows: readonly FlowPanelRow[]): string {
  if (rows.length === 0) return 'These figures are not available.'
  const top = rows.slice(0, 3).map((r) => `${r.name} ${Math.round(r.leadPct)}% to ${PARTY_NAMES[r.lead]}`).join(', ')
  return `Where the votes of other candidates went, in ${rows.length} seats counted so far. Most one-sided: ${top}.`
}
