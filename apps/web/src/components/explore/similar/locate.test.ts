/// <reference types="node" />
/**
 * VE-221 (B14): "Use my location" matches the device's point to a seat with the app's own district shapes. The matcher is
 * a pure function (nothing leaves the device); the geolocation call is injected so refusals and failures are testable.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { GeoCollection, Geometry } from '../../../data/types'
import { locateSeat, seatAtPoint, type GeoLike } from './locate'

const feat = (id: number, geometry: Geometry | null) => ({ type: 'Feature' as const, properties: { district_id: id } as never, geometry })
const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]

const SYNTH: GeoCollection<never> = {
  type: 'FeatureCollection',
  features: [
    feat(1, { type: 'Polygon', coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)] }), // a square with a hole
    feat(2, { type: 'MultiPolygon', coordinates: [[square(20, 0, 30, 10)], [square(40, 0, 50, 10)]] }),
    feat(3, null),
  ],
}

describe('seatAtPoint (synthetic shapes)', () => {
  it('finds the seat that holds the point', () => {
    expect(seatAtPoint(SYNTH, 2, 2)).toBe(1)
    expect(seatAtPoint(SYNTH, 45, 5)).toBe(2)
  })
  it('treats a hole as outside the seat', () => expect(seatAtPoint(SYNTH, 5, 5)).toBeNull())
  it('returns null outside every seat, and skips a seat with no geometry', () => {
    expect(seatAtPoint(SYNTH, 15, 5)).toBeNull()
    expect(seatAtPoint(SYNTH, -3, -3)).toBeNull()
  })
  it('rejects points that are not finite coordinates', () => {
    expect(seatAtPoint(SYNTH, Number.NaN, 5)).toBeNull()
    expect(seatAtPoint(SYNTH, 5, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

// The 2026 district shapes ingest wrote (git-ignored), so this skips on a machine without them.
const here = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.resolve(here, '../../../../../../packages/ingest/out/se26/static/districts.geojson')
const has = fs.existsSync(FILE)

describe.skipIf(!has)('seatAtPoint (the 2026 districts)', () => {
  const real = has ? (JSON.parse(fs.readFileSync(FILE, 'utf8')) as GeoCollection<{ district_id: number; short_name: string }>) : null
  const nameAt = (lon: number, lat: number): string | null => {
    const id = seatAtPoint(real!, lon, lat)
    return id === null ? null : (real!.features.find((f) => f.properties.district_id === id)?.properties.short_name ?? null)
  }
  it('puts a point in Albert Park in Albert Park', () => expect(nameAt(144.9535, -37.8434)).toBe('Albert Park'))
  it('puts Horsham in Lowan', () => expect(nameAt(142.2, -36.71)).toBe('Lowan'))
  it('finds nothing for a point in Bass Strait', () => expect(nameAt(144.5, -39.5)).toBeNull())
  it('finds nothing for a point in New South Wales', () => {
    expect(nameAt(151.2093, -33.8688)).toBeNull() // Sydney
    expect(nameAt(146.9, -36.08)).toBeNull() // Albury, just over the Murray
  })
  it('finds a seat for any point from a coarse grid inside Victoria (no gaps in the shapes)', () => {
    for (const [lon, lat] of [[144.96, -37.81], [143.85, -37.56], [147.13, -36.38], [146.0, -38.1], [141.3, -37.8]] as const) {
      expect(nameAt(lon, lat), `${lon},${lat}`).not.toBeNull()
    }
  })
})

describe('locateSeat (the button tap)', () => {
  const ok = (lon: number, lat: number): GeoLike => ({ getCurrentPosition: (res) => res({ coords: { longitude: lon, latitude: lat } }) })
  const fail = (code: number): GeoLike => ({ getCurrentPosition: (_res, rej) => rej?.({ code }) })

  it('resolves to the seat id when the point is in a seat', async () => {
    await expect(locateSeat(SYNTH, ok(2, 2))).resolves.toEqual({ ok: true, id: 1 })
  })
  it('says outside when the point is not in Victoria', async () => {
    await expect(locateSeat(SYNTH, ok(15, 5))).resolves.toEqual({ ok: false, reason: 'outside' })
  })
  it('says denied when the reader refuses', async () => {
    await expect(locateSeat(SYNTH, fail(1))).resolves.toEqual({ ok: false, reason: 'denied' })
  })
  it('says unavailable when the device cannot tell, or times out', async () => {
    await expect(locateSeat(SYNTH, fail(2))).resolves.toEqual({ ok: false, reason: 'unavailable' })
    await expect(locateSeat(SYNTH, fail(3))).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })
  it('says unsupported with no geolocation at all', async () => {
    await expect(locateSeat(SYNTH, undefined)).resolves.toEqual({ ok: false, reason: 'unsupported' })
  })
})
