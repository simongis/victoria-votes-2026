import { describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import { HEADLINE_MIN_PCT, headlineParts, headlineText, legibleOn, shortHeadlineParts } from './headline'
import type { Rgb } from '../theme/theme'
import type { Tally } from './seats'

const zero = (): Record<PartyBucket, number> => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0 })
/** A tally from firm and leading counts by party; anything unnamed is zero. */
const tally = (firm: Partial<Record<PartyBucket, number>>, leading: Partial<Record<PartyBucket, number>> = {}): Tally => ({
  firm: { ...zero(), ...firm },
  leading: { ...zero(), ...leading },
})

const won = (w: Partial<Record<PartyBucket, number>>): Record<PartyBucket, number> => ({ ...zero(), ...w })

describe('headline', () => {
  it('gives a plural party name a plural verb (VE-226, finding 17)', () => {
    expect(headlineText(headlineParts(tally({ GRN: 30 }, { ALP: 12 }), 4))).toBe('Greens lead Labor by 18 seats. They need 15 more.')
    expect(headlineText(headlineParts(tally({ IND: 46 }, { ALP: 12 }), 4))).toBe('Independents lead in 46 seats, 1 more than the 45 they need.')
    expect(headlineText(headlineParts(tally({ GRN: 46 }), 0, won({ GRN: 46 }), null, true))).toBe('Greens have won 46 seats, 1 more than the 45 they needed.')
    expect(headlineText(shortHeadlineParts(tally({ GRN: 30 }, { ALP: 12 }), 4))).toBe('Greens lead in 30 of 88')
    expect(headlineText(shortHeadlineParts(tally({ GRN: 46 }), 0, won({ GRN: 46 }), null, true))).toBe('Greens have won 46 of 88')
  })

  it('below a majority: the gap, what the leader needs, and how many could still change', () => {
    const parts = headlineParts(tally({ LIB: 20 }, { LIB: 10, NAT: 7, ALP: 24 }), 24)
    expect(headlineText(parts)).toBe('Coalition leads Labor by 13 seats. It needs 8 more.')
    // The party names carry their side so the band can set them in party colour.
    expect(parts.filter((p) => p.side).map((p) => [p.text, p.side])).toEqual([['Coalition', 'COA'], ['Labor', 'ALP']])
    expect(headlineText(headlineParts(tally({ LIB: 20 }, { LIB: 10, NAT: 2, ALP: 29 }), 24))).toBe('Coalition leads Labor by 3 seats. It needs 13 more.')
  })

  it('VE-285: when only early leads reach 45 (sure seats short of it), it says what wins, not that the lead beats the 45', () => {
    const t = tally({ ALP: 6 }, { ALP: 48 })
    expect(headlineText(headlineParts(t, 10, zero(), 40, false, won({ ALP: 6 })))).toBe('Labor leads in 54 seats. 45 wins a majority.')
    expect(headlineText(headlineParts(t, 10, zero(), 40, false, won({ ALP: 45 })))).toBe('Labor leads in 54 seats, 9 more than the 45 it needs.')
  })

  it('at or over a majority: the margin over the line, and what could still change', () => {
    expect(headlineText(headlineParts(tally({ ALP: 44 }, { ALP: 10, LIB: 20 }), 10))).toBe('Labor leads in 54 seats, 9 more than the 45 it needs.')
    // Exactly 45 is a majority of 88.
    expect(headlineText(headlineParts(tally({ LIB: 30, NAT: 5 }, { LIB: 10 }), 0))).toBe('Coalition leads in 45 seats, exactly the 45 it needs. No seats could still change.')
    expect(headlineText(headlineParts(tally({ ALP: 40 }, { ALP: 6, LIB: 20 }), 1))).toBe('Labor leads in 46 seats, 1 more than the 45 it needs.')
  })

  it('says has won only when every one of the leader\'s seats is a VEC-declared win and none is in doubt', () => {
    const t = tally({ ALP: 54 })
    expect(headlineText(headlineParts(t, 0, won({ ALP: 54 }), null, true))).toBe('Labor has won 54 seats, 9 more than the 45 it needed.')
    // One lead not yet declared: still a lead.
    expect(headlineText(headlineParts(t, 0, won({ ALP: 53 }), null, true))).toBe('Labor has a majority: 53 seats declared.')
    // Anything still in doubt: still a lead.
    expect(headlineText(headlineParts(t, 2, won({ ALP: 54 }), null, true))).toBe('Labor has a majority: 54 seats declared.')
    // Declared wins below a majority never say won.
    expect(headlineText(headlineParts(tally({ ALP: 30 }, { LIB: 10 }), 0, won({ ALP: 30 })))).toBe('Labor leads Coalition by 20 seats. It needs 15 more. No seats could still change.')
    for (const c of [tally({ ALP: 54 }), tally({ ALP: 20 }, { LIB: 10 })]) expect(headlineText(headlineParts(c, 3))).not.toMatch(/\bwon\b|wins|government/i)
  })

  it('counts a Coalition win across Liberal and Nationals', () => {
    expect(headlineText(headlineParts(tally({ LIB: 40, NAT: 6 }), 0, won({ LIB: 40, NAT: 6 }), null, true))).toBe('Coalition has won 46 seats, 1 more than the 45 it needed.')
  })

  it('says "exactly the 45" for a bare majority, won or leading', () => {
    expect(headlineText(headlineParts(tally({ ALP: 45 }), 0, won({ ALP: 45 }), null, true))).toBe('Labor has won 45 seats, exactly the 45 it needed.')
  })

  it('level: each side needs the same, and how many could still change', () => {
    expect(headlineText(headlineParts(tally({ ALP: 20 }, { ALP: 20, LIB: 40 }), 8))).toBe('Labor and Coalition level on 40 seats. Each needs 5 more.')
    expect(headlineText(headlineParts(tally({ ALP: 44 }, { LIB: 44 }), 0))).toBe('Labor and Coalition level on 44 seats. Each needs 1 more. No seats could still change.')
  })

  it('uses singular words', () => {
    expect(headlineText(headlineParts(tally({ ALP: 10 }, { LIB: 10 }), 1))).toBe('Labor and Coalition level on 10 seats. Each needs 35 more.')
    expect(headlineText(headlineParts(tally({ ALP: 44, LIB: 1 }, { LIB: 0 }), 2))).toBe('Labor leads Coalition by 43 seats. It needs 1 more.')
    expect(headlineText(headlineParts(tally({ ALP: 11 }, { LIB: 10 }), 0))).toBe('Labor leads Coalition by 1 seat. It needs 34 more. No seats could still change.')
  })

  it('has the quiet line before anything is counted', () => {
    expect(headlineText(headlineParts(tally({}), 88))).toBe('Waiting for the first figures')
    expect(headlineParts(tally({}), 88).some((p) => p.side)).toBe(false)
  })

  it('ranks the two largest sides even when a crossbench side is second', () => {
    expect(headlineText(headlineParts(tally({ ALP: 30, GRN: 12 }, { LIB: 5 }), 4))).toBe('Labor leads Greens by 18 seats. It needs 15 more.')
  })
})

describe('legibleOn', () => {
  const lum = (c: readonly number[]) => {
    const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!)
  }
  const ratio = (a: readonly number[], b: readonly number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
  it('darkens a pale party colour on a light ground until it reads (at least 3:1 for bold text)', () => {
    const greens: Rgb = [0x4c, 0xbb, 0x3c]
    const paper: Rgb = [255, 255, 255]
    expect(ratio(greens, paper)).toBeLessThan(3)
    expect(ratio(legibleOn(greens, paper), paper)).toBeGreaterThanOrEqual(3)
  })
  it('leaves a colour that already reads alone, and lightens on a dark ground', () => {
    expect(legibleOn([0, 49, 116], [255, 255, 255])).toEqual([0, 49, 116])
    const out = legibleOn([10, 74, 74], [0, 0, 0])
    expect(ratio(out, [0, 0, 0])).toBeGreaterThanOrEqual(3)
  })
})

// VE-140 (a): the replay's Coalition lead at 7 pm (1% counted) flips to Labor by 1.4%; no side is named before 5%.
describe('early headline (VE-140)', () => {
  const early = tally({}, { LIB: 20, NAT: 6, ALP: 23 })
  it('says counting has started, and names no leader, below the minimum counted', () => {
    expect(headlineText(headlineParts(early, 49, won({}), 1))).toBe('First figures in 49 seats. Too early to call.')
    expect(headlineParts(early, 49, won({}), 4.9).some((p) => p.side)).toBe(false)
  })
  it('uses the singular for one seat (VE-167)', () => {
    expect(headlineText(headlineParts(tally({}, { ALP: 1 }), 1, won({}), 1))).toBe('First figures in 1 seat. Too early to call.')
  })
  it('names the leader from the minimum up, and when the share is not given', () => {
    expect(headlineText(headlineParts(early, 49, won({}), HEADLINE_MIN_PCT))).toMatch(/^Coalition leads Labor by 3 seats/)
    expect(headlineText(headlineParts(early, 49))).toMatch(/^Coalition leads/)
  })
  it('still waits for the first figures when nothing is in, at any share', () => {
    expect(headlineText(headlineParts(tally({}), 88, won({}), 0))).toBe('Waiting for the first figures')
  })
})

describe('shortHeadlineParts (the phone sheet handle, VE-144a)', () => {
  const short = (...a: Parameters<typeof shortHeadlineParts>) => headlineText(shortHeadlineParts(...a))

  it('0% counted with no figures: waits, names no one', () => {
    expect(short(tally({}), 0, won({}), 0)).toBe('Waiting for the first figures')
  })

  it('1% counted: names no one even with a lead (VE-140)', () => {
    expect(short(tally({}, { ALP: 12, LIB: 3 }), 15, won({}), 1)).toBe('First figures in 15 seats. Too early to call.')
    expect(HEADLINE_MIN_PCT).toBe(5)
  })

  it('30% counted: who leads in how many of 88, without the majority', () => {
    const parts = shortHeadlineParts(tally({ ALP: 10 }, { ALP: 44, LIB: 20 }), 30, won({}), 30)
    expect(headlineText(parts)).toBe('Labor leads in 54 of 88')
    expect(parts.find((p) => p.side)?.side).toBe('ALP')
  })

  it('level, and a Coalition count across Liberal and Nationals', () => {
    expect(short(tally({ ALP: 20 }, { ALP: 20, LIB: 40 }), 8, won({}), 30)).toBe('Labor and Coalition level on 40')
    expect(short(tally({ LIB: 30, NAT: 6 }, { LIB: 4 }), 8, won({}), 30)).toBe('Coalition leads in 40 of 88')
  })

  it('final: has won only when all are declared and none is in doubt; never calls government', () => {
    expect(short(tally({ ALP: 54 }), 0, won({ ALP: 54 }), 100, true)).toBe('Labor has won 54 of 88')
    expect(short(tally({ ALP: 54 }), 0, won({ ALP: 53 }), 100, true)).toBe('Labor has a majority: 53 declared')
    expect(short(tally({ ALP: 54 }), 2, won({ ALP: 54 }), 99, true)).toBe('Labor has a majority: 54 declared')
    expect(short(tally({ ALP: 30 }, { LIB: 10 }), 0, won({ ALP: 30 }), 100)).not.toMatch(/won|government/i)
  })

  it('a null counted share skips the 5% test', () => {
    expect(short(tally({ ALP: 5 }), 3, won({}), null)).toBe('Labor leads in 5 of 88')
  })
})

// VE-153: once every seat is declared and none is in doubt, the headline reads as a result, not a lead.
describe('headline at Final without a majority (VE-153)', () => {
  const allWon = won({ ALP: 42, LIB: 20, NAT: 8, GRN: 4, IND: 2 })
  const t = tally({ ALP: 42, LIB: 20, NAT: 8, GRN: 4, IND: 2 })
  it('says who won how many, and that no one has a majority, with no "leads", "needs" or "could still change"', () => {
    const text = headlineText(headlineParts(t, 0, allWon, 87, true))
    expect(text).toBe('Labor won 42 seats and Coalition 28. No party has the 45 needed for a majority.')
    expect(text).not.toMatch(/leads|needs|could still change/)
  })
  it('names both sides when level', () => {
    expect(headlineText(headlineParts(tally({ ALP: 44, LIB: 44 }), 0, won({ ALP: 44, LIB: 44 }), null, true))).toBe('Labor and Coalition won 44 seats each. No party has the 45 needed for a majority.')
  })
  it('keeps the lead words while any seat is not declared', () => {
    expect(headlineText(headlineParts(t, 0, won({ ALP: 41, LIB: 20, NAT: 8, GRN: 4, IND: 2 })))).toMatch(/leads Coalition/)
  })
  it('the phone line says won, not leads in, at Final', () => {
    expect(headlineText(shortHeadlineParts(t, 0, allWon, 87, true))).toBe('Labor won 42 of 88')
  })
})

// VE-257 (Simon, 26 Nov: "we can't get this wrong"): only VEC declarations say a party has a majority.
describe('has a majority only from VEC declarations (VE-257)', () => {
  const long = (...a: Parameters<typeof headlineParts>) => headlineText(headlineParts(...a))
  const short = (...a: Parameters<typeof shortHeadlineParts>) => headlineText(shortHeadlineParts(...a))
  const lead = tally({ ALP: 60 }, { LIB: 20 })

  it('44 declared is still a lead, even with 60 seats leading', () => {
    expect(long(lead, 0, won({ ALP: 44 }), 50)).toBe('Labor leads in 60 seats, 15 more than the 45 it needs. No seats could still change.')
    expect(short(lead, 0, won({ ALP: 44 }), 50)).toBe('Labor leads in 60 of 88')
  })
  it('45 declared says has a majority, naming the declared count', () => {
    expect(long(lead, 3, won({ ALP: 45 }), 50)).toBe('Labor has a majority: 45 seats declared.')
    expect(short(lead, 3, won({ ALP: 45 }), 50)).toBe('Labor has a majority: 45 declared')
    expect(long(lead, 3, won({ ALP: 52 }), 50)).toBe('Labor has a majority: 52 seats declared.')
  })
  it('the party name still carries its side, so the band can colour it', () => {
    expect(headlineParts(lead, 3, won({ ALP: 45 }), 50).find((p) => p.side)?.side).toBe('ALP')
  })
  it('never says won, government or the election before every seat is declared', () => {
    for (const d of [0, 44, 45, 60]) {
      expect(long(lead, 0, won({ ALP: d }), 50)).not.toMatch(/\bwon\b|government|election/i)
      expect(short(lead, 0, won({ ALP: d }), 50)).not.toMatch(/\bwon\b|government|election/i)
    }
  })
  it('seats we call "won or certain" (firm, not declared) never count towards the majority', () => {
    // 60 firm seats, none declared: the tally is full of firm seats, the headline still only leads.
    expect(long(tally({ ALP: 60 }), 0, won({}), 50)).toMatch(/^Labor leads in 60 seats/)
    expect(long(tally({ ALP: 60 }), 0, won({}), 50)).not.toMatch(/majority:/)
  })
  it('a tie on declarations is a tie, not a majority', () => {
    expect(long(tally({ ALP: 44, LIB: 44 }), 0, won({ ALP: 44, LIB: 44 }), 90)).toBe('Labor and Coalition level on 44 seats. Each needs 1 more. No seats could still change.')
  })
  it('counts the Coalition as one side: 30 Liberal and 15 Nationals declared is 45', () => {
    expect(long(tally({ LIB: 30, NAT: 15 }), 0, won({ LIB: 30, NAT: 15 }), 50)).toBe('Coalition has a majority: 45 seats declared.')
    expect(long(tally({ LIB: 30, NAT: 14 }), 0, won({ LIB: 30, NAT: 14 }), 50)).toMatch(/^Coalition leads/)
  })
  it('a plural name takes a plural verb', () => {
    expect(long(tally({ IND: 45 }), 0, won({ IND: 45 }), 50)).toBe('Independents have a majority: 45 seats declared.')
  })
  it('all 88 declared: Final, as before (won, with the margin)', () => {
    expect(long(tally({ ALP: 60, LIB: 28 }), 0, won({ ALP: 60, LIB: 28 }), 90, true)).toBe('Labor has won 60 seats, 15 more than the 45 it needed.')
  })
  it('Final is only said when the caller says every seat is declared (87 of 88 stays a lead or a majority)', () => {
    expect(long(tally({ ALP: 60, LIB: 27 }), 0, won({ ALP: 60, LIB: 27 }), 90)).toBe('Labor has a majority: 60 seats declared.')
    expect(long(tally({ ALP: 30, LIB: 20 }), 0, won({ ALP: 30, LIB: 20 }), 90)).toMatch(/leads/)
  })
})

// VE-289: a hung parliament. Final with no side on 45 says so plainly and never "has a majority" or "will form government".
describe('hung parliament (VE-289)', () => {
  const hung = tally({ LIB: 34, NAT: 8, ALP: 29, ONP: 13, GRN: 4 })
  const decl = won({ LIB: 34, NAT: 8, ALP: 29, ONP: 13, GRN: 4 })

  it('at Final, the simulated hung night says no party has the 45 and names no government', () => {
    const text = headlineText(headlineParts(hung, 0, decl, null, true))
    expect(text).toBe('Coalition won 42 seats and Labor 29. No party has the 45 needed for a majority.')
    expect(text).not.toMatch(/has a majority|has won|govern/i)
    expect(headlineText(shortHeadlineParts(hung, 0, decl, null, true))).toBe('Coalition won 42 of 88')
  })

  it('a side on exactly 44 at Final is not a majority', () => {
    const t = tally({ ALP: 44, LIB: 30, ONP: 14 })
    const d = won({ ALP: 44, LIB: 30, ONP: 14 })
    expect(headlineText(headlineParts(t, 0, d, null, true))).toBe('Labor won 44 seats and Coalition 30. No party has the 45 needed for a majority.')
    expect(headlineText(shortHeadlineParts(t, 0, d, null, true))).toBe('Labor won 44 of 88')
  })

  it('exactly 45 declared is a majority, before and at Final', () => {
    const t = tally({ ALP: 45, LIB: 30, ONP: 13 })
    const d = won({ ALP: 45, LIB: 30, ONP: 13 })
    expect(headlineText(headlineParts(t, 0, d, null, true))).toBe('Labor has won 45 seats, exactly the 45 it needed.')
    expect(headlineText(headlineParts(t, 3, won({ ALP: 45 }), null, false))).toBe('Labor has a majority: 45 seats declared.')
  })

  it('the Coalition reaches 45 only when Liberal and Nationals are added', () => {
    const t = tally({ LIB: 37, NAT: 8, ALP: 30, ONP: 13 })
    const d = won({ LIB: 37, NAT: 8, ALP: 30, ONP: 13 })
    expect(headlineText(headlineParts(t, 0, d, null, true))).toBe('Coalition has won 45 seats, exactly the 45 it needed.')
    // Liberal alone (37) is nowhere near, yet the side counts.
    expect(headlineText(headlineParts(t, 3, won({ LIB: 37, NAT: 8 }), null, false))).toBe('Coalition has a majority: 45 seats declared.')
  })

  it('a tie for most seats at Final says level, never a winner', () => {
    const t = tally({ LIB: 30, NAT: 4, ALP: 34, ONP: 16, GRN: 4 })
    const d = won({ LIB: 30, NAT: 4, ALP: 34, ONP: 16, GRN: 4 })
    const text = headlineText(headlineParts(t, 0, d, null, true))
    expect(text).toMatch(/^(Labor and Coalition|Coalition and Labor) won 34 seats each\. No party has the 45 needed for a majority\.$/)
    expect(headlineText(shortHeadlineParts(t, 0, d, null, true))).toMatch(/level on 34$/)
  })

  it('during the night a hung count only leads, and says who needs how many more', () => {
    expect(headlineText(headlineParts(tally({ LIB: 20 }, { LIB: 14, NAT: 8, ALP: 29, ONP: 13, GRN: 4 }), 5, won({ LIB: 20 }), 60))).toBe('Coalition leads Labor by 13 seats. It needs 3 more.')
  })
})
