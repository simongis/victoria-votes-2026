import { describe, expect, it } from 'vitest'
import type { DistrictStatic } from '@vic26/schema'
import { readPalette } from '../theme/theme'
import type { Seat } from './seats'
import { GAINS_KEEP } from './gains'
import { BLUR_PX, COLOURS, COUNTED_ALPHA, countedInk, countedRgb, countedScale, countedStep, TRUST_MIN_SEATS, trustReady, SWING_MIN_PCT, TRUST_NA, TRUST_PALETTE, certaintyBand, gainsTintRgb, laborSwing, marginOfTcp, seatPaint, strengthRgb, swingShown, trustAlpha, trustCell } from './colour'

const pal = readPalette(
  (n) => ({ '--party-alp': '#ff0000', '--map-tint-base': '#ffffff', '--map-tint-amount': '0.5', '--map-no-result': '#eeeeee', '--map-paper': '#000000' })[n] ?? '',
)
const st = (over: Partial<DistrictStatic> = {}) => ({ base_tcp_party_a: 'ALP', base_tcp_party_b: 'LIB', base_tcp_pct_a: 55, ...over }) as DistrictStatic
const seat = (over: Partial<Seat> = {}): Seat => ({ leader: 'ALP', state: 'firm', tcp: { a: 'ALP', b: 'LIB', pctA: 60 }, pct: 75, ...over }) as Seat
const rgbOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

describe('trust map cells', () => {
  it('measures the 2CP margin as 2 x (share - 50)', () => {
    expect(marginOfTcp(60)).toBeCloseTo(20)
    expect(marginOfTcp(40)).toBeCloseTo(20)
    expect(marginOfTcp(null)).toBeNull()
  })
  it('cuts margin at 10 and 25 points and swing at plus or minus 0.75 (flat inside)', () => {
    expect(trustCell(-1, 5)).toEqual({ margin: 0, swing: 0 })
    expect(trustCell(0.5, 5)).toEqual({ margin: 0, swing: 1 })
    expect(trustCell(1, 12)).toEqual({ margin: 1, swing: 2 })
    expect(trustCell(0, 30)).toEqual({ margin: 2, swing: 1 })
    expect(trustCell(-0.75, 10)).toEqual({ margin: 1, swing: 1 })
  })
  it('has no cell when either figure is missing', () => {
    expect(trustCell(null, 5)).toBeNull()
    expect(trustCell(1, null)).toBeNull()
  })
  it('opacity runs 0.1 at nothing counted to 1 at 75 percent', () => {
    expect(trustAlpha(0)).toBeCloseTo(0.1)
    expect(trustAlpha(75)).toBe(1)
    expect(trustAlpha(90)).toBe(1)
    expect(trustAlpha(37.5)).toBeCloseTo(0.55)
    expect(trustAlpha(null)).toBeCloseTo(0.1)
  })
})

describe('labor swing', () => {
  it('is the leader swing when Labor leads, minus it when Labor is the other candidate', () => {
    expect(laborSwing(seat(), st())).toBeCloseTo(5)
    const lib = seat({ leader: 'LIB', tcp: { a: 'LIB', b: 'ALP', pctA: 52 } })
    expect(laborSwing(lib, st({ base_tcp_party_a: 'LIB', base_tcp_party_b: 'ALP', base_tcp_pct_a: 50 }))).toBeCloseTo(-2)
  })
  it('is null with no Labor candidate or no comparable baseline', () => {
    expect(laborSwing(seat({ leader: 'LIB', tcp: { a: 'LIB', b: 'GRN', pctA: 52 } }), st({ base_tcp_party_a: 'LIB', base_tcp_party_b: 'GRN' }))).toBeNull()
    expect(laborSwing(seat({ tcp: null }), st())).toBeNull()
    expect(laborSwing(seat({ tcp: { a: 'ALP', b: 'GRN', pctA: 60 } }), st())).toBeNull()
  })
})

describe('swing honesty (VE-98)', () => {
  it('shows the swing at or above the threshold and holds it back below', () => {
    expect(swingShown(seat({ pct: SWING_MIN_PCT }), st())).toBeCloseTo(5)
    expect(swingShown(seat({ pct: SWING_MIN_PCT - 0.01 }), st())).toBeNull()
    expect(swingShown(seat({ pct: 0 }), st())).toBeNull()
    expect(swingShown(seat({ pct: null as never }), st())).toBeNull()
  })
  it('is still null with no comparable pairing or no Labor candidate, however much is counted', () => {
    expect(swingShown(seat({ pct: 90, tcp: null }), st())).toBeNull()
    expect(swingShown(seat({ pct: 90, tcp: { a: 'ALP', b: 'GRN', pctA: 60 } }), st())).toBeNull()
    expect(swingShown(seat({ pct: 90, leader: 'LIB', tcp: { a: 'LIB', b: 'GRN', pctA: 52 } }), st({ base_tcp_party_a: 'LIB', base_tcp_party_b: 'GRN' }))).toBeNull()
  })
})

describe('counted steps (VE-97)', () => {
  it('cuts at 25, 50 and 75 percent, lower edge inclusive', () => {
    expect([0, 24.9, 25, 49.9, 50, 74.9, 75, 90].map((p) => countedStep(p))).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
  })
  it('has no step without a count', () => {
    expect(countedStep(null)).toBeNull()
    expect(countedStep(undefined)).toBeNull()
  })
  it('keeps the prototype strengths, rising', () => {
    expect(COUNTED_ALPHA).toEqual([0.3, 0.55, 0.8, 1])
  })
  it('fills in one neutral ink at the step strength over the paper, whatever the leader', () => {
    // pal: paper black, so a dark ground gets the light ink.
    const ink = countedInk(pal)
    expect(countedRgb(10, pal)).toEqual(ink.map((c) => Math.round(c * 0.3)))
    expect(countedRgb(60, pal)).toEqual(ink.map((c) => Math.round(c * 0.8)))
    expect(countedRgb(80, pal)).toEqual(ink)
  })
  it('uses a light ink on a dark paper and a dark ink on a light one', () => {
    const light = readPalette((n) => ({ '--map-paper': '#ffffff' })[n] ?? '')
    expect(countedInk(light)[0]).toBeLessThan(80)
    expect(countedInk(pal)[0]).toBeGreaterThan(100)
  })
  it('uses the no-result fill for a seat with no count', () => {
    expect(countedRgb(null, pal)).toEqual([238, 238, 238])
  })
  it('offers three chips: Leader, Swing and Gains (VE-156); How sure is folded into Leader (VE-127)', () => {
    expect(COLOURS.map((c) => c.colour)).toEqual(['leader', 'trust', 'gains'])
  })
})

describe('when the chips apply (VE-104)', () => {
  const pcts = (n: number, pct: number) => Array.from({ length: n }, () => ({ pct }))
  it('Trust waits for 10 seats at or past the swing threshold', () => {
    expect(TRUST_MIN_SEATS).toBe(10)
    expect(trustReady([...pcts(9, SWING_MIN_PCT), ...pcts(70, SWING_MIN_PCT - 0.1)])).toBe(false)
    expect(trustReady([...pcts(10, SWING_MIN_PCT), ...pcts(70, 0)])).toBe(true)
    expect(trustReady([{ pct: null }, ...pcts(9, 80)])).toBe(false)
  })
})

describe('certainty bands', () => {
  it('0 to 30 blurred, 30 to 70 softer, 70 and over sharp', () => {
    expect([0, 29.9, 30, 69.9, 70, 100].map(certaintyBand)).toEqual([0, 0, 1, 1, 2, 2])
    expect(certaintyBand(null)).toBe(0)
    expect(BLUR_PX).toEqual([14, 5, 0])
  })
})

describe('seatPaint', () => {
  it('leader colour is the shared encoding and always sharp', () => {
    expect(seatPaint(seat(), st(), 'leader', pal, true)).toEqual({ rgb: [255, 0, 0], band: 2, lit: false, hatch: false })
  })
  it('leader runs faint, mid, solid (VE-127), and never blurs', () => {
    const early = seatPaint(seat({ state: 'leading', pct: 10 }), st(), 'leader', pal, true)
    // ADR 0033: the mid step is a Likely seat (count, margin and preferences), not a count alone.
    expect(seatPaint(seat({ state: 'leading', pct: 50 }), st(), 'leader', pal, true).rgb).toEqual([255, 128, 128])
    const likely = seatPaint(seat({ state: 'leading', pct: 50, likely: true }), st(), 'leader', pal, true)
    expect(early.rgb).toEqual([255, 128, 128])
    expect(likely.rgb).toEqual([255, 42, 42])
    expect(seatPaint(seat({ state: 'firm', pct: 50 }), st(), 'leader', pal, true).rgb).toEqual([255, 0, 0])
    expect(seatPaint(seat({ state: 'won' }), st(), 'leader', pal, true).rgb).toEqual([255, 0, 0])
    expect(early.band).toBe(2)
    expect(likely.band).toBe(2)
  })
  it('how sure keeps the pale tone for a leading seat, so it alone carries certainty', () => {
    const leading = seat({ state: 'leading', pct: 80 })
    expect(strengthRgb(leading, pal)).not.toEqual([255, 0, 0])
    expect(seatPaint(leading, st(), 'certainty', pal, true).rgb).toEqual(strengthRgb(leading, pal))
  })
  it('the chip reads Swing, not Trust, while the id stays trust', () => {
    expect(COLOURS.map((c) => c.label)).toEqual(['Leader', 'Swing', 'Changing hands'])
    expect(COLOURS[1]!.colour).toBe('trust')
  })
  it('certainty keeps the leader colour and adds the band', () => {
    expect(seatPaint(seat({ pct: 10 }), st(), 'certainty', pal, true)).toEqual({ rgb: [255, 0, 0], band: 0, lit: false, hatch: false })
  })
  it('trust fades the cell colour towards the paper by share counted', () => {
    // margin 20 -> row 1, swing +5 -> column 2
    const c = rgbOf(TRUST_PALETTE[1]![2]!)
    expect(seatPaint(seat({ pct: 80 }), st(), 'trust', pal, true).rgb).toEqual(c)
    // the paper is black here, so 10% of the colour is left (alpha is 0.1 + 0.9 * SWING_MIN_PCT / 75 at the threshold)
    const a = trustAlpha(SWING_MIN_PCT)
    expect(seatPaint(seat({ pct: SWING_MIN_PCT }), st(), 'trust', pal, true).rgb[0]).toBe(Math.round(c[0]! * a))
  })
  it('trust hatches a seat below the swing threshold instead of colouring its swing', () => {
    const early = seatPaint(seat({ pct: SWING_MIN_PCT - 0.1 }), st(), 'trust', pal, true)
    expect(early.hatch).toBe(true)
    expect(early.rgb).not.toEqual(rgbOf(TRUST_PALETTE[1]![2]!))
    expect(seatPaint(seat({ pct: SWING_MIN_PCT }), st(), 'trust', pal, true).hatch).toBe(false)
    // no 2CP yet is still just too early; a changed pairing is not, it stays grey
    expect(seatPaint(seat({ pct: 5, tcp: null }), st(), 'trust', pal, true).hatch).toBe(true)
    const changed = seatPaint(seat({ pct: 5, tcp: { a: 'ALP', b: 'GRN', pctA: 60 } }), st(), 'trust', pal, true)
    expect(changed.hatch).toBe(false)
    expect(changed.rgb).not.toEqual(early.rgb)
    // outside the pick the hatch goes with the colour
    expect(seatPaint(seat({ pct: 5 }), st(), 'trust', pal, false).hatch).toBe(false)
    // other colours never hatch
    expect(seatPaint(seat({ pct: 5 }), st(), 'leader', pal, true).hatch).toBe(false)
  })
  it('trust is grey with no margin or swing, and the no-result colour with no leader', () => {
    expect(seatPaint(seat({ pct: 80, tcp: null }), st(), 'trust', pal, true).rgb).toEqual(rgbOf(TRUST_NA))
    expect(seatPaint(seat({ leader: null, tcp: null, state: 'none' }), st(), 'trust', pal, true).rgb).toEqual([238, 238, 238])
  })
  it('dims whatever the colour is when the seat is out of focus', () => {
    const lit = seatPaint(seat(), st(), 'trust', pal, true).rgb
    const dim = seatPaint(seat(), st(), 'trust', pal, false).rgb
    expect(dim).not.toEqual(lit)
  })
})

describe('the pick: fade and desaturate (ADR 0023)', () => {
  const spread = (c: readonly number[]) => Math.max(...c) - Math.min(...c)
  it('seats outside the pick lose most of their colour and move towards the paper', () => {
    const lit = seatPaint(seat(), st(), 'leader', pal, true, true)
    const out = seatPaint(seat(), st(), 'leader', pal, false, true)
    expect(spread(out.rgb)).toBeLessThan(spread(lit.rgb) / 4)
    // The paper is black in this palette, so fading darkens.
    expect(out.rgb[0]).toBeLessThan(lit.rgb[0])
  })
  it('a picked seat keeps its colour and is marked for the outline; nothing else is', () => {
    const base = seatPaint(seat(), st(), 'leader', pal, true)
    expect(base.lit).toBe(false)
    const lit = seatPaint(seat(), st(), 'leader', pal, true, true)
    expect(lit.rgb).toEqual(base.rgb)
    expect(lit.lit).toBe(true)
    expect(seatPaint(seat(), st(), 'leader', pal, false, true).lit).toBe(false)
  })
  it('without a pick in play an out-of-focus seat is still faded (the older call), but never outlined', () => {
    const out = seatPaint(seat(), st(), 'leader', pal, false)
    expect(out.lit).toBe(false)
    expect(spread(out.rgb)).toBeLessThan(spread(seatPaint(seat(), st(), 'leader', pal, true).rgb))
  })
})

describe('the faded band (VE-93): every faded seat sits near the paper', () => {
  const lumaOf = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!
  const themes = {
    light: { '--party-alp': '#e0343b', '--party-lib': '#1f5fbf', '--party-nat': '#0a4a4a', '--party-grn': '#65c957', '--party-onp': '#f28e1c', '--party-ind': '#0a8a96', '--party-oth': '#a0a0a0', '--map-paper': '#f6f4ef', '--map-tint-base': '#ffffff', '--map-tint-amount': '0.6' },
  } as Record<string, Record<string, string>>
  // Band, in luminance (0 to 255) from the paper: a faded seat is visible against it (at least 3) but never more than 40 away,
  // and a strong fill sits no more than 25 further from the paper than its pale twin, so the shape reads without shouting.
  const BAND = [3, 40] as const
  const MAX_STRONG_EXTRA = 25
  for (const [name, tokens] of Object.entries(themes)) {
    const p = readPalette((n) => tokens[n] ?? '')
    const dist = (rgb: readonly number[]) => Math.abs(lumaOf(rgb) - lumaOf(p.paper))
    for (const party of Object.keys(p.party)) {
      it(`${name} theme, ${party}: strong and pale fade into the band`, () => {
        const mk = (state: 'firm' | 'leading') => seatPaint(seat({ leader: party as never, state }), st(), 'leader', p, false, true).rgb
        const strong = dist(mk('firm'))
        const pale = dist(mk('leading'))
        expect(strong).toBeGreaterThanOrEqual(BAND[0])
        expect(strong).toBeLessThanOrEqual(BAND[1])
        expect(pale).toBeGreaterThanOrEqual(BAND[0])
        expect(pale).toBeLessThanOrEqual(BAND[1])
        expect(strong - pale).toBeLessThanOrEqual(MAX_STRONG_EXTRA)
      })
    }
  }
})

describe('seatPaint under Gains (VE-156)', () => {
  const changed = seat({ state: 'firm', changing: true, base: 'LIB' })
  const held = seat({ state: 'firm', changing: false, base: 'ALP' })
  it('draws a changed seat in the new holder colour, lifted (gain), at the Leader step', () => {
    const p = seatPaint(changed, st(), 'gains', pal, true)
    expect(p.rgb).toEqual([255, 0, 0])
    expect(p.gain).toBe(true)
    // a Likely lead (ADR 0033) is the Likely step (never the faint Early step), so it stands out all night
    const early = seatPaint(seat({ state: 'leading', pct: 30, changing: true, likely: true }), st(), 'gains', pal, true)
    expect(early.rgb).toEqual([255, 42, 42])
    expect(early.gain).toBe(true)
  })
  it('tints an unchanged seat towards its holder, not grey, and does not lift it', () => {
    const p = seatPaint(held, st(), 'gains', pal, true)
    // paper is black here, so GAINS_KEEP of the party colour is left
    expect(p.rgb).toEqual([Math.round(255 * GAINS_KEEP), 0, 0])
    expect(p.gain).toBeUndefined()
    expect(p.lit).toBe(false)
  })
  it('keeps only the tapped party gains lifted; other changed seats read as unchanged', () => {
    expect(seatPaint(changed, st(), 'gains', pal, true, false, 'ALP').gain).toBe(true)
    const other = seatPaint(changed, st(), 'gains', pal, true, false, 'GRN')
    expect(other.gain).toBeUndefined()
    expect(other.rgb).toEqual([Math.round(255 * GAINS_KEEP), 0, 0])
  })
  it('draws a changed seat below the early-lead bar as a tint of its holder, so the colour does not name the early leader (VE-166)', () => {
    // ADR 0033: 60% counted but not Likely (the margin or the preferences fall short) is still below the bar.
    const early = seat({ state: 'leading', pct: 60, changing: true, base: 'LIB', leader: 'ALP' })
    const p = seatPaint(early, st(), 'gains', pal, true)
    expect(p.gain).toBeUndefined()
    // LIB is the holder; the paper is black here so GAINS_KEEP of the Liberal colour is left, and it differs from the Labor tint
    expect(p.rgb).toEqual(gainsTintRgb('LIB', pal))
    expect(p.rgb).not.toEqual(gainsTintRgb('ALP', pal))
    // once Likely it lifts, and a firm seat lifts whatever the count
    expect(seatPaint(seat({ state: 'leading', pct: 30, changing: true, base: 'LIB', likely: true }), st(), 'gains', pal, true).gain).toBe(true)
    expect(seatPaint(seat({ state: 'firm', pct: 10, changing: true, base: 'LIB' }), st(), 'gains', pal, true).gain).toBe(true)
  })
  it('a shown gain filtered out by a tapped party still tints by its leader, as before', () => {
    const shown = seat({ state: 'firm', changing: true, base: 'LIB', leader: 'ALP' })
    expect(seatPaint(shown, st(), 'gains', pal, true, false, 'GRN').rgb).toEqual(gainsTintRgb('ALP', pal))
  })
  it('a seat with no figures keeps the no-result colour', () => {
    expect(seatPaint(seat({ leader: null, state: 'none', tcp: null }), st(), 'gains', pal, true).rgb).toEqual([238, 238, 238])
  })
  it('a seat outside a tally pick fades as everywhere else and is not lifted', () => {
    expect(seatPaint(changed, st(), 'gains', pal, false, true).gain).toBeUndefined()
  })
})

describe('Gains tints say who holds a seat (VE-168, FB-189)', () => {
  // The real civic palette, not the test one above: paper #f6f4ef, no-result #d0d4d9, Liberal #1f5fbf, Nationals #0a4a4a.
  const real = readPalette(
    (n) => ({ '--party-alp': '#e0343b', '--party-lib': '#1f5fbf', '--party-nat': '#0a4a4a', '--map-paper': '#f6f4ef', '--map-no-result': '#d0d4d9', '--map-tint-base': '#ffffff', '--map-tint-amount': '0.6' })[n] ?? '',
  )
  type V3 = [number, number, number]
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lab = ([r, g, b]: V3): V3 => {
    const [R, G, B] = [lin(r), lin(g), lin(b)]
    const xyz = [(0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, 0.2126 * R + 0.7152 * G + 0.0722 * B, (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883]
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
    const [fx, fy, fz] = xyz.map(f) as V3
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
  }
  /** CIE76 Delta E, the measure the review quoted (Liberal v Nationals "10"). */
  const dE = (a: V3, b: V3) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]!) as V3)
  /** Machado et al. 2009 deuteranopia (severity 1.0), applied in linear RGB. */
  const deut = ([r, g, b]: V3): V3 => {
    const l = [lin(r), lin(g), lin(b)]
    const m = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]
    const enc = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)))
    return m.map((row) => enc(row[0]! * l[0]! + row[1]! * l[1]! + row[2]! * l[2]!)) as V3
  }
  const lib = gainsTintRgb('LIB', real)
  const nat = gainsTintRgb('NAT', real)
  const none = real.noResult

  it('keeps Liberal and Nationals at least 15 apart, and each at least 12 from the no-result grey', () => {
    expect(dE(lib, nat)).toBeGreaterThanOrEqual(15)
    expect(dE(lib, none)).toBeGreaterThanOrEqual(12)
    expect(dE(nat, none)).toBeGreaterThanOrEqual(12)
  })
  it('keeps Liberal and Nationals apart under deuteranopia too (16.1 measured; 9.8 at 0.2)', () => {
    expect(dE(deut(lib), deut(nat))).toBeGreaterThanOrEqual(15)
  })
  it('stays well behind a changed seat: the tint is no stronger than half the party colour', () => {
    expect(GAINS_KEEP).toBeLessThanOrEqual(0.5)
  })
})

describe('Counted scale at Final (VE-170, review finding 7)', () => {
  const turnouts = [81.2, 82.4, 83.5, 84.1, 85.7, 86.0, 87.3, 88.6, 89.9]

  it('keeps the 25, 50 and 75 steps before Final', () => {
    const s = countedScale(turnouts, false)
    expect(s.cuts).toEqual([25, 50, 75])
    expect(s.labels).toEqual(['Under 25%', '25 to 50%', '50 to 75%', '75% or more'])
  })
  it('spreads four whole-number steps of about equal width from the lowest seat to the highest', () => {
    const s = countedScale(turnouts, true)
    // Whole percentages 81 to 90 (10 values): edges at 84, 86, 89 (rounded quarters of the span).
    expect(s.labels).toEqual(['81 to 83%', '84 to 85%', '86 to 88%', '89 to 90%'])
    // Cut half a point below each whole edge, so a seat sorts by the same number its hex prints.
    expect(s.cuts).toEqual([83.5, 85.5, 88.5])
  })
  it('sorts a seat by the figure printed on its hex', () => {
    const s = countedScale(turnouts, true)
    expect(turnouts.map((p) => countedStep(p, s.cuts))).toEqual([0, 0, 1, 1, 2, 2, 2, 3, 3])
    // 83.5 prints as 84, so it is in the 84 to 85 step.
  })
  it('leaves out a seat with no figures, so one patched seat cannot stretch the range', () => {
    const s = countedScale([0, 0.2, ...turnouts], true)
    expect(s.labels[0]).toBe('81 to 83%')
    expect(s.labels[3]).toBe('89 to 90%')
  })
  it('never makes an empty or repeated step when every seat has the same figure', () => {
    const s = countedScale([86.2, 86.4, 85.8], true)
    expect(s.cuts[0]).toBeLessThan(s.cuts[1])
    expect(s.cuts[1]).toBeLessThan(s.cuts[2])
    expect(s.labels[0]).toBe('86%')
    expect(s.labels.every((l) => l !== '' && !l.includes('NaN') && !l.includes('Infinity'))).toBe(true)
  })
  it('falls back to the night scale with nothing to spread', () => {
    expect(countedScale([], true).cuts).toEqual([25, 50, 75])
    expect(countedScale([0, null, undefined], true).cuts).toEqual([25, 50, 75])
  })
  it('counts add up: every seat with a figure lands in exactly one step', () => {
    const s = countedScale(turnouts, true)
    const tally = [0, 0, 0, 0]
    for (const p of turnouts) tally[countedStep(p, s.cuts)!]!++
    expect(tally.reduce((a, b) => a + b, 0)).toBe(turnouts.length)
    expect(tally).toEqual([2, 2, 3, 2])
  })
  it('colours by the scale it is given, and by the night scale by default', () => {
    const s = countedScale(turnouts, true)
    expect(countedRgb(84, pal, s.cuts)).toEqual(countedRgb(40, pal))
    expect(countedRgb(84, pal)).toEqual(countedRgb(80, pal))
  })
})
