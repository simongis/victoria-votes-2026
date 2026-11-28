/// <reference types="node" />
/**
 * VE-290 invariant on the made-up 2026 night (reads the git-ignored ingest output; skips where absent): for every seat at
 * every tick, the panel heading, the "led all night" line, the trend's side (its latest figure's sign) and the hex tooltip
 * all name the same party, and a seat whose first-preference leader is outside the VEC's pair always carries the note.
 * Replay data proves the logic; it is never shown as a result.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { DistrictHistoryRow, DistrictStatic, PartyBucket } from '@vic26/schema'
import { partyName, seatsFromRows } from '../../derive/seats'
import { pulseSeries } from '../../derive/pulse'
import { multiRows, multiSentence, seatFacts } from './multi'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(here, '../../../../../packages/ingest/out')
// The sim night, the 2022 replay (declared seats: Pakenham), and any night SIM_DIR names.
const DIRS = [process.env.SIM_DIR ?? path.join(OUT, 'sim-2026-final'), path.join(OUT, 'replay-se22-5min')].filter((d) => fs.existsSync(path.join(d, 'history/district_history.columns.json')))

describe.skipIf(DIRS.length === 0)('VE-290: panel, trend and tooltip agree on the made-up and replay nights', () => {
  it.each(DIRS)('names one party per seat per tick, and always notes a wrong pair: %s', (DIR) => {
    const read = <T,>(p: string): T => JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')) as T
    const districts = read<{ features: { properties: DistrictStatic }[] }>('static/districts.geojson').features.map((f) => f.properties)
    const cols = read<{ fields: string[]; rows: unknown[][] }>('history/district_history.columns.json')
    const rows = cols.rows.map((r) => Object.fromEntries(cols.fields.map((f, i) => [f, r[i]])) as unknown as DistrictHistoryRow)
    const ids = [...new Set(rows.map((r) => r.snapshot_id))].sort()
    const seatsAt = ids.map((id) => seatsFromRows(rows.filter((r) => r.snapshot_id === id), districts))
    const series = pulseSeries(seatsAt)
    let checked = 0
    let oldDisagree = 0
    let nullTicks = 0
    let notes = 0
    const bad: string[] = []
    seatsAt.forEach((_, t) => {
      for (const r of multiRows(seatsAt[t]!, series, t, t === ids.length - 1)) {
        const s = r.seat
        // Before VE-290 the end label read the latest figure ever seen, the heading the seat's own leader.
        const ever = [...r.line].reverse().find((v) => v !== null) ?? null
        if (ever !== null && r.lead !== null) {
          const hd: PartyBucket | null = s.base ?? s.tcp?.a ?? null
          const ot: PartyBucket | null = s.tcp ? (s.tcp.a === hd ? s.tcp.b : s.tcp.a) : null
          if ((ever >= 0 ? hd : ot) !== s.leader) oldDisagree++
        }
        const last = r.line.length > 0 ? r.line[r.line.length - 1]! : null
        if (last === null) {
          // Pairing withheld or not yet in at this tick: every surface falls back to the seat's own leader, with no pair named.
          if (r.lead === null) continue
          nullTicks++
          const g = seatFacts(r, false)
          const w = partyName(s.leader)
          if (!g.leadLine.startsWith(`${w} ${s.state === 'won' ? 'won' : 'ahead'} by`) || !multiSentence(r).startsWith(`${r.name}: ${w} ahead by`)) bad.push(`${r.name}@${t}: no pair now, heading "${g.leadLine}"`)
          continue
        }
        checked++
        // Independent read of the line: positive is the 2022 holder's side (the pair's first party with no holder).
        const holder: PartyBucket | null = s.base ?? s.tcp?.a ?? null
        const other: PartyBucket | null = s.tcp ? (s.tcp.a === holder ? s.tcp.b : s.tcp.a) : null
        // A declared seat is its Elected winner (ADR 0034), whatever the line's sign.
        const side = s.state === 'won' ? s.leader : last >= 0 ? holder : other
        const f = seatFacts(r, false)
        if (/ 0 points/.test(f.leadLine) || / 0 points/.test(multiSentence(r))) bad.push(`${r.name}@${t}: 0 points`)
        const word = side ? partyName(side) : ''
        if (f.leader !== side || !f.leadLine.startsWith(`${word} ${s.state === 'won' ? 'won' : 'ahead'}`) || !multiSentence(r).startsWith(`${r.name}: ${word} ahead`) || (f.changes && r.swings === 0 && !f.changes.startsWith(`${word} led`))) {
          bad.push(`${r.name}@${t}: line ${last}, side ${side}, heading "${f.leadLine}", tip "${multiSentence(r)}"`)
        }
        const fp = (s.fp ?? []).filter((x) => x.party !== 'OTH')
        const top = fp.reduce<(typeof fp)[number] | null>((m, x) => (m === null || x.pct > m.pct ? x : m), null)
        const wrong = !!s.tcp?.b && !s.tcpWithheld && !!top && top.party !== s.tcp.a && top.party !== s.tcp.b
        if (wrong) notes++
        if (wrong && !f.wrongPair) bad.push(`${r.name}@${t}: wrong pair without a note`)
      }
    })
    console.log(`VE-290 ${path.basename(DIR)}: ${checked} seat-ticks; old heading (seat.leader) disagreed with the line in ${oldDisagree}; new disagreements ${bad.length}; ${nullTicks} no-pair ticks; ${notes} wrong-pair ticks (all noted)`)
    expect(checked).toBeGreaterThan(1000)
    expect(seatsAt.at(-1)!.size).toBeGreaterThan(0)
    expect(bad.slice(0, 10)).toEqual([])
  })
})
