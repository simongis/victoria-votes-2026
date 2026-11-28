import { FORECAST_BASE, forecastHref, seatLabel } from '../forecastLink'
import { leaderCss } from '../../../views/encoding'
import { usePalette } from '../../../theme/theme'
import { seatFacts, type MultiRow } from '../../lenspanel/multi'
import { SeatTrend } from './SeatTrend'
import { css } from '../../../theme/theme'
import { stepRgb } from '../../../views/encoding'
import { partyName } from '../../../derive/seats'
import type { PartyBucket } from '@vic26/schema'

/** A party's name in its colour, as the trend's labels do. */
function Party({ p }: { p: PartyBucket }) {
  const pal = usePalette()
  return <strong className="multi__seat-party" style={{ color: css(stepRgb(p, 2, pal)) }}>{partyName(p)}</strong>
}

interface Props {
  row: MultiRow
  total: number
  times?: readonly number[]
  final: boolean
  onBack: () => void
  /** Send the seat to the main map (its full panel). */
  onOpen: (() => void) | null
}

/**
 * The side panel for a seat picked on the Multiples grid (VE-276): only the key facts, then the larger trend line, then the
 * way on (the main map, the forecast site). Words are short on purpose; the line carries it.
 */
export function SeatPanel({ row, total, times, final, onBack, onOpen }: Props) {
  const pal = usePalette()
  const f = seatFacts(row, final)
  const name = seatLabel(row.name)
  return (
    <div className="lenspanel multi__seat" data-testid="multi-seat">
      <button type="button" className="multi__seat-back" data-testid="multi-seat-back" onClick={onBack}>
        <span aria-hidden>←</span> All races
      </button>
      <h2 className="multi__seat-name">{name}</h2>
      {f.pair && <p className="multi__seat-pair" data-testid="multi-seat-pair">{f.pair}</p>}
      <p className="multi__seat-lead" data-testid="multi-seat-lead">
        <span className="sq" style={{ background: leaderCss({ ...row.seat, leader: f.leader }, pal) }} aria-hidden />
        {f.leadLine}
        {f.declared && <span className="multi__seat-done" data-testid="multi-seat-declared"> <span aria-hidden>✓</span> Declared</span>}
      </p>
      {f.changes && <p className="multi__seat-changes" data-testid="multi-seat-changes">{f.changes}</p>}
      {f.counted !== null && <p className="multi__seat-counted" data-testid="multi-seat-counted">{f.counted}% {final ? 'turnout' : 'counted'}</p>}
      {f.wrongPair && (
        <p className="multi__seat-note" data-testid="multi-seat-note">
          VEC counting <Party p={f.wrongPair.a} /> v <Party p={f.wrongPair.b} />. <Party p={f.wrongPair.outsider} />{' '}
          {f.wrongPair.leads ? 'lead' : 'are close behind'} on first preferences.
        </p>
      )}
      <SeatTrend row={row} total={total} times={times} />
      <p className="multi__seat-links">
        {onOpen && (
          <button type="button" className="like__link" data-testid="multi-seat-open" onClick={onOpen}>Open {name} on the main map</button>
        )}
        {FORECAST_BASE && (
          <a
            className="multi__seat-forecast"
            data-testid="multi-seat-forecast"
            href={forecastHref(FORECAST_BASE, row.name)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Polling model forecast for ${name}. A forecast, not results, on another site. Opens in a new tab.`}
          >
            Polling model forecast for {name} ↗
          </a>
        )}
      </p>
    </div>
  )
}
