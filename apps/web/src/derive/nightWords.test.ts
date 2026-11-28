import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_REPLAY_LABEL } from '../replayLabel'
import { nightWords, setSimulation, simulationOf } from './nightWords'

const FINAL = { source: 'VE-267 made-up 2026 night ... on the final-week poll average (Labor 20.0)', simulation: { model: { file: 'pick_draw.py (VE-222 model on the VE-267 final-week average)' } } }
const OTHER = { source: 'VE-256 made-up 2026 night (polling averages to 13 Nov 2026)', simulation: { model: { file: 'pick_draw.py (VE-222 main variant)' } } }

describe('simulationOf', () => {
  it('reads the simulation block, naming final polls only when the manifest does', () => {
    expect(simulationOf(FINAL)).toEqual({ finalPolls: true })
    expect(simulationOf(OTHER)).toEqual({ finalPolls: false })
  })
  it('is null for the 2022 replay (no block)', () => {
    expect(simulationOf({ source: 'VEC 2022 results' })).toBeNull()
  })
})

describe('nightWords', () => {
  beforeEach(() => setSimulation(null))

  it('keeps the 2022 replay wording exactly', () => {
    const w = nightWords('Replay')!
    expect(w.badge).toEqual({ lead: 'Replay', more: `: ${DEFAULT_REPLAY_LABEL}`, tail: '' })
    expect(w.marker).toBe('Replay of the 2022 count, not live results')
    expect(w.pill).toBe('Replay of 2022')
    expect(w.infoLead).toBe('Replay:')
  })
  it('says simulated from final polls', () => {
    setSimulation({ finalPolls: true })
    const w = nightWords('Replay')!
    expect(w.badge).toEqual({ lead: 'Simulated', more: ' from final polls', tail: ', not live' })
    expect(w.marker).toBe('Simulated night from polls, not live results')
    expect(w.pill).toBe('Simulated')
    expect(w.infoLead).toBe('Simulated:')
    expect(w.infoLine).toBe('made-up results from polls, not live')
  })
  it('says simulated from polls when the manifest names no final average', () => {
    setSimulation({ finalPolls: false })
    expect(nightWords('Replay')!.badge).toEqual({ lead: 'Simulated', more: ' from polls', tail: ', not live' })
  })
  it('leaves trial and not-live alone, even on a sim night', () => {
    setSimulation({ finalPolls: true })
    expect(nightWords('Trial')!.marker).toBe('Trial data, not live results')
    expect(nightWords('Trial')!.pill).toBe('Trial data')
    expect(nightWords('Not live')!.marker).toBe('Not live results')
    expect(nightWords('Not live')!.pill).toBe('Not live')
  })
  it('has no words for live data', () => {
    expect(nightWords(null)).toBeNull()
  })
})
