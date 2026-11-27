import { describe, expect, it } from 'vitest'
import type { StatusAttributes } from '@vic26/schema'
import { isStatusRow, notLiveMarker, shouldFetch, staleLine, statusView } from './status'

const status = (over: Partial<StatusAttributes> = {}): StatusAttributes => ({
  state: 'live',
  message: null,
  snapshot_id: '20221126_210000',
  snapshot_at: 1,
  ingested_at: 1,
  seats_ALP: 0,
  seats_LIB: 0,
  seats_NAT: 0,
  seats_GRN: 0,
  seats_ONP: 0,
  seats_IND: 0,
  seats_OTH: 0,
  seats_declared: 0,
  seats_in_doubt: 0,
  votes_counted_pct: 0,
  feed_phase: null,
  data_mode: 'live',
  ...over,
})

describe('statusView', () => {
  it('forces the Replay label whenever the source is a replay, whatever the status row says', () => {
    expect(statusView(status({ data_mode: 'live' }), 'replay').dataLabel).toBe('Replay')
    expect(statusView(status({ data_mode: 'trial' }), 'replay').dataLabel).toBe('Replay')
    expect(statusView(null, 'replay').dataLabel).toBe('Replay')
    expect(statusView(status({ data_mode: 'live' }), 'agol').dataLabel).toBeNull()
  })

  it('shows results with no banner when live', () => {
    const v = statusView(status())
    expect(v.mode).toBe('results')
    expect(v.banner).toBeNull()
    expect(v.dataLabel).toBeNull()
  })
  it('still shows an operator message while live', () => {
    expect(statusView(status({ message: 'Count resumes 9 am Sunday' })).banner).toBe('Count resumes 9 am Sunday')
  })
  it('holds the last good data with a banner when paused', () => {
    const v = statusView(status({ state: 'paused' }))
    expect(v.mode).toBe('held')
    expect(v.banner).toMatch(/paused/i)
  })
  it('uses the operator message as the paused banner when there is one', () => {
    expect(statusView(status({ state: 'paused', message: 'Checking a figure' })).banner).toBe('Checking a figure')
  })
  it('shows the holding page when offline', () => {
    const v = statusView(status({ state: 'offline', message: null }))
    expect(v.mode).toBe('offline')
    expect(v.banner).toMatch(/offline/i)
  })
  it('treats an unknown state as held, never as live', () => {
    const v = statusView(status({ state: 'maybe' as StatusAttributes['state'] }))
    expect(v.mode).toBe('held')
  })
  it('labels replay and trial data so it is never passed off as live', () => {
    expect(statusView(status({ data_mode: 'replay' })).dataLabel).toBe('Replay')
    expect(statusView(status({ data_mode: 'trial' })).dataLabel).toBe('Trial')
    expect(statusView(status({ data_mode: 'other' as StatusAttributes['data_mode'] })).dataLabel).toBe('Not live')
  })
  it('waits before the first status arrives', () => {
    const v = statusView(null)
    expect(v.mode).toBe('waiting')
  })
})

describe('notLiveMarker (VE-149)', () => {
  it('words each kind of not-live data, never as a live result', () => {
    expect(notLiveMarker('Replay')).toBe('Replay of the 2022 count, not live results')
    expect(notLiveMarker('Trial')).toBe('Trial data, not live results')
    expect(notLiveMarker('Not live')).toBe('Not live results')
  })
  it('an AGOL source whose status says trial or replay is marked, one that says live is not', () => {
    expect(statusView(status({ data_mode: 'trial' }), 'agol').dataLabel).toBe('Trial')
    expect(statusView(status({ data_mode: 'replay' }), 'agol').dataLabel).toBe('Replay')
    expect(statusView(status({ data_mode: 'live' }), 'agol').dataLabel).toBeNull()
  })
})

describe('shouldFetch', () => {
  // `held` is the stamp of the data on screen (null before any), not the previous status row: after a pause
  // the status row has moved on while the screen has not.
  const held = { snapshot_id: '20221126_210000', ingested_at: 1 }
  it('fetches on the first live status', () => {
    expect(shouldFetch(null, status())).toBe(true)
  })
  it('fetches when the snapshot id changes', () => {
    expect(shouldFetch(held, status({ snapshot_id: '20221126_210500' }))).toBe(true)
  })
  it('fetches when the ingest time changes on the same snapshot (a re-run)', () => {
    expect(shouldFetch(held, status({ ingested_at: 2 }))).toBe(true)
  })
  it('does nothing when nothing changed', () => {
    expect(shouldFetch(held, status())).toBe(false)
  })
  it('holds last good when paused, even if ingest moved on', () => {
    expect(shouldFetch(held, status({ state: 'paused', snapshot_id: '20221126_210500' }))).toBe(false)
  })
  it('fetches once when paused and there is nothing to hold yet', () => {
    expect(shouldFetch(null, status({ state: 'paused' }))).toBe(true)
  })
  it('never fetches when offline', () => {
    expect(shouldFetch(null, status({ state: 'offline' }))).toBe(false)
    expect(shouldFetch(held, status({ state: 'offline', snapshot_id: 'x' }))).toBe(false)
  })
  it('catches up when back to live after a pause', () => {
    expect(shouldFetch(held, status({ snapshot_id: '20221126_211000' }))).toBe(true)
  })
})

describe('isStatusRow', () => {
  it('accepts a well-formed row, including the nullable fields before the first snapshot', () => {
    expect(isStatusRow(status())).toBe(true)
    expect(isStatusRow(status({ snapshot_at: null, ingested_at: null, votes_counted_pct: null, seats_declared: null }))).toBe(true)
  })
  it('rejects non-objects and unknown states or data modes', () => {
    expect(isStatusRow(null)).toBe(false)
    expect(isStatusRow('live')).toBe(false)
    expect(isStatusRow({ ...status(), state: 'on' })).toBe(false)
    expect(isStatusRow({ ...status(), data_mode: 'demo' })).toBe(false)
    expect(isStatusRow({ ...status(), data_mode: undefined })).toBe(false)
  })
  it('rejects percentages outside 0 to 100 and seat counts outside 0 to 88', () => {
    expect(isStatusRow(status({ votes_counted_pct: 100 }))).toBe(true)
    expect(isStatusRow(status({ votes_counted_pct: 100.5 }))).toBe(false)
    expect(isStatusRow(status({ votes_counted_pct: -1 }))).toBe(false)
    expect(isStatusRow(status({ seats_ALP: 88 }))).toBe(true)
    expect(isStatusRow(status({ seats_ALP: 89 }))).toBe(false)
    expect(isStatusRow(status({ seats_declared: -1 }))).toBe(false)
    expect(isStatusRow(status({ seats_in_doubt: 1000 }))).toBe(false)
  })
  it('rejects NaN, Infinity and non-number values', () => {
    expect(isStatusRow(status({ votes_counted_pct: NaN }))).toBe(false)
    expect(isStatusRow(status({ seats_LIB: Infinity }))).toBe(false)
    expect(isStatusRow(status({ snapshot_at: Infinity }))).toBe(false)
    expect(isStatusRow({ ...status(), seats_GRN: '3' })).toBe(false)
    expect(isStatusRow({ ...status(), snapshot_at: '1' })).toBe(false)
  })
})

describe('staleLine', () => {
  const NOW = Date.UTC(2026, 10, 28, 12, 0, 0)
  const fmt = (ms: number) => (ms === NOW - 20 * 60_000 ? '9:40 pm' : '?')
  it('says nothing when live data is fresh (15 minutes or less)', () => {
    expect(staleLine(status({ ingested_at: NOW - 15 * 60_000 }), NOW, fmt)).toBeNull()
    expect(staleLine(status({ ingested_at: NOW - 60_000 }), NOW, fmt)).toBeNull()
  })
  it('warns when ingested_at is more than 15 minutes old while live', () => {
    expect(staleLine(status({ ingested_at: NOW - 20 * 60_000 }), NOW, fmt)).toBe('Last updated 9:40 pm. Results may be behind.')
  })
  it('warns without a time when ingested_at is missing', () => {
    expect(staleLine(status({ ingested_at: null }), NOW, fmt)).toBe('Results may be behind.')
  })
  it('says nothing before any snapshot exists, whatever ingested_at is (VE-265: nothing can be behind yet)', () => {
    expect(staleLine(status({ snapshot_id: null, ingested_at: null }), NOW, fmt)).toBeNull()
    expect(staleLine(status({ snapshot_id: null, ingested_at: NOW - 20 * 60_000 }), NOW, fmt)).toBeNull()
    expect(staleLine(status({ snapshot_id: undefined as unknown as null, ingested_at: null }), NOW, fmt)).toBeNull()
  })
  it('says nothing when held, offline or there is no row', () => {
    expect(staleLine(status({ state: 'paused', ingested_at: 1 }), NOW, fmt)).toBeNull()
    expect(staleLine(status({ state: 'offline', ingested_at: 1 }), NOW, fmt)).toBeNull()
    expect(staleLine(null, NOW, fmt)).toBeNull()
  })
  it('judges by the clock it is given (replay and made-up nights use their own)', () => {
    expect(staleLine(status({ ingested_at: 1_000 }), 1_000 + 5 * 60_000, fmt)).toBeNull()
  })
})

describe('statusView in a public build', () => {
  it('shows a trial or replay row as held, Not live, with the figures hidden', () => {
    for (const data_mode of ['trial', 'replay'] as const) {
      const v = statusView(status({ data_mode }), 'agol', { publicBuild: true })
      expect(v.mode).toBe('held')
      expect(v.banner).toBe('Not live results')
      expect(v.dataLabel).toBe('Not live')
      expect(v.hideFigures).toBe(true)
    }
  })
  it('leaves a live row alone, and leaves dev builds unchanged', () => {
    expect(statusView(status(), 'agol', { publicBuild: true })).toEqual({ mode: 'results', banner: null, dataLabel: null })
    expect(statusView(status({ data_mode: 'trial' }), 'agol')).toEqual({ mode: 'results', banner: null, dataLabel: 'Trial' })
  })
  it('honours an offline state first', () => {
    expect(statusView(status({ data_mode: 'trial', state: 'offline' }), 'agol', { publicBuild: true }).mode).toBe('offline')
  })
})
