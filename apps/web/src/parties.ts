import type { PartyBucket } from '@vic26/schema'

/**
 * Civic party colours, copied from prototypes/shared/parties.ts after VE-45b separated Greens (bright leaf green)
 * from the Nationals (dark teal-green): CIEDE2000 about 48 normal, 49 deuteranopia, 50 protanopia.
 * VE-184 lightened Greens from #4cbb3c to #65c957 so they stay apart from One Nation under colour blindness (Machado 2009
 * full-severity simulation, CIE76 delta E): Greens against One Nation 7.3 to 15.7 under protanopia, Labor against Greens
 * 11.4 to 16.4 under deuteranopia. Cost: contrast on the paper background 2.2 to 1.9 (seats keep outlines, keys carry names).
 * The app keeps its own copy because it never imports from prototypes/. tokens.css carries the same values as
 * --party-* (the source views read, so a theme can override them); these are the fallback.
 */
export const PARTY_COLOURS: Record<PartyBucket, string> = {
  ALP: '#e0343b',
  LIB: '#1f5fbf',
  NAT: '#0a4a4a',
  GRN: '#65c957',
  ONP: '#f28e1c',
  IND: '#0a8a96',
  OTH: '#a0a0a0',
}

export const PARTY_NAMES: Record<PartyBucket, string> = {
  ALP: 'Labor',
  LIB: 'Liberal',
  NAT: 'Nationals',
  GRN: 'Greens',
  ONP: 'One Nation',
  IND: 'Independent',
  OTH: 'Other',
}

/**
 * VE-226 (finding 17): names that take a plural verb in Australian usage ("the Greens lead", "the Nationals keep it").
 * Labor, Liberal, One Nation, the Coalition and a single Independent are singular.
 */
const PLURAL_NAMES: ReadonlySet<string> = new Set(['Greens', 'Nationals', 'Independents', 'Others', 'Liberals'])
/** The verb form that agrees with a party name: `agree('Greens', 'leads', 'lead')` is "lead". */
export const agree = (name: string, one: string, many: string): string => (PLURAL_NAMES.has(name) ? many : one)
