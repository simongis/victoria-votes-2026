/// <reference types="node" />
/**
 * VE-208 across the 2022 replay: the panel's numbers for three named places at five points of the night, and a sweep of
 * every place for anything impossible. Reads the replay folder ingest wrote (git-ignored), so it skips where that is
 * not on the machine. The replay is never shown as a result: it is the data the panel is proven against.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { DistrictHistoryRow, DistrictStatic } from '@vic26/schema'
import { parseBoothHistory, parseBoothStatics, type BoothStatic } from '../components/booths/model'
import { placePanel, type PlaceInput, type PlacePanel } from './boothPanel'
import { seatsFromRows } from './seats'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIR = process.env.REPLAY_DIR ?? path.resolve(here, '../../../../packages/ingest/out/replay-se22-5min')
const has = fs.existsSync(path.join(DIR, 'manifest.json')) && fs.existsSync(path.join(DIR, 'history/booth_history.columns.json'))

const read = <T,>(p: string): T => JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')) as T
// A skipped describe still runs its body, which reads private files at collection, so the body is not run when they are absent (the public copy).
const describeIfReplay = (title: string, fn: () => void) =>
  has
    ? describe(title, fn)
    : describe.skip(`${title} [skipped: needs packages/ingest/out/replay-se22-5min, which the public copy leaves out]`, () => {
        it('skipped', () => {})
      })

// The five points the brief names: 6:30 pm (few places in), 8 pm, 9 pm, midnight, and the final count.
const POINTS: [string, string][] = [
  ['6:30 pm', '20221126_183000'],
  ['8 pm', '20221126_200005'],
  ['9 pm', '20221126_210006'],
  ['midnight', '20221127_000008'],
  ['final', '20221215_180017'],
]

describeIfReplay('booth panel across the 2022 replay', () => {
  const manifest = read<{ snapshots: { snapshotId: string; snapshotAt: number }[] }>('manifest.json')
  const districts = read<{ features: { properties: DistrictStatic }[] }>('static/districts.geojson').features.map((f) => f.properties)
  const dcols = read<{ fields: string[]; rows: unknown[][] }>('history/district_history.columns.json')
  const byTick = new Map<string, DistrictHistoryRow[]>()
  for (const r of dcols.rows) {
    const o = Object.fromEntries(dcols.fields.map((f, i) => [f, r[i]])) as unknown as DistrictHistoryRow
    byTick.set(o.snapshot_id, [...(byTick.get(o.snapshot_id) ?? []), o])
  }
  const statics = parseBoothStatics(read('static/booths.geojson'))
  const history = parseBoothHistory(read('history/booth_history.columns.json'))
  const ticks = manifest.snapshots.map((s) => s.snapshotAt)
  const seatsAt = (id: string) => seatsFromRows(byTick.get(id) ?? [], districts)

  const byId = new Map(statics.booths.map((b) => [b.id, b]))
  const seatIdOf = (name: string): number => districts.find((d) => d.short_name === name)!.district_id

  function inputFor(place: BoothStatic, snapshotId: string, isEvc = false): PlaceInput {
    const idx = manifest.snapshots.findIndex((s) => s.snapshotId === snapshotId)
    const at = manifest.snapshots[idx]!.snapshotAt
    const seat = seatsAt(snapshotId).get(place.districtId)!
    const mates = [...statics.booths, ...statics.evc].filter((b) => b.districtId === place.districtId && b.id !== place.id)
    return {
      place,
      isEvc,
      rows: history.byBooth.get(place.id),
      at,
      seat,
      mates: mates.map((m) => ({ place: m, rows: history.byBooth.get(m.id) })),
      // The replay compares 2022 with 2022.
      sameElection: true,
      ticks: ticks.slice(0, idx + 1),
    }
  }

  // The early voting centre the 2022 file lacks: a stand-in in Albert Park, as the prototype used, so the fallback is proven on real seat numbers.
  const evc: BoothStatic = { id: 990001, name: 'Albert Park - EVC', districtId: seatIdOf('Albert Park'), e: 0, n: 0 }
  const NAMED: { label: string; place: BoothStatic; isEvc: boolean }[] = [
    // Footscray and Euroa report late in the replay; Hyde and Baddaginnie are among its first 20, so the early points have numbers too.
    { label: 'city: Footscray', place: byId.get(17297)!, isEvc: false },
    { label: 'city, early: Hyde', place: byId.get(17767)!, isEvc: false },
    { label: 'regional: Euroa', place: byId.get(16729)!, isEvc: false },
    { label: 'regional, early: Baddaginnie', place: byId.get(16866)!, isEvc: false },
    { label: 'early voting centre: Albert Park - EVC', place: evc, isEvc: true },
  ]
  const panels = new Map<string, PlacePanel>()
  for (const n of NAMED) for (const [, id] of POINTS) panels.set(`${n.label}@${id}`, placePanel(inputFor(n.place, id, n.isEvc)))

  it('finds the named places and the five snapshots', () => {
    expect(byId.get(17297)?.name).toBe('Footscray')
    expect(byId.get(16729)?.name).toBe('Euroa')
    expect(byId.get(17767)?.name).toBe('Hyde')
    expect(byId.get(16866)?.name).toBe('Baddaginnie')
    for (const [, id] of POINTS) expect(manifest.snapshots.some((s) => s.snapshotId === id)).toBe(true)
  })

  it('the early voting centre has no result of its own at any point, and falls back to its seat once the seat has a final two', () => {
    for (const [, id] of POINTS) {
      const p = panels.get(`early voting centre: Albert Park - EVC@${id}`)!
      expect(p.state).toBe('evc-no-result')
      expect(p.votes).toBeNull()
      if (p.seatFallback) expect(p.seatFallback.pctA).toBeGreaterThan(0)
    }
    expect(panels.get('early voting centre: Albert Park - EVC@20221215_180017')!.seatFallback).not.toBeNull()
  })

  it('never shows a swing in the replay (same-election baseline)', () => {
    for (const p of panels.values()) expect(p.swing).toEqual({ kind: 'none' })
  })

  it('steps through the night: waiting, then counted, and never back', () => {
    for (const n of NAMED.filter((x) => !x.isEvc)) {
      const states = POINTS.map(([, id]) => panels.get(`${n.label}@${id}`)!.state)
      const first = states.findIndex((s) => s !== 'waiting')
      expect(first).toBeGreaterThanOrEqual(0)
      expect(states.slice(first).every((s) => s !== 'waiting')).toBe(true)
    }
  })

  it('pins the named places at each point (hand-checked against the replay files)', () => {
    const view = (p: PlacePanel) => ({ state: p.state, votes: p.votes, pctA: p.twoCp ? [p.twoCp.a, p.twoCp.b, Math.round(p.twoCp.pctA * 100) / 100] : null, pts: p.vsSeat?.points ?? null, rank: p.rank ? [p.rank.rank, p.rank.of] : null, series: p.series.length })
    const got = Object.fromEntries([...panels].map(([k, p]) => [k, view(p)]))
    expect(got).toMatchSnapshot()
  })

  it('nothing is NaN, negative or above 100, for every place at every point', () => {
    const bad: string[] = []
    const check = (label: string, v: number | null | undefined, max = 100): void => {
      if (v === null || v === undefined) return
      if (!Number.isFinite(v) || v < 0 || v > max) bad.push(`${label}=${v}`)
    }
    for (const [name, id] of POINTS) {
      for (const b of statics.booths) {
        const p = placePanel(inputFor(b, id))
        const tag = `${name} ${b.name}`
        check(`${tag} twoCp`, p.twoCp?.pctA)
        check(`${tag} here`, p.vsSeat?.here)
        check(`${tag} informal`, p.informalPct)
        check(`${tag} votes`, p.votes, Infinity)
        for (const f of p.fp) check(`${tag} fp ${f.party}`, f.pct)
        if (p.share) for (const k of ['pctOfSeat', 'offPlacePct', 'placesPct', 'otherPct'] as const) check(`${tag} share.${k}`, p.share[k] as number | null)
        if (p.rank) {
          expect(p.rank.rank).toBeGreaterThanOrEqual(1)
          expect(p.rank.rank).toBeLessThanOrEqual(p.rank.of)
          for (const d of p.rank.dots) check(`${tag} dot`, d.pct)
        }
        for (const v of p.series) check(`${tag} series`, v, Infinity)
        // Not strictly rising: the feed corrects a booth down by a vote or two now and then (152 times in the replay), and the line shows it as it was.
      }
    }
    expect(bad).toEqual([])
  })
})

// The 2026 set-up statics (se26, 57 booths in the e2e sample and 2,162 places in the full statics) carry early voting
// centres and places with no 2022 match. They have no results or history yet, so this proves the parse and the states
// those places start in, not a count.
const SE26 = path.resolve(here, '../../../../packages/ingest/out/se26/static/booths.geojson')
// A skipped describe still runs its body, which reads private files at collection, so the body is not run when they are absent (the public copy).
const describeIfSe26 = (title: string, fn: () => void) =>
  fs.existsSync(SE26)
    ? describe(title, fn)
    : describe.skip(`${title} [skipped: needs packages/ingest/out/se26/static/booths.geojson, which the public copy leaves out]`, () => {
        it('skipped', () => {})
      })
describeIfSe26('booth panel on the 2026 set-up statics', () => {
  const statics = parseBoothStatics(JSON.parse(fs.readFileSync(SE26, 'utf8')))
  const seat = { id: 0, name: 'Test seat', tcp: { a: 'ALP', b: 'LIB', pctA: 55 } as const, fp: [] }

  it('accounts for every place and keeps the 2022 match state of each', () => {
    expect(statics.booths.length + statics.evc.length + statics.skipped).toBe(2162)
    expect(statics.evc.length).toBe(310)
    expect(statics.booths.some((b) => b.base?.match === 'name_location')).toBe(true)
    expect(statics.booths.some((b) => b.base?.match === 'none')).toBe(true)
  })

  it('every early voting centre starts with no result and falls back to the seat; every election day place starts as not counted', () => {
    for (const e of statics.evc) {
      const p = placePanel({ place: e, isEvc: true, rows: undefined, at: 1, seat, mates: [], sameElection: false, ticks: [] })
      expect(p.state).toBe('evc-no-result')
      expect(p.seatFallback).toEqual({ a: 'ALP', b: 'LIB', pctA: 55 })
    }
    for (const b of statics.booths.slice(0, 200)) {
      expect(placePanel({ place: b, isEvc: false, rows: undefined, at: 1, seat, mates: [], sameElection: false, ticks: [] }).state).toBe('waiting')
    }
  })
})
