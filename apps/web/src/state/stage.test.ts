import { describe, expect, it } from 'vitest'
import { createStageStore } from './stage'

describe('stage store', () => {
  it('notifies on a change and stays quiet when nothing changed', () => {
    const s = createStageStore()
    let n = 0
    const off = s.subscribe(() => n++)
    s.set({ active: true, counts: null })
    s.set({ active: true, counts: null })
    expect(n).toBe(1)
    s.set({ active: true, counts: { alp: 3, coalition: 2, settle: 0.5 } })
    s.set({ active: true, counts: { alp: 3, coalition: 2, settle: 0.5 } })
    expect(n).toBe(2)
    off()
    s.set({ active: false, counts: null })
    expect(n).toBe(2)
    expect(s.get().active).toBe(false)
  })
})
