import { css, usePalette } from '../../theme/theme'
import { partyCss } from '../../views/encoding'
import { evcRing } from './evc'
import { boothLabel, type BoothDot } from './dots'

interface Props {
  dots: readonly BoothDot[]
  /** The dot under the pointer or focus: it wears a ring. */
  ring: BoothDot | null
  /** Keyboard focus landed on (or left) a dot of the picked seat. */
  onFocusDot: (dot: BoothDot | null, el: SVGCircleElement | null) => void
  /** Enter or Space on a focused dot opens its panel (VE-208): the keyboard route to a place, since a tap needs a pointer. */
  onPick?: (dot: BoothDot) => void
  /** VE-288: booths whose figures changed this tick (by `pick` id); each wears a soft ring that grows and fades. */
  flash?: ReadonlySet<number> | null
}

const spoken = (d: BoothDot): string => {
  const l = boothLabel(d)
  return [l.name, l.lead, l.extra].filter(Boolean).join(', ')
}

/**
 * The polling place dots (VE-77c), drawn above the seats. One circle per booth, sized and placed in pixels by
 * `placeBooths` (the pane calls it on every camera change), so React only sets what changes with the count: colour,
 * strength and the picked seat's outline.
 *
 * 1,700 dots are too many to tab through or to read out, so the layer is one labelled group and only the picked seat's
 * dots are focusable and named; every other dot is hidden from assistive technology (the seats list is the keyboard route).
 */
export function BoothLayer({ dots, ring, onFocusDot, onPick, flash = null }: Props) {
  const pal = usePalette()
  const ink = css(pal.selected)
  const paper = css(pal.paper)
  return (
    <g className="map-marks booth-dots" data-layer="booths" role="group" aria-label="Polling places">
      {dots.map((d) => {
        const waiting = d.state === 'waiting'
        const fill = waiting || d.leader === null ? ink : partyCss(d.leader, pal)
        // Waiting: a faint speck. Counted: strong, or faded when a pick leaves it out.
        // A touch of alpha (0.86) lets overlaps show through without the muddy darkening a multiply blend gave (VE-143).
        const opacity = waiting ? (d.lit && !d.faded ? 0.22 : 0.08) : d.lit ? (d.faded ? 0.3 : 0.86) : 0.1
        const named = d.outlined
        // VE-306: a closed place is a hollow ring in ink, not a faint "none yet" speck.
        const closed = d.closed === true
        return (
          <circle
            key={d.id}
            className="booth-dot"
            data-booth={d.id}
            data-state={d.state}
            data-leader={d.leader ?? ''}
            data-lit={d.lit}
            data-e={d.e}
            data-n={d.n}
            data-r={d.r0}
            fill={closed ? 'none' : fill}
            fillOpacity={closed ? 0 : d.evc ? Math.min(opacity, evcRing(d.r0).fillOpacity) : opacity}
            stroke={closed ? ink : d.evc ? fill : d.outlined ? ink : paper}
            strokeOpacity={closed ? (d.faded ? 0.3 : 0.9) : d.outlined || d.evc ? 1 : d.lit ? (d.faded ? 0.3 : 0.92) : 0.15}
            strokeWidth={closed ? 1.4 : d.evc ? evcRing(d.r0).strokeWidth : d.outlined ? 1.6 : 1}
            data-closed={closed || undefined}
            data-halo={!closed && !d.evc && !d.outlined ? '' : undefined}
            data-outlined={d.outlined || undefined}
            data-faded={d.faded || undefined}
            data-evc={d.evc || undefined}
            tabIndex={named ? 0 : undefined}
            role={named ? 'img' : undefined}
            aria-label={named ? spoken(d) : undefined}
            aria-hidden={named ? undefined : true}
            onFocus={named ? (e) => onFocusDot(d, e.currentTarget) : undefined}
            onBlur={named ? () => onFocusDot(null, null) : undefined}
            onKeyDown={
              named && onPick
                ? (e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    onPick(d)
                  }
                : undefined
            }
          />
        )
      })}
      {flash &&
        dots.map((d) =>
          d.state === 'counted' && flash.has(d.pick) ? (
            <circle key={`f${d.id}`} className="booth-flash" data-flash={d.id} data-e={d.e} data-n={d.n} data-r={d.r0} data-pad={2} fill="none" stroke={d.leader ? partyCss(d.leader, pal) : ink} strokeWidth={2} aria-hidden />
          ) : null,
        )}
      {ring && <circle className="booth-ring" data-e={ring.e} data-n={ring.n} data-r={ring.r0} data-pad={3} fill="none" stroke={ink} strokeWidth={1.8} aria-hidden />}
    </g>
  )
}
