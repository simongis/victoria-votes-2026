import { useEffect, useState } from 'react'
import { toBaseline, validateFp2022 } from '../explore/arrows/fp2022'
import type { FpBaseline } from '../lenspanel/swing'

/**
 * The 2022 first preferences for the seat panel (VE-234), loaded on first use in the asset's own chunk. The panel does not hold
 * the statics, so the asset is checked against its own district ids (88 rows, each once, shares summing to 100) rather than the
 * statics'. Null until loaded, and for good if it fails the checks: no line is better than a wrong one.
 */
export function useFpBaseline(): FpBaseline | null {
  const [base, setBase] = useState<FpBaseline | null>(null)
  useEffect(() => {
    let alive = true
    import('../explore/arrows/fp-2022.json').then(
      (m) => {
        const raw = m.default as { districts?: { district_id: number }[] }
        const asset = validateFp2022(raw, new Set((raw.districts ?? []).map((d) => d.district_id)))
        if (alive && asset) setBase(toBaseline(asset))
      },
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [])
  return base
}
