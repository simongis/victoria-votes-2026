import { useEffect, useMemo, useState } from 'react'
import type { FirstPrefs2022Asset, OneNationAsset, ShareParty } from '@vic26/schema'
import { partyLabel, partyRgb } from '../../derive/oneNation'
import { css, type Palette, type Rgb } from '../../theme/theme'
import { validateFp2022 } from '../explore/arrows/fp2022'
import { FORECAST_BASE, forecastHref, seatLabel } from '../explore/forecastLink'
import type { LiveRow } from '../explore/one-nation/live'
import type { SeatPick } from '../explore/one-nation/seatStore'
import type { Statics } from '../../data/types'
import { demoFacts, mostLike, overTime, placeIn, placeWords, type OverTime, type Point, type TonightPoint } from './seatFacts'

interface Props {
  statics: Statics
  party: ShareParty
  pick: SeatPick & { id: number }
  asset: OneNationAsset
  /** The 2025 federal rows for the party, by seat. */
  federal: ReadonlyMap<number, LiveRow>
  /** The rows the lens draws (tonight's count where counted), by seat. */
  live: ReadonlyMap<number, LiveRow>
  names: ReadonlyMap<number, string>
  base: Rgb
  max: number
  pal: Palette
}

/** The census year the demographic figures come from (ABS Census 2021, in the one-nation asset). */
const CENSUS = 'ABS Census 2021'

const W = 300
const H = 128
const X = [52, 150, 248] as const
const TOP = 26
const BOTTOM = 84

/**
 * The party across three elections for one seat: 2022 state, 2025 federal (hollow, so it is not read as a state result) and
 * tonight (with % counted). A seat the party did not stand in shows "did not stand" at that point; a seat below the count
 * gate shows "no figures yet". Three dots and a line: the shape of the trend, not a forecast.
 */
function OverTimeChart({ final, series, colour, partyName, pal }: { series: OverTime; colour: string; partyName: string; pal: Palette; final: boolean }) {
  const points: { x: number; label: string; sub: string; p: Point | TonightPoint | null; hollow?: boolean }[] = [
    { x: X[0], label: '2022', sub: 'state', p: series.y2022 },
    { x: X[1], label: '2025', sub: 'federal', p: series.fed2025, hollow: true },
  ]
  if (series.tonight) {
    const t = series.tonight
    points.push({ x: X[2], label: final ? 'Final' : 'Tonight', sub: t.kind === 'pct' && t.counted !== null ? `${Math.round(t.counted)}% ${final ? 'turnout' : 'counted'}` : 'state count', p: t })
  }
  const values = points.flatMap((q) => (q.p?.kind === 'pct' ? [q.p.pct] : []))
  const top = Math.max(5, Math.ceil(Math.max(0, ...values) / 5) * 5)
  const y = (v: number) => BOTTOM - (v / top) * (BOTTOM - TOP)
  const drawn = points.filter((q) => q.p?.kind === 'pct') as (typeof points[number] & { p: { kind: 'pct'; pct: number } })[]
  const line = drawn.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x},${y(q.p.pct)}`).join(' ')
  const summary = points
    .map((q) => `${q.label} ${q.sub}: ${q.p === null ? 'loading' : q.p.kind === 'pct' ? `${q.p.pct.toFixed(1)}%` : q.p.kind === 'none' ? 'did not stand' : 'no figures yet'}`)
    .join('; ')
  return (
    <svg className="onl__trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${partyName} share of first preferences. ${summary}.`} data-testid="onl-seat-trend">
      <line x1="10" x2={W - 10} y1={BOTTOM} y2={BOTTOM} stroke="var(--color-border-strong)" />
      {line && drawn.length > 1 && <path d={line} fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.55" />}
      {points.map((q) => (
        <g key={q.label} data-testid="onl-seat-point" data-year={q.label} data-kind={q.p?.kind ?? 'loading'}>
          {q.p?.kind === 'pct' ? (
            <>
              <circle cx={q.x} cy={y(q.p.pct)} r="6" fill={q.hollow ? css(pal.paper) : colour} stroke={colour} strokeWidth={q.hollow ? 2.5 : 1.5} strokeDasharray={q.hollow ? '3 2' : undefined} />
              <text x={q.x} y={y(q.p.pct) - 11} textAnchor="middle" className="onl__trend-v">{q.p.pct.toFixed(1)}%</text>
            </>
          ) : (
            <text x={q.x} y={BOTTOM - 9} textAnchor="middle" className="onl__trend-n">{q.p === null ? '' : q.p.kind === 'none' ? 'did not stand' : 'no figures yet'}</text>
          )}
          <text x={q.x} y={BOTTOM + 15} textAnchor="middle" className="onl__trend-y">{q.label}</text>
          <text x={q.x} y={BOTTOM + 28} textAnchor="middle" className="onl__trend-s">{q.sub}</text>
        </g>
      ))}
    </svg>
  )
}

/**
 * VE-282: the side panel for a seat picked on "Where is each party strongest?". Viz first: the party over time, then where it
 * sits tonight, a few Census 2021 facts against the middle seat, the three seats the Similar lens ranks nearest, and the way
 * on (the main map, the forecast site). Everything is from assets the app already ships.
 */
export function SeatFactsPanel({ statics, party, pick, asset, federal, live, names, base, max, pal }: Props) {
  const id = pick.id
  const [fp2022, setFp2022] = useState<FirstPrefs2022Asset | null>(null)
  useEffect(() => {
    let alive = true
    import('../explore/arrows/fp-2022.json').then(
      (m) => alive && setFp2022(validateFp2022(m.default, new Set(statics.districtById.keys()))),
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [statics])

  const seat = pick.seats.get(id) ?? null
  const name = seatLabel(names.get(id) ?? seat?.name ?? String(id))
  const partyName = partyLabel(party)
  const fedRow = federal.get(id)
  const liveRow = live.get(id)
  const series = useMemo(() => {
    if (!fedRow) return null
    const row2022 = fp2022?.districts.find((d) => d.district_id === id)?.fp_2022_pct ?? null
    return overTime(party, { fp2022: fp2022 ? row2022 ?? {} : null, federal: fedRow, live: liveRow, counted: seat?.pct ?? null })
  }, [fedRow, liveRow, fp2022, id, party, seat?.pct])
  const place = useMemo(() => (seat && liveRow?.live ? placeIn(seat.fp, party) : null), [seat, liveRow, party])
  const facts = useMemo(() => demoFacts(id, asset), [asset, id])
  const like = useMemo(() => mostLike(id, live, names), [id, live, names])
  const colour = css(partyRgb(Math.max(max * 0.75, 1), base, max))
  // VE-291: the place is on first preferences; the leader the map names is after preferences, and the sentence says so.
  const placeText = place ? placeWords(place, { party, after: seat?.leader ?? null, final: pick.final }) : null

  return (
    <div className="lenspanel onl__seat" data-testid="onl-seatpanel" data-id={id}>
      <button type="button" className="multi__seat-back" data-testid="onl-seat-back" onClick={() => pick.clear?.()}>
        <span aria-hidden>←</span> All seats
      </button>
      <h2 className="multi__seat-name" data-testid="onl-seat-name">{name}</h2>
      {pick.notLive && <p className="onl__seat-notlive" data-testid="onl-seat-notlive">{pick.notLive}</p>}

      <h3 className="onl__seat-h">{partyName} over time</h3>
      {series ? <OverTimeChart final={pick.final} series={series} colour={colour} partyName={partyName} pal={pal} /> : <p className="onl__seat-note">No figures.</p>}

      {liveRow?.live && (
        <p className="onl__seat-place" data-testid="onl-seat-place">
          {place ? (
            <>
              <b>{placeText!.rank}</b>{placeText!.rest}
            </>
          ) : (
            <>{partyName} did not stand here.</>
          )}
        </p>
      )}

      {facts.length > 0 && (
        <>
          <h3 className="onl__seat-h">Key facts</h3>
          <dl className="onl__facts" data-testid="onl-seat-facts">
            {facts.map((f) => (
              <div key={f.key} className="onl__fact">
                <dt>{f.label}</dt>
                <dd><b>{f.value}</b> <span>(Vic median {f.vic})</span></dd>
              </div>
            ))}
          </dl>
          <p className="onl__seat-note" data-testid="onl-seat-source">{CENSUS}. Vic median: the middle of the 88 seats.</p>
        </>
      )}

      {like.length > 0 && (
        <>
          <h3 className="onl__seat-h">Seats most like this one</h3>
          <ol className="onl__like" data-testid="onl-seat-like">
            {like.map((l) => {
              const r = live.get(l.id)
              const sw = r && !r.noFigures && !r.notStanding ? css(partyRgb(r.pct, base, max)) : 'transparent'
              return (
                <li key={l.id}>
                  <button type="button" className="onl__like-row" data-testid="onl-seat-like-row" data-id={l.id} onClick={() => pick.pickOther?.(l.id)}>
                    <i className="onl__like-sw" style={{ background: sw }} aria-hidden />
                    <span>{seatLabel(l.name)}</span>
                    <span className="onl__like-v">{l.text}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}

      <p className="multi__seat-links">
        {pick.show && (
          <button type="button" className="like__link" data-testid="onl-seat-open" onClick={() => pick.show?.(id)}>Show {name} on the main map</button>
        )}
        {FORECAST_BASE && (
          <a
            className="multi__seat-forecast"
            data-testid="onl-seat-forecast"
            href={forecastHref(FORECAST_BASE, names.get(id) ?? name)}
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
