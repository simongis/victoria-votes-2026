import { describe, expect, it } from 'vitest'
import { DEFAULT_REPLAY_LABEL, replayLabel } from './replayLabel'

describe('replayLabel (VE-254)', () => {
  it('defaults to the 2022 wording', () => {
    expect(DEFAULT_REPLAY_LABEL).toBe('2022, not live')
    expect(replayLabel(undefined, true)).toBe('2022, not live')
  })
  it('takes the override in dev and preview, never empty, and ignores it in a production build', () => {
    expect(replayLabel('simulated 2026 night, not live', true)).toBe('simulated 2026 night, not live')
    expect(replayLabel('', true)).toBe('2022, not live')
    expect(replayLabel('   ', true)).toBe('2022, not live')
    expect(replayLabel('simulated', false)).toBe('2022, not live')
    // A non-dev build (production or preview) passes allowed=false, so it always uses the default.
    expect(replayLabel('simulated 2026 night', false)).toBe(DEFAULT_REPLAY_LABEL)
  })
})
