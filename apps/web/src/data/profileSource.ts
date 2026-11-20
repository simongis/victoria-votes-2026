/**
 * The two static district tables behind the profile (VE-68): district_demographics (layer 8) and district_change
 * (layer 9). They are real reference data, not results, so replay and live modes both read them from the public
 * view. Loaded lazily on the first panel open and held in memory for the session.
 */
import { LAYERS } from '@vic26/schema'
import type { ChangeRow, DemoRow } from '../derive/profile'
import { DEFAULT_VIEW_URL } from './agolSource'
import { fetchJsonOverHttp, type FetchJson } from './replaySource'

export interface ProfileData {
  demos: DemoRow[]
  changes: ChangeRow[]
}

interface QueryJson<A> {
  features?: { attributes: A }[]
  exceededTransferLimit?: boolean
  error?: { message: string }
}

export function createProfileLoader({ url = DEFAULT_VIEW_URL, fetchJson = fetchJsonOverHttp }: { url?: string; fetchJson?: FetchJson } = {}) {
  async function rows<A>(layer: number): Promise<A[]> {
    const out: A[] = []
    for (let offset = 0; ; offset += 2000) {
      const q = new URLSearchParams({ where: '1=1', outFields: '*', f: 'json', returnGeometry: 'false', resultOffset: String(offset), resultRecordCount: '2000' })
      const res = await fetchJson<QueryJson<A>>(`${url}/${layer}/query?${q}`)
      if (res.error) throw new Error(`layer ${layer}: ${res.error.message}`)
      out.push(...(res.features ?? []).map((f) => f.attributes))
      if (!res.exceededTransferLimit) return out
    }
  }
  let cached: Promise<ProfileData> | null = null
  return function load(): Promise<ProfileData> {
    cached ??= Promise.all([rows<DemoRow>(LAYERS.district_demographics.id), rows<ChangeRow>(LAYERS.district_change.id)]).then(([demos, changes]) => ({ demos, changes }))
    cached.catch(() => (cached = null))
    return cached
  }
}

/** The app-wide loader: first call fetches, later calls reuse. VITE_AGOL_VIEW_URL points it at the dev service. */
export const loadProfileData = createProfileLoader({ url: import.meta.env.VITE_AGOL_VIEW_URL?.trim() || DEFAULT_VIEW_URL })
