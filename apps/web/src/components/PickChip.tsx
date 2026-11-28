import type { CSSProperties } from 'react'
import { focusName, type Focus } from '../derive/focus'
import { legibleOn } from '../derive/headline'
import { pickChipInfo } from '../derive/pickChip'
import type { Seat } from '../derive/seats'
import { css, type Palette } from '../theme/theme'

/**
 * VE-286: while a tally pick (or a hover preview of one) is on, a small pill at the top centre of the stage says what the
 * outlined seats are, and how sure they are. It is the only popup for a hover (the tally's own detail card is kept for
 * screen readers only). The party's name wears its colour, made legible on the surface the way the band's names are.
 */
export function PickChip({ focus, seats, pal, preview, onClear }: { focus: Focus | null; seats: Map<number, Seat>; pal: Palette; /** A hover preview, not a committed pick: fainter, and no clear button. */ preview: boolean; onClear: () => void }) {
  if (!focus) return null
  const info = pickChipInfo(focus, seats)
  const name = focusName(focus)
  const nameColour = info.bucket ? css(legibleOn(pal.party[info.bucket], pal.paper)) : undefined
  return (
    <div className="pickchip" data-testid="pick-chip" data-preview={preview} role="status" style={{ '--pickchip-edge': info.edge, '--pickchip-fill': info.colour ?? 'transparent' } as CSSProperties}>
      {/* A small outlined hex: the same mark the outline is, so the chip is its own key. */}
      <svg className="pickchip__glyph" viewBox="0 0 16 16" aria-hidden>
        <polygon points="8,1.2 14,4.6 14,11.4 8,14.8 2,11.4 2,4.6" />
      </svg>
      <span className="pickchip__text">
        <b style={nameColour ? { color: nameColour } : undefined}>{info.head}</b>
        {info.tail}
      </span>
      {!preview && (
        <button type="button" className="pickchip__clear" data-testid="pick-chip-clear" aria-label={`Clear the ${name} highlight`} title="Clear highlight" onClick={onClear}>
          <span aria-hidden>&#10005;</span>
        </button>
      )}
    </div>
  )
}
