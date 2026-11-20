/// <reference types="node" />
/**
 * VE-212 across the 2022 replay: the headline and row lines for three named places at five points of the night. Reads the
 * replay folder ingest wrote (git-ignored), so it skips where that is not on the machine. The replay is the data the words
 * are proven against; it is never shown as a result.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { DistrictHistoryRow, DistrictStatic } from '@vic26/schema'
import { nearest } from '../components/explore/similar/similarity'
import { swingShown } from './colour'
import { changeWords, likePlaceRow, likePlacesHeadline } from './likePlaces'
import { seatsFromRows } from './seats'
import { isFinal } from './turnout'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIR = process.env.REPLAY_DIR ?? path.resolve(here, '../../../../packages/ingest/out/replay-se22-5min')
const has = fs.existsSync(path.join(DIR, 'manifest.json')) && fs.existsSync(path.join(DIR, 'history/district_history.columns.json'))
const read = <T,>(p: string): T => JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')) as T

const POINTS: [string, string][] = [
  ['6:30 pm', '20221126_183000'],
  ['8 pm', '20221126_200005'],
  ['9 pm', '20221126_210006'],
  ['midnight', '20221127_000008'],
  ['final', '20221215_180017'],
]

describe.skipIf(!has)('seats like yours across the 2022 replay', () => {
  const districts = read<{ features: { properties: DistrictStatic }[] }>('static/districts.geojson').features.map((f) => f.properties)
  const dcols = read<{ fields: string[]; rows: unknown[][] }>('history/district_history.columns.json')
  const byTick = new Map<string, DistrictHistoryRow[]>()
  for (const r of dcols.rows) {
    const o = Object.fromEntries(dcols.fields.map((f, i) => [f, r[i]])) as unknown as DistrictHistoryRow
    byTick.set(o.snapshot_id, [...(byTick.get(o.snapshot_id) ?? []), o])
  }
  const idOf = (name: string): number => districts.find((d) => d.short_name === name)!.district_id

  for (const place of ['Ripon', 'Lowan', 'Hawthorn']) {
    it(`${place}: headline and rows at each tick`, () => {
      const out: string[] = []
      for (const [label, snap] of POINTS) {
        const seats = seatsFromRows(byTick.get(snap) ?? [], districts)
        const picked = idOf(place)
        const five = nearest(picked)
        const sw = (id: number) => { const s = seats.get(id); return s ? swingShown(s, districts.find((d) => d.district_id === id)) : null }
        const h = likePlacesHeadline(picked, five, seats, isFinal(seats.values()), sw)
        const rows = five.map((id) => { const s = seats.get(id)!; const r = likePlaceRow(s); const c = changeWords(s); return `${s.name}: ${r.line}${c ? ` · ${c}` : ''}${r.held ? ` (${r.held})` : ''}` })
        const text = [label, h.headline, h.picked ?? '-', ...rows].join('\n')
        expect(text).not.toMatch(/NaN|undefined|null/)
        out.push(text)
      }
      expect(out.join('\n\n')).toMatchSnapshot()
    })
  }
})
