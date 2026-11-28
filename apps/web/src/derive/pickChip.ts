import type { PartyBucket } from '@vic26/schema'
import { PARTY_COLOURS } from '../parties'
import { parseColour } from '../theme/theme'
import { DOUBT, focusDetail, focusName, parseFocus, type Focus } from './focus'
import type { Seat } from './seats'

/** VE-286: what the pick chip says and the colours it and the picked seats' outline wear. */

const INK: [number, number, number] = [18, 18, 18]
const PART_WORDS = { strong: 'won or firm', pale: 'leading' } as const

/** The party a pick stands for: itself, the Coalition's Liberal, the crossbench's Independent; none for the close seats. */
const pickBucket = (f: Focus): PartyBucket | null => {
  if (f === DOUBT) return null
  const { who } = parseFocus(f)
  return who === 'COA' ? 'LIB' : who === 'XB' ? 'IND' : who
}

/** The party's colour taken towards the app's near-black ink: dark enough to read on its own fill and on the paper, still its hue. */
function darken(hex: string, towardsInk = 0.5): string {
  const c = parseColour(hex)!
  return `rgb(${c.map((v, i) => Math.round(v + (INK[i]! - v) * towardsInk)).join(', ')})`
}

export interface PickChipInfo {
  /** The party's name, which the chip sets in the party's colour (the close seats have none: a plain phrase). */
  head: string
  /** The rest of the line, in the normal text colour. */
  tail: string
  /** head + tail, as one string. */
  text: string
  /** The party the name is coloured for; null for the close seats. */
  bucket: PartyBucket | null
  /** The party's colour for the glyph; null for the close seats (no party). */
  colour: string | null
  /** The outline colour for the picked seats. */
  edge: string
}

/** A whole-party pick says how sure its seats are, leaving out the empty parts (one part alone reads "all leading"), but names an empty declared part. */
function breakdown(d: ReturnType<typeof focusDetail>): string {
  const parts: [number, string][] = [[d.declared, 'declared'], [d.firm, 'certain'], [d.leading, 'leading']]
  const on = parts.filter(([n]) => n > 0)
  const words = on.length === 1 && d.total > 0 ? [`all ${on[0]![1]}`] : on.map(([n, w]) => `${n} ${w}`)
  // Simon: say "none declared" outright, so a missing part is not read as an omission (the other empty parts stay out).
  if (d.declared === 0 && d.total > 0) words.push('none declared yet')
  if (d.inDoubt > 0) words.push(`${d.inDoubt} close`)
  return words.length ? ` · ${words.join(' · ')}` : ''
}

export function pickChipInfo(focus: Focus, seats: Map<number, Seat>): PickChipInfo {
  const d = focusDetail(seats, focus)
  const n = d.total
  const seatWord = n === 1 ? 'seat' : 'seats'
  const bucket = pickBucket(focus)
  const base = bucket ? PARTY_COLOURS[bucket] : null
  const colour = base ? `rgb(${parseColour(base)!.join(', ')})` : null
  const edge = base ? darken(base) : `rgb(${INK.join(', ')})`
  const make = (head: string, tail: string): PickChipInfo => ({ head, tail, text: head + tail, bucket, colour, edge })
  if (focus === DOUBT) return make(`${n} close ${seatWord}`, '')
  const { who, part } = parseFocus(focus)
  const name = focusName(who)
  return part ? make(name, ` ${PART_WORDS[part]} · ${n} ${seatWord}`) : make(name, ` · ${n} ${seatWord}${breakdown(d)}`)
}

/** The outline colour for the stage's picked seats (`--pick-edge`), so the Map, Hex and inset share it. */
export const pickEdge = (focus: Focus | null, seats: Map<number, Seat>): string | undefined => (focus ? pickChipInfo(focus, seats).edge : undefined)
