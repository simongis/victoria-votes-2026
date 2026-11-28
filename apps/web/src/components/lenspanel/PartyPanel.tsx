import { useEffect, useMemo, useState } from 'react'
import type { OneNationAsset } from '@vic26/schema'
import { PARTY_OPTIONS, partyBase, partyRgb, rampMax } from '../../derive/oneNation'
import type { Statics } from '../../data/types'
import { PARTY_NAMES } from '../../parties'
import { css, usePalette, type Palette, type Rgb } from '../../theme/theme'
import { liveSentence } from '../explore/one-nation/live'
import { loadPartyAsset, useFinal, useFlow, useLive, useParty } from '../explore/one-nation/partyStore'
import { useSeatPickStore } from '../explore/one-nation/seatStore'
import { SeatFactsPanel } from './SeatFactsPanel'
import { LensPanel, type LensFilterChip, type LensRowView } from './LensPanel'
import type { LiveRow } from '../explore/one-nation/live'
import { filterParty, flowPanelRows, flowPanelSummary, partyCounts, partyRows, partySentence, partySummary, type FlowPanelRow, type PartyFilter, type PartyRow } from './party'

const FILTERS: { key: PartyFilter; label: string; title: string }[] = [
  { key: 'partial', label: 'Stood in part', title: 'Seats where the party stood in only part of the area, so the share is only partly comparable' },
]

const MARK_W = 58
const MARK_H = 16
const PAD = 5

/** A bar from 0 to the top of this party's scale, the same scale as the lens's key. Dashed outline when the party stood in only part of the seat. */
function PartyMark({ row, base, max, pal }: { row: PartyRow; base: Rgb; max: number; pal: Palette }) {
  const w = (MARK_W - 2 * PAD) * Math.min(1, row.pct / max)
  return (
    <svg width={MARK_W} height={MARK_H} viewBox={`0 0 ${MARK_W} ${MARK_H}`} focusable="false">
      <rect x={PAD} y={MARK_H / 2 - 3} width={MARK_W - 2 * PAD} height="6" rx="3" fill="none" stroke="var(--color-border)" strokeDasharray={row.partial ? '2 2' : undefined} />
      {!row.notStanding && !(row as { noFigures?: boolean }).noFigures && <rect data-testid="party-mark" x={PAD} y={MARK_H / 2 - 3} width={Math.max(w, 2)} height="6" rx="3" fill={css(partyRgb(row.pct, base, max))} stroke={css(pal.edge)} strokeWidth="0.5" />}
    </svg>
  )
}

/** The other-votes view's mark: the whole bar split between the top two, the larger side in its party's colour. */
function SplitMark({ row, pal }: { row: FlowPanelRow; pal: Palette }) {
  const w = MARK_W - 2 * PAD
  const lead = (w * row.leadPct) / 100
  return (
    <svg width={MARK_W} height={MARK_H} viewBox={`0 0 ${MARK_W} ${MARK_H}`} focusable="false">
      <rect x={PAD} y={MARK_H / 2 - 3} width={w} height="6" rx="3" fill={css(pal.party[row.other])} />
      <rect data-testid="split-mark" x={PAD} y={MARK_H / 2 - 3} width={lead} height="6" rx="3" fill={css(pal.party[row.lead])} />
    </svg>
  )
}

/**
 * The party-strength lens's panel (VE-101e): seats ranked by the chosen party's 2025 federal share, highest first. The party
 * is the one the lens has chosen (shared through partyStore), so the list follows the toggle. Rows and words are in party.ts.
 * It loads the same validated asset as the lens and shows one plain line if that fails. While the lens is on its Other votes
 * view (it publishes the split through partyStore) the panel follows: seats ranked by how one-sided the split is.
 */
export function PartyPanel({ statics }: { statics: Statics }) {
  const pal = usePalette()
  const party = useParty()
  const flow = useFlow()
  const live = useLive()
  const final = useFinal()
  const option = PARTY_OPTIONS.find((o) => o.id === party)!
  const base = partyBase(option, pal)
  const [asset, setAsset] = useState<OneNationAsset | 'failed' | null>(null)
  const [filter, setFilter] = useState<PartyFilter | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    loadPartyAsset(new Set(statics.districtById.keys())).then((a) => alive && setAsset(a ?? 'failed'))
    return () => {
      alive = false
    }
  }, [statics])

  const names = useMemo(() => new Map([...statics.districtById].map(([id, d]) => [id, d.short_name] as const)), [statics])
  // The rows the lens's map shows, when it has published them; otherwise the 2025 ranking (VE-270).
  const rows = useMemo(() => (live ?? (asset && asset !== 'failed' ? partyRows(asset.party_shares ?? [], party, names) : [])), [live, asset, party, names])
  const onTonight = rows.some((r) => (r as { live?: boolean; noFigures?: boolean }).live === true || (r as { noFigures?: boolean }).noFigures === true)
  const max = useMemo(() => rampMax(rows.filter((r) => !r.notStanding && !(r as { noFigures?: boolean }).noFigures).map((r) => r.pct)), [rows])
  const counts = useMemo(() => partyCounts(rows), [rows])
  // VE-296: the caveat is only true while some seat is under the gate; at Final none is.
  const noneYet = rows.some((r) => (r as { noFigures?: boolean }).noFigures === true)
  const shown = useMemo(() => filterParty(rows, filter, query), [rows, filter, query])
  const chips: LensFilterChip[] = FILTERS.map((f) => ({ ...f, count: counts[f.key] })).filter((c) => !(c.key === 'partial' && c.count === 0))
  const views: LensRowView[] = useMemo(
    () => shown.map((r) => ({ id: r.id, name: r.name, colour: css(partyRgb(r.pct, base, max)), mark: <PartyMark row={r} base={base} max={max} pal={pal} />, value: r.notStanding || (r as { noFigures?: boolean }).noFigures ? '-' : `${r.pct.toFixed(1)}%${r.partial ? ' (part)' : ''}`, words: 'live' in r ? liveSentence(r as LiveRow, party, final) : partySentence(r, party) })),
    [shown, base, max, pal, party, final],
  )
  // VE-282: a seat picked on the lens (not on the Other votes view) opens its facts here, in place of the ranking.
  const seatPick = useSeatPickStore()
  const federal = useMemo(() => new Map(partyRows(asset && asset !== 'failed' ? asset.party_shares ?? [] : [], party, names).map((r) => [r.id, { ...r, live: false, noFigures: false } as LiveRow] as const)), [asset, party, names])
  const liveById = useMemo(() => new Map(rows.map((r) => [r.id, ('live' in r ? r : { ...r, live: false, noFigures: false }) as LiveRow] as const)), [rows])
  const flowRows = useMemo(() => (flow ? flowPanelRows(flow, names) : null), [flow, names])
  const flowViews: LensRowView[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (flowRows ?? [])
      .filter((r) => q === '' || r.name.toLowerCase().includes(q))
      .map((r) => ({ id: r.id, name: r.name, colour: css(pal.party[r.lead]), mark: <SplitMark row={r} pal={pal} />, value: `${Math.round(r.leadPct)}% ${r.lead === 'NAT' ? 'Nats' : PARTY_NAMES[r.lead]}`, words: r.words }))
  }, [flowRows, query, pal])
  if (flowRows) {
    return (
      <LensPanel
        summary={flowPanelSummary(flowRows)}
        unit="Share of the other candidates' votes going to the top two"
        filters={[]}
        filter={null}
        onFilter={() => undefined}
        query={query}
        onQuery={setQuery}
        rows={flowViews}
      />
    )
  }
  if (!flow && seatPick.id !== null && asset && asset !== 'failed' && federal.has(seatPick.id)) {
    return <SeatFactsPanel statics={statics} party={party} pick={{ ...seatPick, id: seatPick.id }} asset={asset} federal={federal} live={liveById} names={names} base={base} max={max} pal={pal} />
  }
  if (asset === 'failed') return <p className="lenspanel__summary" role="status" data-testid="lens-summary">These figures are not available.</p>
  return (
    <LensPanel
      summary={asset ? partySummary(rows, party, final) : 'Loading...'}
      unit={onTonight ? `Share of first preferences, ${final ? 'final' : "tonight's"} count${noneYet ? ' (seats under 5% counted: no figures yet)' : ''}` : 'Share of first preferences, 2025 federal election'}
      filters={chips}
      filter={filter}
      onFilter={(k) => setFilter(k as PartyFilter | null)}
      query={query}
      onQuery={setQuery}
      rows={views}
    />
  )
}
