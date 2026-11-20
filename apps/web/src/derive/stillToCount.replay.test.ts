/// <reference types="node" />
/**
 * VE-215 A1: "votes to come" must only fall across the night. It used to count only seats with a two-candidate figure, so
 * the total rose as new seats reported (about 540,000 at 6:45 pm, 2.7 million at 7:45 pm). Reads the git-ignored replay
 * folder ingest wrote and skips where it is absent. Replay data proves the logic; it is never shown as a result.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { DistrictHistoryRow, DistrictStatic } from '@vic26/schema'
import { seatFromHistory, seatsFromRows, stillToCountTotal } from './seats'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIR = process.env.REPLAY_DIR ?? path.resolve(here, '../../../../packages/ingest/out/replay-se22-5min')
const has = fs.existsSync(path.join(DIR, 'manifest.json')) && fs.existsSync(path.join(DIR, 'history/district_history.columns.json'))
const read = <T,>(p: string): T => JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')) as T
// A skipped describe still runs its body, which reads private files at collection, so the body is not run when they are absent (the public copy).
const describeIfReplay = (title: string, fn: () => void) =>
  has
    ? describe(title, fn)
    : describe.skip(`${title} [skipped: needs packages/ingest/out/replay-se22-5min, which the public copy leaves out]`, () => {
        it('skipped', () => {})
      })

const st = { district_id: 1, district_name: 'Testville District', enrolment: 50_000, base_winner_party: 'LIB', base_source: 'SE2022' } as DistrictStatic
const row = (over: Partial<DistrictHistoryRow>): DistrictHistoryRow =>
  ({ snapshot_id: 'x', snapshot_at: 0, district_id: 1, pct_counted: 0, pct_booths: 0, fp_ALP: 0, fp_LIB: 0, fp_NAT: 0, fp_GRN: 0, fp_ONP: 0, fp_IND: 0, fp_OTH: 0, fp_total: 0, lead_party: null, tcp_party_a: null, tcp_party_b: null, tcp_pct_a: null, tcp_withheld: false, changed_hands: false, status: 'counting', ...over }) as DistrictHistoryRow

describe('stillToCount for one seat (VE-215 A1)', () => {
  it('a seat with nothing counted carries the full estimate, with no margin and so no "firm"', () => {
    const s = seatFromHistory(row({}), st)
    expect(s.stillToCount).toBe(Math.round(50_000 * 0.9 * 0.95))
    expect(s.marginVotes).toBeNull()
    expect(s.state).toBe('none')
  })
  it('a seat counted but with no two-candidate figure still carries an estimate and stays not firm', () => {
    const s = seatFromHistory(row({ fp_ALP: 5_000, fp_total: 5_000, lead_party: 'ALP' }), st)
    expect(s.stillToCount).toBe(Math.round(50_000 * 0.9 * 0.95 - 5_000 * 0.95))
    expect(s.marginVotes).toBeNull()
    expect(s.state).toBe('leading')
  })
  it('a declared seat is 0 even when nothing is counted in the row', () => {
    expect(seatFromHistory(row({ status: 'declared' }), st).stillToCount).toBe(0)
  })
})

describeIfReplay('votes to come across the 2022 replay (VE-215 A1)', () => {
  const districts = read<{ features: { properties: DistrictStatic }[] }>('static/districts.geojson').features.map((f) => f.properties)
  const dcols = read<{ fields: string[]; rows: unknown[][] }>('history/district_history.columns.json')
  const byTick = new Map<string, DistrictHistoryRow[]>()
  for (const r of dcols.rows) {
    const o = Object.fromEntries(dcols.fields.map((f, i) => [f, r[i]])) as unknown as DistrictHistoryRow
    byTick.set(o.snapshot_id, [...(byTick.get(o.snapshot_id) ?? []), o])
  }
  const ticks = [...byTick.keys()].sort()
  const totals = ticks.map((t) => stillToCountTotal(seatsFromRows(byTick.get(t)!, districts)))

  // Prints the figures the brief reports (before and after the change); asserts nothing.
  it('reports the total at named ticks', () => {
    const at = (id: string) => totals[ticks.findIndex((t) => t >= id)]
    const named = ['20221126_183000', '20221126_184500', '20221126_194500', '20221126_210000', '20221127_000000', ticks[ticks.length - 1]!]
    console.log(named.map((id) => `${id}: ${at(id)}`).join('\n'))
  })
  it('never rises from one tick to the next', () => {
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]!, `${ticks[i - 1]} -> ${ticks[i]}`).toBeLessThanOrEqual(totals[i - 1]!)
    }
  })
  it('is 0 at the Final and larger at 6:45 pm than at 9 pm', () => {
    expect(totals[totals.length - 1]).toBe(0)
    const at = (id: string) => totals[ticks.findIndex((t) => t >= id)]!
    expect(at('20221126_184500')).toBeGreaterThan(at('20221126_210000'))
  })
})
