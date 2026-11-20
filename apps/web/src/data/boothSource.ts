/**
 * Booth data behind one interface (VE-136): the polling place statics and each booth's first-preference history.
 * The replay reads the two files ingest's replay writes; AGOL reads the booths and booth_history layers of the public
 * view. Both hand back the shapes the booth parsers already take (a GeoJSON-like statics file and a columns file), so the
 * dots and the Other votes view do not care which source they have. Read-only, and lazy: nothing is requested until a
 * view asks (ADR 0020).
 */
import { LAYERS, PARTY_BUCKETS } from '@vic26/schema'
import type { FetchJson } from './replaySource'

export interface BoothStaticFeature {
  properties: { booth_id?: number; booth_name?: string; district_id?: number; booth_type?: string; base_match?: string; base_tcp_party_a?: string | null; base_tcp_party_b?: string | null; base_tcp_pct_a?: number | null }
  geometry: { type: 'Point'; coordinates: [number, number] } | null
}
export interface BoothStaticsFile {
  features: BoothStaticFeature[]
}
export interface BoothColumns {
  fields: string[]
  rows: unknown[][]
}

export interface BoothSource {
  /** True when history can be read as "rows after a time" (the live layer grows all night); false when one read holds it all. */
  readonly incremental: boolean
  /** Cheap check that the source has booths at all, so the chip is left out (no error) where it has none. Never throws. */
  available(): Promise<boolean>
  statics(): Promise<BoothStaticsFile>
  /** History rows with snapshot_at after `since` (epoch ms, exclusive), or all of them when `since` is null; the live source never goes beyond the confirmed snapshot. */
  history(since: number | null): Promise<BoothColumns>
}

/** How long a booth request may take before the view says it failed. */
export const FETCH_TIMEOUT_MS = 15_000

/** Fetch JSON, aborting after `ms` so a hung request ends in an error rather than "Loading" for ever. */
export async function fetchJsonTimed<T>(url: string, ms: number = FETCH_TIMEOUT_MS, fetchFn: typeof fetch = fetch): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetchFn(url, { signal: ctl.signal })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export function createReplayBoothSource(base: string, fetchJson: FetchJson = (u) => fetchJsonTimed(u)): BoothSource {
  return {
    incremental: false,
    available: async () => true,
    statics: () => fetchJson<BoothStaticsFile>(`${base}static/booths.geojson`),
    history: () => fetchJson<BoothColumns>(`${base}history/booth_history.columns.json`),
  }
}

// ---- AGOL ----

const PAGE = 2000
/**
 * Only what the dots, the Other votes view and the polling place panel read (VE-208). The base_* fields are the panel's
 * swing since the last election; fp_total is its votes counted and informal. All are on the existing booths and
 * booth_history layers (packages/schema), so this is a wider outFields, not a schema change. snapshot_id and the rest stay on the service.
 */
const STATIC_FIELDS = ['booth_id', 'booth_name', 'district_id', 'booth_type', 'base_match', 'base_tcp_party_a', 'base_tcp_party_b', 'base_tcp_pct_a']
const HISTORY_FIELDS = ['snapshot_at', 'booth_id', 'district_id', ...PARTY_BUCKETS.map((p) => `fp_${p}`), 'fp_total', 'tcp_party_a', 'tcp_pct_a']

interface QueryJson<F> {
  features?: F[]
  count?: number
  exceededTransferLimit?: boolean
  error?: { code: number; message: string }
}
interface EsriFeature<A> {
  attributes: A
  geometry?: { x?: number; y?: number } | null
}

/** A hosted service accepts a UTC SQL timestamp literal in a date comparison. UNVERIFIED against the live service: the fixtures only prove the string. */
export function timestampLiteral(ms: number): string {
  return `TIMESTAMP '${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}'`
}

export interface AgolBoothOptions {
  url: string
  fetchJson: FetchJson
  /**
   * The status row's snapshot_at, or null while none is confirmed. Required, not optional: history is written before
   * status (hard rule 5), so a part-failed publish leaves rows the status row has not confirmed, and they must not be read (VE-163).
   */
  confirmedAt: () => number | null | Promise<number | null>
  timeoutMs?: number
}

export function createAgolBoothSource({ url, fetchJson, confirmedAt, timeoutMs = FETCH_TIMEOUT_MS }: AgolBoothOptions): BoothSource {
  // The injected fetch has no deadline of its own, so each request is raced against one.
  const get = <T,>(layer: number, params: Record<string, string>): Promise<T> => {
    const q = `${url}/${layer}/query?${new URLSearchParams({ where: '1=1', f: 'json', ...params })}`
    let timer: ReturnType<typeof setTimeout>
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`layer ${layer}: timed out`)), timeoutMs)
    })
    return Promise.race([fetchJson<T>(q), deadline]).finally(() => clearTimeout(timer))
  }

  async function pages<A>(layer: number, params: Record<string, string>): Promise<EsriFeature<A>[]> {
    const out: EsriFeature<A>[] = []
    for (let offset = 0; ; offset += PAGE) {
      const res = await get<QueryJson<EsriFeature<A>>>(layer, { ...params, resultOffset: String(offset), resultRecordCount: String(PAGE) })
      if (res.error) throw new Error(`layer ${layer}: ${res.error.message}`)
      out.push(...(res.features ?? []))
      if (!res.exceededTransferLimit) return out
    }
  }

  return {
    incremental: true,

    async available() {
      try {
        const res = await get<QueryJson<never>>(LAYERS.booths.id, { returnCountOnly: 'true' })
        return !res.error && (res.count ?? 0) > 0
      } catch {
        return false
      }
    },

    async statics() {
      const feats = await pages<BoothStaticFeature['properties']>(LAYERS.booths.id, {
        outFields: STATIC_FIELDS.join(','),
        returnGeometry: 'true',
        outSR: '4326',
        orderByFields: 'booth_id',
      })
      return {
        features: feats.map((f) => ({
          properties: f.attributes,
          geometry: typeof f.geometry?.x === 'number' && typeof f.geometry.y === 'number' ? { type: 'Point' as const, coordinates: [f.geometry.x, f.geometry.y] as [number, number] } : null,
        })),
      }
    },

    async history(since) {
      const ceiling = await confirmedAt()
      if (ceiling === null) return { fields: HISTORY_FIELDS, rows: [] }
      // Round up: the literal has whole seconds, and a stamp with milliseconds would otherwise fall just outside it. The exact test is below.
      const upTo = `snapshot_at <= ${timestampLiteral(Math.ceil(ceiling / 1000) * 1000)}`
      const feats = await pages<Record<string, unknown>>(LAYERS.booth_history.id, {
        where: since === null ? upTo : `snapshot_at > ${timestampLiteral(since)} AND ${upTo}`,
        outFields: HISTORY_FIELDS.join(','),
        returnGeometry: 'false',
        // A stable order, or offset paging can repeat or skip rows when the layer changes between pages.
        orderByFields: 'snapshot_at,booth_id',
      })
      const kept = feats.filter((f) => Number(f.attributes.snapshot_at) <= ceiling)
      return { fields: HISTORY_FIELDS, rows: kept.map((f) => HISTORY_FIELDS.map((n) => f.attributes[n] ?? null)) }
    },
  }
}
