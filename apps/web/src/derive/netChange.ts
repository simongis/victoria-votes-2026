/**
 * The words on a Gains net chip (VE-190, FB-223). A Labor seat and a Liberal seat swapping net to zero for both, which read
 * as "Labor 0, Liberal 0" beside two ringed seats. A party that both gained and lost now shows what moved: "+1 −1" when it
 * nets to nothing. Where it has a real net ("+2" after gaining 3 and losing 1) the net stays, as the key's lead says "Net
 * change"; the full count is in the chip's tooltip and accessible name. Pure, so it is tested without a browser.
 */
import { PARTY_NAMES } from '../parties'
import { signedNet, type PartyNet } from './gains'

export function netChip(n: PartyNet): string {
  if (n.net === 0 && n.gains > 0 && n.losses > 0) return `+${n.gains} −${n.losses}`
  return signedNet(n.net)
}

const seats = (k: number): string => `${k} ${k === 1 ? 'seat' : 'seats'}`

/** "Labor: gained 1 seat, lost 1 seat": the tooltip and the screen-reader name of a net chip. */
export const netSentence = (n: PartyNet): string => `${PARTY_NAMES[n.party]}: gained ${seats(n.gains)}, lost ${seats(n.losses)}`
