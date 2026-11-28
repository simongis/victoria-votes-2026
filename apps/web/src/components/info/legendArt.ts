import type { Colour } from '../../state/view'

/** The illustrations the header "i" can open with (VE-303). */
export type ArtKind = 'leader' | 'swing' | 'lvc' | 'gains' | 'places'

/**
 * Which illustration heads the "i" for what is on the stage. Polling places draws over any colour, so it wins. Leader at
 * Final has no steps or tick left to explain (FB-195), so it has none; nor does the folded How sure colour.
 */
export function artFor(colour: Colour, placesOn: boolean, final: boolean): ArtKind | null {
  if (placesOn) return 'places'
  switch (colour) {
    case 'leader':
      return final ? null : 'leader'
    case 'trust':
      return 'swing'
    case 'lvc':
      return 'lvc'
    case 'gains':
      return 'gains'
    default:
      return null
  }
}

/** A pointy-top hexagon's `points`, as the Hex view draws its seats. */
export function hexPoints(cx: number, cy: number, r: number): string {
  return [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 3
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
    })
    .join(' ')
}

/** React's useId has colons (or guillemets in React 19), which break `url(#id)`; keep letters, digits and hyphens. */
export const svgId = (reactId: string, name: string): string => `${reactId.replace(/[^A-Za-z0-9-]/g, '')}-${name}`
