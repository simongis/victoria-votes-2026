import { describe, expect, it } from 'vitest'
import { fpDisclosureLabel, heldLine, informalShare, nightSides, replayNote, swingLine, votesRounded } from './panel'

describe('informalShare', () => {
  it('is informal votes as a share of all votes cast', () => {
    expect(informalShare(410, 10_000)).toBeCloseTo(4.1, 5)
  })
  it('is null with no total or no informal figure', () => {
    expect(informalShare(null, 1000)).toBeNull()
    expect(informalShare(10, null)).toBeNull()
    expect(informalShare(10, 0)).toBeNull()
  })
})

describe('fpDisclosureLabel', () => {
  it('counts the candidates, singular and plural', () => {
    expect(fpDisclosureLabel(6)).toBe('First preferences, 6 candidates')
    expect(fpDisclosureLabel(1)).toBe('First preferences, 1 candidate')
  })
  it('drops the count when none are known', () => {
    expect(fpDisclosureLabel(0)).toBe('First preferences')
  })
})

describe('swingLine', () => {
  it('says which way and since when', () => {
    expect(swingLine(2.4, '2022')).toBe('2.4% swing to Labor since 2022')
    expect(swingLine(-1.26, '2025 by-election')).toBe('1.3% swing from Labor since 2025 by-election')
  })
  it('says no swing when it rounds to zero', () => {
    expect(swingLine(0.02, '2022')).toBe('No swing since 2022')
  })
  it('is null when the swing is withheld', () => {
    expect(swingLine(null, '2022')).toBeNull()
  })
})

describe('votesRounded (VE-109)', () => {
  it('rounds to the nearest 100 under 10,000 and the nearest 1,000 above', () => {
    expect(votesRounded(5650)).toBe(5700)
    expect(votesRounded(25_812)).toBe(26_000)
    expect(votesRounded(9_949)).toBe(9_900)
    expect(votesRounded(10_400)).toBe(10_000)
    expect(votesRounded(0)).toBe(0)
  })
})

describe('heldLine (VE-129, FB-145)', () => {
  it('names the 2022 holder as a short line for the top of the panel', () => {
    expect(heldLine('Labor', '2022')).toBe('Held by Labor (2022)')
    expect(heldLine('Liberal', '2025 by-election')).toBe('Held by Liberal (2025 by-election)')
  })
  it('says new seat when there was no holder', () => {
    expect(heldLine(null, '2022')).toBe('New seat')
  })
})

describe('nightSides', () => {
  it('words the two halves of the night line by the holder', () => {
    expect(nightSides('Labor')).toEqual({ above: 'Labor ahead', below: 'Labor behind' })
    expect(nightSides(null)).toEqual({ above: 'Holder ahead', below: 'Holder behind' })
  })
})

// VE-226 (finding 13): replay only. Narracan's 2022 contest was postponed after a candidate died; the supplementary
// election was in January 2023, so the 2022 feed has no Narracan votes.
describe('replayNote', () => {
  it('explains Narracan on the 2022 replay', () => {
    expect(replayNote('Replay', 'NARRACAN_SUPP_2023')).toBe('Postponed in 2022: Narracan voted at a supplementary election in January 2023, so this replay has no figures for it.')
  })
  it('says nothing on live or trial data, or for any other seat', () => {
    expect(replayNote(null, 'NARRACAN_SUPP_2023')).toBeNull()
    expect(replayNote('Trial', 'NARRACAN_SUPP_2023')).toBeNull()
    expect(replayNote('Replay', 'SE2022')).toBeNull()
  })
})
