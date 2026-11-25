/// <reference types="node" />
/**
 * ADR 0034: on the 2022 replay Final a declared seat is its Elected winner, so the tally reads Labor 56 (Pakenham Labor,
 * Shepparton Nationals) where the two-candidate leader gave 55. Reads the git-ignored replay folder ingest wrote and
 * skips where it is absent. Replay data proves the logic; it is never shown as a result.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { DistrictHistoryRow, DistrictStatic } from '@vic26/schema'
import { seatsFromRows, tallyOf } from './seats'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIR = process.env.REPLAY_DIR ?? path.resolve(here, '../../../../packages/ingest/out/replay-se22-5min')
const has = fs.existsSync(path.join(DIR, 'manifest.json')) && fs.existsSync(path.join(DIR, 'history/district_history.columns.json'))
const read = <T,>(p: string): T => JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')) as T

describe.skipIf(!has)('declared winners on the 2022 replay Final (ADR 0034)', () => {
  it('tallies Labor 56, with Pakenham Labor and Shepparton Nationals', () => {
    const districts = read<{ features: { properties: DistrictStatic }[] }>('static/districts.geojson').features.map((f) => f.properties)
    const cols = read<{ fields: string[]; rows: unknown[][] }>('history/district_history.columns.json')
    const rows = cols.rows.map((r) => Object.fromEntries(cols.fields.map((f, i) => [f, r[i]])) as unknown as DistrictHistoryRow)
    const finalId = rows.map((r) => r.snapshot_id).sort().at(-1)!
    const seats = seatsFromRows(rows.filter((r) => r.snapshot_id === finalId), districts)
    const t = tallyOf(seats)
    expect(t.firm.ALP + t.leading.ALP).toBe(56)
    const by = (n: string) => [...seats.values()].find((s) => s.name === n)!
    expect(by('Pakenham').leader).toBe('ALP')
    expect(by('Shepparton').leader).toBe('NAT')
  })
})
