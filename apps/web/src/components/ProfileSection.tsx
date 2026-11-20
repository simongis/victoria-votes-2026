import { useEffect, useState } from 'react'
import { loadProfileData } from '../data/profileSource'
import { buildProfile, type Profile, type StandOutRow } from '../derive/profile'
import { InfoButton } from './InfoButton'
import { ProfileIcon } from './ProfileIcons'
import { loadSeifa, seifaRows, type SeifaRow } from './profile/seifa'
import '../styles/profile.css'

const people = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 })

/** A thin strip of all 88 seats: a faint tick each and the Victorian median tick. The dot is drawn over it in HTML so it stays round. */
function Strip({ row }: { row: StandOutRow }) {
  return (
    <svg className="pf-strip" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {row.ticks.map((t, i) => (
        <line key={i} className="pf-strip__tick" x1={t * 96 + 2} x2={t * 96 + 2} y1="3" y2="7" vectorEffect="non-scaling-stroke" />
      ))}
      <line className="pf-strip__median" x1={row.median * 96 + 2} x2={row.median * 96 + 2} y1="0.5" y2="9.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** VE-133: a thin bar from 0 to 100 per cent of residents, with a tick at the 20 per cent every fifth holds across Victoria. */
function SeifaBar({ row }: { row: SeifaRow }) {
  return (
    <li className="pf-seifa__row" data-testid="profile-seifa-row" data-key={row.key}>
      <span className="pf-seifa__text">{row.text}</span>
      <span className="pf-seifa__bar" aria-hidden="true">
        <span className={`pf-seifa__fill pf-seifa__fill--${row.key}`} style={{ width: `${Math.max(row.pct, row.pct > 0 ? 1 : 0)}%` }} />
        <span className="pf-seifa__ref" style={{ left: `${row.reference}%` }} />
      </span>
    </li>
  )
}

function Spark({ series }: { series: number[] }) {
  if (series.length < 2) return null
  const lo = Math.min(...series)
  const hi = Math.max(...series)
  const xy = series.map((v, i): [number, number] => [(i / (series.length - 1)) * 58 + 1, hi === lo ? 9 : 17 - ((v - lo) / (hi - lo)) * 16])
  const last = xy[xy.length - 1]!
  return (
    <svg className="pf-spark" viewBox="0 0 60 18" width="60" height="18" aria-hidden="true" focusable="false">
      <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
      <circle cx={last[0]} cy={last[1]} r="1.8" />
    </svg>
  )
}

/**
 * VE-68: who lives here and how it has changed since 2021. Fetches the two static tables only on first mount
 * (the first panel open), then reuses them. If they cannot load, the panel just omits this section.
 */
export function ProfileSection({ districtId }: { districtId: number }) {
  const [state, setState] = useState<{ profile: Profile | null; seifa: SeifaRow[] | null; ready: boolean }>({ profile: null, seifa: null, ready: false })

  useEffect(() => {
    let live = true
    loadProfileData().then(
      async (d) => {
        // The distribution is a separate lazy chunk checked against the 88 district ids; if it fails the section just omits it.
        const asset = await loadSeifa(new Set(d.demos.map((r) => r.district_id)))
        const seat = asset?.districts.find((r) => r.district_id === districtId)
        if (live) setState({ profile: buildProfile(districtId, d.changes, d.demos), seifa: seat ? seifaRows(seat) : null, ready: true })
      },
      () => live && setState({ profile: null, seifa: null, ready: true }),
    )
    return () => {
      live = false
    }
  }, [districtId])

  const p = state.profile
  const seifa = state.seifa
  if (!state.ready) return <div className="pf pf--loading" data-testid="profile-loading" aria-hidden="true" />
  if (!p || (!p.headline && p.rows.length === 0)) return null

  return (
    <section className="pf" aria-label="District profile" data-testid="profile">
      <div className="pf-head" data-testid="profile-headline">
        {p.headline && (
          <>
            <span className="pf-head__label">Population</span>
            <b className="pf-head__fig">
              {p.headline.changePct >= 0 ? '+' : '-'}
              {Math.abs(p.headline.changePct).toFixed(1)}%
            </b>
            <span className="pf-head__label">since 2021</span>
            <Spark series={p.headline.series} />
          </>
        )}
        <InfoButton label="About these figures" className="pf-info">
          <p>
            <b>Who lives here.</b> Since 2021 is the change in estimated resident population from June 2021 to June 2025 (ABS, preliminary), with the 15-year trend. The rows are the three measures where this seat is furthest from the Victorian middle. Each strip shows all 88 seats: the tall tick is the median and the dot is this seat.
          </p>
          <p>A ≈ marks a modelled or approximate figure: ABS data for larger areas, apportioned to district boundaries by Mesh Block. Treat small differences with care.</p>
          <p>
            Sources: ABS Census 2021 and SEIFA 2021; ABS Estimated Resident Population and migration; ABS building approvals; ABS rent and mortgage stress (Census 2021 based, released April 2024). Source: Australian Bureau of Statistics, licensed CC BY 4.0.
          </p>
          {seifa && (
            <p>
              <b>Fifths of Victoria.</b> The bars show the share of residents living in the most disadvantaged and most advantaged fifth of Victorian neighbourhoods (SEIFA 2021, IRSD and IRSAD). The tick is 20%, what an even spread would give. These describe seats and the people living in them, not how anyone votes, and the data is from 2021.
            </p>
          )}
          {p.dataSource && <p className="pf-info__small">{p.dataSource}.</p>}
        </InfoButton>
      </div>
      {p.headline?.pop2025 != null && <p className="pf-pop">{people.format(Math.round(p.headline.pop2025 / 100) * 100)} people in 2025</p>}
      <ul className="pf-rows" aria-label="Stands out">
        {p.rows.map((r) => (
          <li key={r.key} className="pf-row" data-testid="profile-row" aria-label={`${r.phrase} of 88 for ${r.label}: ${r.figure}`}>
            <ProfileIcon name={r.icon} />
            <span className="pf-row__text">
              <span className="pf-row__phrase">{r.phrase}</span> for {r.label}
            </span>
            <b className="pf-row__fig">
              {r.approx && (
                <span className="pf-approx" title="Modelled or approximate">
                  ≈
                </span>
              )}
              {r.figure}
            </b>
            <span className="pf-row__strip">
              <Strip row={r} />
              <span className="pf-dot" style={{ left: `${2 + r.position * 96}%` }} />
            </span>
          </li>
        ))}
      </ul>
      {seifa && (
        <ul className="pf-seifa" aria-label="Neighbourhood advantage" data-testid="profile-seifa">
          {seifa.map((r) => (
            <SeifaBar key={r.key} row={r} />
          ))}
        </ul>
      )}
    </section>
  )
}
