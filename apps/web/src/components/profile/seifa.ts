import type { SeifaAsset, SeifaSeat } from '@vic26/schema'

/**
 * VE-133 (ADR 0025): the share of a seat's residents in Victoria's most disadvantaged and most advantaged fifths
 * of neighbourhoods. Static asset, imported lazily and checked against the district ids every time; if it does
 * not validate the profile simply shows nothing extra (hold last good).
 */

const EXPECTED_SEATS = 88
/** Each fifth holds a fifth of Victorians by construction, so 20 is the state reference. */
export const STATE_SHARE = 20

const isPct = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100

export function validateSeifa(raw: unknown, ids: ReadonlySet<number>): SeifaAsset | null {
  if (typeof raw !== 'object' || raw === null) return null
  const a = raw as { source?: unknown; districts?: unknown }
  if (typeof a.source !== 'string' || !Array.isArray(a.districts) || a.districts.length !== EXPECTED_SEATS) return null
  const seen = new Set<number>()
  for (const row of a.districts as unknown[]) {
    if (typeof row !== 'object' || row === null) return null
    const r = row as Record<string, unknown>
    const id = r.district_id
    if (typeof id !== 'number' || !ids.has(id) || seen.has(id)) return null
    seen.add(id)
    if (!isPct(r.pct_irsd_q1) || !isPct(r.pct_irsad_q5)) return null
  }
  return raw as SeifaAsset
}

export async function loadSeifa(ids: ReadonlySet<number>): Promise<SeifaAsset | null> {
  try {
    const m = await import('./seifa.json')
    return validateSeifa(m.default, ids)
  } catch {
    return null
  }
}

export interface SeifaRow {
  key: 'low' | 'high'
  text: string
  pct: number
  reference: number
}

function words(pct: number, tail: string): string {
  if (pct <= 0) return `None live in ${tail}`
  if (pct < 0.5) return `Under 1% live in ${tail}`
  return `${Math.round(pct)}% live in ${tail}`
}

/** Two plain lines, each under about 12 words. IRSD says "disadvantaged", IRSAD "advantaged" (never "rich"). */
export function seifaRows(seat: SeifaSeat): [SeifaRow, SeifaRow] {
  return [
    { key: 'low', text: words(seat.pct_irsd_q1, "Victoria's most disadvantaged fifth"), pct: seat.pct_irsd_q1, reference: STATE_SHARE },
    { key: 'high', text: words(seat.pct_irsad_q5, "Victoria's most advantaged fifth"), pct: seat.pct_irsad_q5, reference: STATE_SHARE },
  ]
}
