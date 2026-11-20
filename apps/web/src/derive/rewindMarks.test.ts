import { describe, expect, it } from 'vitest'
import { pickMarks, type Mark } from './rewindMarks'

// A 200 px track whose end labels take 40 px (left) and 24 px (right); labels are 22 px wide, so 8 px apart needs 30 px centres.
const T = { width: 200, leftEnd: 40, rightEnd: 24, gap: 8 }
const mk = (xs: number[], w = 22): Mark[] => xs.map((x, i) => ({ x, w, label: `L${i}` }))
const labels = (m: Mark[], idx: number[]) => idx.map((i) => m[i]!.label)

describe('pickMarks', () => {
  it('keeps every hour when they all fit', () => {
    const m = mk([70, 110, 150])
    expect(pickMarks(m, T)).toEqual([0, 1, 2])
  })

  it('falls back to every second hour when all do not fit', () => {
    const m = mk([60, 80, 100, 120, 140, 160])
    const out = pickMarks(m, T)
    expect(out.length).toBeGreaterThan(1)
    // Every kept pair is exactly two apart.
    for (let i = 1; i < out.length; i++) expect(out[i]! - out[i - 1]!).toBe(2)
  })

  it('falls back to every third hour when every second still crowds', () => {
    const m = mk([60, 70, 80, 90, 100, 110, 120, 130, 140])
    const out = pickMarks(m, T)
    for (let i = 1; i < out.length; i++) expect(out[i]! - out[i - 1]!).toBe(3)
    expect(out.length).toBeGreaterThan(0)
  })

  it('never lets two kept labels, or a label and an end label, come within the gap', () => {
    const m = mk([50, 62, 74, 86, 98, 110, 122, 134, 146, 158])
    const out = pickMarks(m, T)
    const kept = out.map((i) => m[i]!)
    for (let i = 1; i < kept.length; i++) expect(kept[i]!.x - kept[i]!.w / 2 - (kept[i - 1]!.x + kept[i - 1]!.w / 2)).toBeGreaterThanOrEqual(8)
    expect(kept[0]!.x - kept[0]!.w / 2).toBeGreaterThanOrEqual(T.leftEnd + 8)
    expect(kept.at(-1)!.x + kept.at(-1)!.w / 2).toBeLessThanOrEqual(T.width - T.rightEnd - 8)
  })

  it('drops an hour that sits under an end label rather than overlapping it', () => {
    const m = mk([44, 100, 150])
    expect(labels(m, pickMarks(m, T))).toEqual(['L1', 'L2'])
  })

  it('returns nothing for nothing, and a lone hour that fits', () => {
    expect(pickMarks([], T)).toEqual([])
    expect(pickMarks(mk([100]), T)).toEqual([0])
  })

  it('returns nothing when the track is too narrow for any label', () => {
    expect(pickMarks(mk([30]), { width: 60, leftEnd: 40, rightEnd: 24, gap: 8 })).toEqual([])
  })
})
