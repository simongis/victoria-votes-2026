import { useEffect, useMemo, useState } from 'react'
import type { OneNationAsset } from '@vic26/schema'
import { PARTY_OPTIONS, partyRgb, rampMax } from '../../derive/oneNation'
import type { Statics } from '../../data/types'
import { PARTY_NAMES } from '../../parties'
import { css, usePalette, type Palette, type Rgb } from '../../theme/theme'
import { loadPartyAsset, useFlow, useParty } from '../explore/one-nation/partyStore'
import { LensPanel, type LensFilterChip, type LensRowView } from './LensPanel'
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
      {!row.notStanding && <rect data-testid="party-mark" x={PAD} y={MARK_H / 2 - 3} width={Math.max(w, 2)} height="6" rx="3" fill={css(partyRgb(row.pct, base, max))} stroke={css(pal.edge)} strokeWidth="0.5" />}
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
  const option = PARTY_OPTIONS.find((o) => o.id === party)!
  const base = pal.party[option.bucket]
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
  const rows = useMemo(() => (asset && asset !== 'failed' ? partyRows(asset.party_shares ?? [], party, names) : []), [asset, party, names])
  const max = useMemo(() => rampMax(rows.filter((r) => !r.notStanding).map((r) => r.pct)), [rows])
  const counts = useMemo(() => partyCounts(rows), [rows])
  const shown = useMemo(() => filterParty(rows, filter, query), [rows, filter, query])
  const chips: LensFilterChip[] = FILTERS.map((f) => ({ ...f, count: counts[f.key] }))
  const views: LensRowView[] = useMemo(
    () => shown.map((r) => ({ id: r.id, name: r.name, colour: css(partyRgb(r.pct, base, max)), mark: <PartyMark row={r} base={base} max={max} pal={pal} />, value: r.notStanding ? '-' : `${r.pct.toFixed(1)}%${r.partial ? ' (part)' : ''}`, words: partySentence(r, party) })),
    [shown, base, max, pal, party],
  )
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
  if (asset === 'failed') return <p className="lenspanel__summary" role="status" data-testid="lens-summary">These figures are not available.</p>
  return (
    <LensPanel
      summary={asset ? partySummary(rows, party) : 'Loading...'}
      unit="Share of first preferences, 2025 federal election"
      filters={chips}
      filter={filter}
      onFilter={(k) => setFilter(k as PartyFilter | null)}
      query={query}
      onQuery={setQuery}
      rows={views}
    />
  )
}
