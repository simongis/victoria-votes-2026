import { InfoButton } from '../InfoButton'
import { placeWords, type Place } from './lookup'

interface Props {
  places: readonly Place[]
  seatName: (id: number) => string
  onPick: (districtId: number) => void
}

/**
 * Suburbs and postcodes that match the rail's search, above the seat table. Each place is one button that reads as a
 * sentence and selects its biggest seat; a split place adds a small button per other seat so every seat is reachable.
 * The "i" carries the method and the 2022 boundaries caveat, so nothing explanatory sits on screen at rest (CLAUDE.md).
 */
export function PlaceMatches({ places, seatName, onPick }: Props) {
  if (places.length === 0) return null
  return (
    <section className="rail__places" aria-label="Suburbs and postcodes" data-testid="place-matches">
      <div className="rail__placehead">
        <span className="rail__placetitle" aria-hidden="true">Your seat</span>
        <InfoButton label="About suburb and postcode matches">
          <p>
            We share each suburb or postcode across seats by where its people live (ABS Census 2021 counts), and leave out any seat holding under 5% of them.
          </p>
          <p>
            Seats are the 2022 districts. Suburb and postcode edges are the ABS 2021 ones, so they can differ from today&apos;s boundaries, Australia Post or your council.
          </p>
          <p>Source: Australian Bureau of Statistics, ASGS 2021 (CC BY 4.0).</p>
        </InfoButton>
      </div>
      <p className="sr-only" role="status">
        {places.length === 1 ? '1 suburb or postcode matches' : `${places.length} suburbs and postcodes match`}
      </p>
      <ul className="rail__placelist">
        {places.map((p) => {
          const [top, ...others] = p.shares
          if (!top) return null
          return (
            <li key={`${p.kind}:${p.name}`} className="rail__place" data-kind={p.kind}>
              <button type="button" className="rail__placebtn" onClick={() => onPick(top.id)}>
                <span>{placeWords(p, seatName)}</span>
                <span className="rail__placego" aria-hidden="true">›</span>
              </button>
              {others.map((s) => (
                <button key={s.id} type="button" className="rail__placealt" aria-label={`Open ${seatName(s.id)}, ${s.pct} percent of ${p.name}`} onClick={() => onPick(s.id)}>
                  {seatName(s.id)} {s.pct}%
                </button>
              ))}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
