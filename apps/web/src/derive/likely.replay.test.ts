/// <reference types="node" />
/**
 * VE-226, ADR 0033: on the 2022 replay, "Likely" and "Changing hands" must not call a seat for the party that went on to
 * lose it. The review found 289 of 5,078 seat-ticks wrong under the count-only rule (30% counted). Reads the git-ignored
 * replay folder ingest wrote and skips where it is absent. Replay data proves the logic; it is never shown as a result.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { DistrictHistoryRow, DistrictStatic, PartyBucket } from '@vic26/schema'
import { gainShown } from './list'
import { LIKELY_FROM_PCT, seatsFromRows, type Seat } from './seats'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIR = process.env.REPLAY_DIR ?? path.resolve(here, '../../../../packages/ingest/out/replay-se22-5min')
const has = fs.existsSync(path.join(DIR, 'manifest.json')) && fs.existsSync(path.join(DIR, 'history/district_history.columns.json'))
const read = <T,>(p: string): T => JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')) as T

describe.skipIf(!has)('Likely and Changing hands across the 2022 replay (ADR 0033)', () => {
  const districts = read<{ features: { properties: DistrictStatic }[] }>('static/districts.geojson').features.map((f) => f.properties)
  const dcols = read<{ fields: string[]; rows: unknown[][] }>('history/district_history.columns.json')
  const byTick = new Map<string, DistrictHistoryRow[]>()
  for (const r of dcols.rows) {
    const o = Object.fromEntries(dcols.fields.map((f, i) => [f, r[i]])) as unknown as DistrictHistoryRow
    byTick.set(o.snapshot_id, [...(byTick.get(o.snapshot_id) ?? []), o])
  }
  const ticks = [...byTick.keys()].sort()
  const seatsAt = (t: string) => seatsFromRows(byTick.get(t)!, districts)
  // The eventual winner: the last tick's leader, except the two seats whose final 2CP block names the wrong pair or order
  // (finding 1, CONFIRMED in the VEC Verbose file: Pakenham went to Labor, Shepparton to the Nationals). Seats measured
  // against a later contest (Prahran, Narracan) are left out, as the review did.
  const last = seatsAt(ticks[ticks.length - 1]!)
  const winner = new Map<number, PartyBucket | null>()
  for (const st of districts) {
    if (st.base_source !== 'SE2022') continue
    const name = st.district_name.replace(/ District$/, '')
    winner.set(st.district_id, name === 'Pakenham' ? 'ALP' : name === 'Shepparton' ? 'NAT' : last.get(st.district_id)?.leader ?? null)
  }
  // The rule before ADR 0033: Likely was any leading seat at 30% counted.
  const likelyBefore = (s: Seat) => s.state === 'leading' && (s.pct ?? 0) >= LIKELY_FROM_PCT
  const tally = (isLikely: (s: Seat) => boolean) => {
    let calls = 0
    let wrong = 0
    const seats = new Set<string>()
    for (const t of ticks) {
      for (const s of seatsAt(t).values()) {
        if (!winner.has(s.id) || !s.leader || s.state === 'won') continue
        if (!(isLikely(s) || s.state === 'firm')) continue
        calls += 1
        if (isLikely(s) && s.leader !== winner.get(s.id)) {
          wrong += 1
          seats.add(s.name)
        }
      }
    }
    return { calls, wrong, seats: [...seats].sort() }
  }

  it('makes no wrong Likely call (it made 288 before, in 11 seats)', () => {
    const before = tally(likelyBefore)
    const after = tally((s) => s.likely)
    console.log(`Likely or certain seat-ticks, before: ${before.calls}, Likely for the eventual loser: ${before.wrong} (${before.seats.join(', ')})`)
    console.log(`Likely or certain seat-ticks, after: ${after.calls}, Likely for the eventual loser: ${after.wrong} (${after.seats.join(', ')})`)
    expect(before.wrong).toBeGreaterThan(250)
    expect(after.wrong).toBe(0)
  })

  it('reports the 9 pm Changing hands list before and after', () => {
    const nine = ticks.find((t) => t >= '20221126_210000')!
    const seats = [...seatsAt(nine).values()]
    const before = seats.filter((s) => s.changing && (s.state === 'firm' || s.state === 'won' || (s.pct ?? 0) >= LIKELY_FROM_PCT)).map((s) => s.name)
    const after = seats.filter(gainShown).map((s) => s.name)
    console.log(`9 pm (${nine}) Changing hands before: ${before.join(', ') || 'none'}; after: ${after.join(', ') || 'none'}`)
    // Bass, Caulfield, Hawthorn, Mornington and Shepparton did not change hands in 2022.
    for (const name of ['Bass', 'Caulfield', 'Hawthorn', 'Mornington', 'Shepparton']) expect(after).not.toContain(name)
  })
})
