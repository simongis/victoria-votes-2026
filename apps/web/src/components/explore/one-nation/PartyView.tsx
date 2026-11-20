import { useId, useMemo } from 'react'
import { partyRgb, rampCss } from '../../../derive/oneNation'
import type { PartyRow } from '../../lenspanel/party'
import { css, type Palette, type Rgb } from '../../../theme/theme'
import { Shape } from '../Shape'
import type { View } from '../stageGeom'
import type { SeatPick } from './useSeatPick'

interface Props {
  view: View | null
  shape: 'map' | 'hex'
  /** The chosen party's row for every seat. */
  rows: ReadonlyMap<number, PartyRow>
  /** The party's own colour and the top of its scale. */
  base: Rgb
  max: number
  partyName: string
  names: ReadonlyMap<number, string>
  words: (id: number) => string
  pal: Palette
  pick: SeatPick
}


/**
 * The vote map: each seat wears the chosen party's colour, light to dark, by its 2025 federal share. Seats where the party
 * stood in only part of the area carry a light diagonal hatch over the colour; seats where it did not stand are hatched grey.
 */
export function PartyView({ view, shape, rows, base, max, partyName, names, words, pal, pick }: Props) {
  const pid = useId()
  const oid = useId()
  const hatchUnit = view ? view.vb[2] / 360 : 1
  const points = useMemo(() => (view ? view.items.map((it) => ({ id: it.id, x: it.cx, y: it.cy })) : []), [view])
  if (!view) return <p className="explore-lens__loading" role="status">Loading...</p>
  const first = view.items[0]?.id ?? null
  const u = 6 * hatchUnit
  return (
    <svg
      className="arrows__svg"
      viewBox={view.vb.join(' ')}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={`${partyName} share of the 2025 federal first-preference vote in each of the 88 districts, on the ${shape === 'hex' ? 'hexagons' : 'map'}. Tab to a seat, then use the arrow keys.`}
      onKeyDown={(e) => pick.onKey(e, points)}
    >
      <defs>
        {/* Did not stand: diagonal hatching, sized to the view so it reads the same on the Map and the Hex. */}
        <pattern id={pid} width={u} height={u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={u} height={u} fill={css(pal.noResult)} />
          <rect width={2.4 * hatchUnit} height={u} fill="#c4c4c4" />
        </pattern>
        {/* Stood in part of the seat: thin light stripes over the party colour, so the colour still reads. */}
        <pattern id={oid} width={u} height={u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={1.8 * hatchUnit} height={u} fill="#ffffff" fillOpacity="0.7" />
        </pattern>
      </defs>
      <g>
        {view.items.map((it) => {
          const r = rows.get(it.id)
          const none = !r || r.notStanding
          return (
            <Shape
              key={it.id}
              mode={shape}
              it={it}
              className="arrows__seat"
              data-testid="onl-seat"
              data-fill={none ? 'none' : 'ramp'}
              data-partial={r?.partial ? 'true' : 'false'}
              fill={none ? `url(#${pid})` : css(partyRgb(r.pct, base, max))}
              stroke={css(pal.edge)}
            />
          )
        })}
      </g>
      <g pointerEvents="none">
        {view.items.filter((it) => rows.get(it.id)?.partial && !rows.get(it.id)?.notStanding).map((it) => (
          <Shape key={it.id} mode={shape} it={it} data-testid="onl-partial" fill={`url(#${oid})`} stroke="none" />
        ))}
      </g>
      {pick.active !== null && view.items.filter((it) => it.id === pick.active).map((it) => (
        <Shape key="pick" mode={shape} it={it} className="arrows__pick" fill="none" stroke={css(pal.selected)} />
      ))}
      <g>
        {view.items.map((it) => (
          <Shape key={it.id} mode={shape} it={it} className="arrows__hit onl__hit" data-testid="onl-hit" {...pick.mark(it.id, words(it.id) || (names.get(it.id) ?? ''), first)} fill="transparent" stroke="none" />
        ))}
      </g>
    </svg>
  )
}

/** The key under the marks, drawn with the same ramp function as the seats. */
export function PartyKey({ partyName, base, max, partial, none }: { partyName: string; base: Rgb; max: number; partial: number; none: number }) {
  return (
    <ul className="arrows__legend onl__key" aria-label="Key" data-testid="onl-key">
      <li>0%</li>
      <li><i className="onl__ramp" style={{ background: rampCss((v) => partyRgb(v, base, max), 0, max, 12) }} aria-hidden /></li>
      <li>{max}%+ of first preferences</li>
      {partial > 0 && (
        <li className="onl__nokey" data-testid="onl-partial-key">
          <i className="onl__hatch" aria-hidden />
          {`${partyName} stood in only part of ${partial === 1 ? 'this seat' : `these ${partial} seats`}`}
        </li>
      )}
      {none > 0 && (
        <li className="onl__nokey">
          <i className="onl__hatch" aria-hidden />
          {`${partyName} did not stand (${none} ${none === 1 ? 'seat' : 'seats'})`}
        </li>
      )}
    </ul>
  )
}
