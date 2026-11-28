import { describe, expect, it } from 'vitest'
import { KEY_CYCLE_MS } from './StageControls'

describe('the Leader key cycle (VE-273, VE-308)', () => {
  it('moves to the next party every 4 s (Simon: "at least every 4s")', () => {
    expect(KEY_CYCLE_MS).toBe(4000)
  })
})
