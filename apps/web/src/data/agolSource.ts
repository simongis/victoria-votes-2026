/**
 * AGOL results source: the public view vic26election_view (ADR 0004), read-only and anonymous, queried by the
 * schema's layer ids over plain REST so no ArcGIS module loads for data. Today the view holds only the static
 * layers, so statics() and status() are what matter; timeline() degrades to empty when district_history has
 * nothing (or is missing), which the shell shows as "no figures yet".
 */
import {
  LAYERS,
  type CandidateAttributes,
  type DistrictHistoryRow,
  type DistrictStatic,
  type StatusAttributes,
} from '@vic26/schema'
import { createAgolBoothSource, timestampLiteral } from './boothSource'
import { parsePointer, pointerIsStale } from './latestPointer'
import { fetchJsonOverHttp, type FetchJson } from './replaySource'
import { enrolmentByDistrict, statewidePct } from '../derive/enrolment'
import { withDistrictWinners } from '../derive/winners'
import type { ResultsSource } from './source'
import type { GeoCollection, SeatHexStatic, Statics, Tick, Timeline } from './types'

/** ADR 0004: the dev view, the default for dev builds. A public build must set VITE_AGOL_VIEW_URL to the live view and the build refuses this one (ADR 0030, productionView.ts). */
export const DEFAULT_VIEW_URL =
  'https://services1.arcgis.com/EUWoecQOUKE3INkz/arcgis/rest/services/vic26election_view/FeatureServer'

interface QueryJson<A> {
  features?: { attributes: A }[]
  exceededTransferLimit?: boolean
  error?: { code: number; message: string }
}

const PAGE = 2000
/** With a pointer, still read the AGOL status row this often: the operator can edit it (ADR 0009) without the pointer changing. */
export const CROSS_CHECK_MS = 5 * 60_000

export interface AgolOptions {
  url?: string
  fetchJson?: FetchJson
  pollMs?: number
  /** The static latest.json pointer (ADR 0016). Empty or absent: poll the AGOL status row alone. */
  latestUrl?: string
  now?: () => number
}

export function createAgolSource({
  url = DEFAULT_VIEW_URL,
  fetchJson = fetchJsonOverHttp,
  pollMs = 30_000,
  latestUrl = '',
  now = Date.now,
}: AgolOptions = {}): ResultsSource {
  const query = (layer: number, params: Record<string, string>) =>
    `${url}/${layer}/query?${new URLSearchParams({ where: '1=1', outFields: '*', ...params })}`

  async function rows<A>(layer: number, params: Record<string, string>): Promise<A[]> {
    const out: A[] = []
    for (let offset = 0; ; offset += PAGE) {
      const res = await fetchJson<QueryJson<A>>(
        query(layer, { f: 'json', returnGeometry: 'false', resultOffset: String(offset), resultRecordCount: String(PAGE), ...params }),
      )
      if (res.error) throw new Error(`layer ${layer}: ${res.error.message}`)
      out.push(...(res.features ?? []).map((f) => f.attributes))
      if (!res.exceededTransferLimit) return out
    }
  }

  const geojson = async <P,>(layer: number): Promise<GeoCollection<P>> => {
    const res = await fetchJson<GeoCollection<P> & { error?: { message: string } }>(query(layer, { f: 'geojson', outSR: '4326' }))
    if (res.error) throw new Error(`layer ${layer}: ${res.error.message}`)
    return res
  }

  let staticsP: Promise<Statics> | null = null
  let lastRow: StatusAttributes | null = null
  let lastRowAt = 0
  let fellBack = false

  // Null when the table has no row: the live view holds statics only until ingest's first live publish, so an empty
  // table is the expected state before results, not a fault (VE-233). The caller decides what an empty read means.
  async function agolStatus(): Promise<StatusAttributes | null> {
    const [row] = await rows<StatusAttributes>(LAYERS.status.id, {})
    if (!row) return null
    lastRow = row
    lastRowAt = now()
    return row
  }

  /** The pointer is only a cheap "anything new?" check; the full status row still comes from AGOL. */
  async function pointerSaysUnchanged(): Promise<boolean> {
    try {
      const p = parsePointer(await fetchJson<unknown>(latestUrl))
      if (!p || pointerIsStale(p, now())) {
        fellBack = true
        return false
      }
      fellBack = false
      return lastRow !== null && lastRow.snapshot_id === p.snapshotId && lastRow.state === p.state && now() - lastRowAt < CROSS_CHECK_MS
    } catch {
      fellBack = true
      return false
    }
  }

  return {
    kind: 'agol',
    pollMs,
    note: null,
    // The same ceiling as the timeline's: booth history is read only up to the status row (VE-163).
    booths: createAgolBoothSource({ url, fetchJson, confirmedAt: async () => (lastRow ?? (await agolStatus()))?.snapshot_at ?? null }),

    statics() {
      staticsP ??= Promise.all([
        geojson<DistrictStatic>(LAYERS.districts.id),
        geojson<SeatHexStatic>(LAYERS.seat_hexes.id),
      ]).then(([districts, seatHexes]) => ({
        districts,
        seatHexes,
        districtById: new Map(districts.features.map((f) => [f.properties.district_id, f.properties])),
      }))
      staticsP.catch(() => (staticsP = null))
      return staticsP
    },

    fallback: () => fellBack,

    async status() {
      if (latestUrl && (await pointerSaysUnchanged())) return lastRow!
      return agolStatus()
    },

    async timeline(): Promise<Timeline> {
      // Timeline, Rewind and the sparkline all read this one bounded set. History is written before the status row
      // (hard rule 5), so after a part-failed publish the layer holds rows for a snapshot status has not confirmed: read
      // only up to the status row's snapshot_at, and drop anything beyond it that comes back anyway (VE-163).
      let all: DistrictHistoryRow[]
      try {
        const confirmed = (lastRow ?? (await agolStatus()))?.snapshot_at
        if (confirmed === null || confirmed === undefined) return { ticks: [], rows: [] }
        const upTo = `snapshot_at <= ${timestampLiteral(Math.ceil(confirmed / 1000) * 1000)}`
        all = (await rows<DistrictHistoryRow>(LAYERS.district_history.id, { where: upTo, orderByFields: 'snapshot_at' })).filter(
          (r) => r.snapshot_at <= confirmed,
        )
      } catch {
        return { ticks: [], rows: [] }
      }
      const statics = await this.statics()
      // VE-247: the layer's static enrolment is the 2022 baseline, so the statewide figure uses each seat's 2026 enrolment
      // worked back from its own pct_counted (votes-weighted), and the newest tick takes the status row's votes_counted_pct
      // itself when it is for the same snapshot, so the headline cannot differ from what ingest published.
      const enrolment = enrolmentByDistrict(all, statics.districtById.values())
      const bySnapshot = new Map<string, DistrictHistoryRow[]>()
      for (const r of all) {
        const list = bySnapshot.get(r.snapshot_id)
        if (list) list.push(r)
        else bySnapshot.set(r.snapshot_id, [r])
      }
      const groups = [...bySnapshot.values()].sort((a, b) => a[0]!.snapshot_at - b[0]!.snapshot_at)
      // ADR 0036: the live view's history has no elected_party, so the current tick takes the winners from the districts
      // layer (which does). Best effort: a failed read leaves the history rows as they are (the 2CP fallback applies).
      if (groups.length > 0) {
        try {
          const now = await rows<{ district_id: number; elected_party: DistrictHistoryRow['elected_party'] }>(LAYERS.districts.id, {
            outFields: 'district_id,elected_party',
          })
          groups[groups.length - 1] = withDistrictWinners(groups[groups.length - 1]!, now)
        } catch {
          /* keep the history rows */
        }
      }
      const status = lastRow
      const ticks: Tick[] = groups.map((g) => ({
        snapshotId: g[0]!.snapshot_id,
        snapshotAt: g[0]!.snapshot_at,
        countedPct:
          status && status.snapshot_id === g[0]!.snapshot_id && typeof status.votes_counted_pct === 'number'
            ? status.votes_counted_pct
            : statewidePct(g, enrolment),
        synthetic: false,
      }))
      return { ticks, rows: groups, enrolment }
    },

    async candidates(snapshotId: string, districtId: number) {
      // The candidates layer holds the current snapshot only, so a past tick gets nothing rather than today's figures.
      try {
        const list = await rows<CandidateAttributes>(LAYERS.candidates.id, { where: `district_id=${Math.trunc(districtId)}` })
        return list.every((c) => c.snapshot_id === snapshotId) ? list : null
      } catch {
        return null
      }
    },
  }
}
