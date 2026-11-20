import { useEffect, useMemo, useState } from 'react'
import type { FirstPrefs2022Asset } from '@vic26/schema'
import type { FpBaseline } from '../../lenspanel/swing'

const SEATS = 88
const SUM_TOLERANCE = 0.2

/**
 * The 2022 first-preference asset, only if it is sound: 88 rows, each id one of the statics' and used once, every share
 * between 0 and 100 and each row summing to 100 within 0.2 (ADR 0028). Otherwise null, and the lens shows no change figures
 * rather than wrong ones (hold last good).
 */
export function validateFp2022(raw: unknown, ids: ReadonlySet<number>): FirstPrefs2022Asset | null {
  const a = raw as Partial<FirstPrefs2022Asset> | null
  if (!a || !Array.isArray(a.districts) || a.districts.length !== SEATS || ids.size !== SEATS) return null
  const seen = new Set<number>()
  for (const d of a.districts) {
    if (!d || !ids.has(d.district_id) || seen.has(d.district_id) || !d.fp_2022_pct) return null
    seen.add(d.district_id)
    const shares = Object.values(d.fp_2022_pct)
    if (shares.some((v) => typeof v !== 'number' || !(v >= 0 && v <= 100))) return null
    if (Math.abs(shares.reduce((n, v) => n + v, 0) - 100) > SUM_TOLERANCE) return null
  }
  return a as FirstPrefs2022Asset
}

export const toBaseline = (a: FirstPrefs2022Asset): FpBaseline => new Map(a.districts.map((d) => [d.district_id, d.fp_2022_pct] as const))

/** Loads the asset (its own chunk) when the swing lens or its panel first needs it; null until then, and for good if it fails the checks. */
export function useFp2022(ids: ReadonlySet<number>): FpBaseline | null {
  const [asset, setAsset] = useState<FirstPrefs2022Asset | null>(null)
  useEffect(() => {
    let alive = true
    import('./fp-2022.json').then(
      (m) => alive && setAsset(validateFp2022(m.default, ids)),
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [ids])
  return useMemo(() => (asset ? toBaseline(asset) : null), [asset])
}
