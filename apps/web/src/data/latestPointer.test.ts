import { describe, expect, it } from 'vitest'
import { parsePointer, pointerIsStale, POINTER_STALE_MS } from './latestPointer'

const good = {
  snapshot_id: '20221126_210000',
  snapshot_at: 1_000,
  snapshot_url: 'https://x.test/s.json',
  state: 'live',
  data_mode: 'live',
  written_at: '2026-11-28T10:00:00.000Z',
}

describe('latest.json pointer', () => {
  it('reads the fields the ingest Function writes', () => {
    expect(parsePointer(good)).toMatchObject({ snapshotId: '20221126_210000', snapshotAt: 1_000, state: 'live' })
  })
  it('rejects anything malformed rather than guessing', () => {
    expect(parsePointer(null)).toBeNull()
    expect(parsePointer({ ...good, snapshot_id: 7 })).toBeNull()
    expect(parsePointer({ ...good, state: 'sideways' })).toBeNull()
    expect(parsePointer({ ...good, written_at: 'not a date' })).toBeNull()
  })
  it('is stale when written long ago, so the AGOL status row is trusted instead', () => {
    const p = parsePointer(good)!
    const at = Date.parse(good.written_at)
    expect(pointerIsStale(p, at + POINTER_STALE_MS - 1)).toBe(false)
    expect(pointerIsStale(p, at + POINTER_STALE_MS + 1)).toBe(true)
  })
})
