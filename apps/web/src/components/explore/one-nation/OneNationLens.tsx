import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { StrongestArt } from '../../info/lensArt'
import type { OneNationAsset, ShareParty } from '@vic26/schema'
import { useBoothData, useBoothSource, useBoothsAvailable } from '../../booths/data'
import { PARTY_OPTIONS, partyLabel, quintileBands, rampMax } from '../../../derive/oneNation'
import type { ExploreMode } from '../../../state/view'
import { usePalette } from '../../../theme/theme'
import { StageInfo } from '../../info/StageInfo'
import { loadTier, type Tier } from '../../map/tiers'
import { partyRows } from '../../lenspanel/party'
import type { LensProps } from '../lenses'
import { LensBar } from '../LensBar'
import { hexView, mapView, useSize, type View } from '../stageGeom'
import { BandsKey, BandsView } from './BandsView'
import { FlowKey, FlowView } from './FlowView'
import { flowLanes, flowReady, flowRows, flowSentence, parseFlowHistory } from './flow'
import { MEASURES, valueOf } from './measures'
import { PartyKey, PartyView } from './PartyView'
import { LIVE_MIN_PCT, countingStarted, liveMarker, liveRows, liveSentence } from './live'
import { clearSeatPick, setSeatPick } from './seatStore'
import { isFinal } from '../../../derive/turnout'
import { loadPartyAsset, resetParty, setFinal, setFlow, setLive, setParty, useParty } from './partyStore'
import { hasResults, ONP_POLLS, pollsLineFor } from './polls'
import { isCoarsePointer, moreHint } from './moreHint'
import { useSeatPick } from './useSeatPick'
import { notLiveMarker } from '../../../derive/status'

/** What App passes through ExploreLayer beyond LensProps (VE-101g). */
export interface OneNationExtras {
  /** The moment on show (epoch ms): the viewed tick, so Rewind and live both read the right booths. Absent before the first figures. */
  at?: number
  /** The results come from the 2022 replay (or trial), not the live feed. Defaults to true: unknown is treated as replay, so replay data is never shown unmarked. */
  replay?: boolean
  /** VE-149: the not-live word for the marker (Replay, Trial or Not live). Absent means Replay, the safe default. */
  dataLabel?: 'Replay' | 'Trial' | 'Not live' | null
}

const NARROW_PX = 700
const MARKER = 'From the 2025 federal election, mapped to state seats'
const NOT_AVAILABLE = 'These figures are not available.'

type Top = 'vote' | 'share' | 'flow'
const TOPS: readonly { id: Top; label: string }[] = [
  { id: 'vote', label: 'Vote share' },
  { id: 'share', label: 'Seat profile' },
  { id: 'flow', label: 'Other votes' },
]
// The other-votes view reads booth history from whichever source is in use (VE-136). Any not-live data (replay, or an AGOL status of trial or replay) carries the marker (hard rule 2, VE-149); a live source shows 2026 booths unmarked.
const SHAPES: readonly { mode: 'map' | 'hex'; label: string }[] = [
  { mode: 'map', label: 'Map' },
  { mode: 'hex', label: 'Hex' },
]
// An old ?mode=like link opens the vote map, the nearest view that still exists.
const topOf = (m: ExploreMode): Top => (m === 'share' ? 'share' : 'vote')

/** `null` while loading, `'failed'` when the file would not load or would not validate. */
type AssetState = OneNationAsset | 'failed' | null

/** Move to the next or previous radio in a group with the arrow keys, as the other lenses' mode switches do. */
function radioKeys<T extends string>(items: readonly T[], current: T, set: (v: T) => void, attr: string) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const next = items[(items.indexOf(current) + step + items.length) % items.length]!
    set(next)
    const host = e.currentTarget
    requestAnimationFrame(() => host.querySelector<HTMLButtonElement>(`[${attr}="${next}"]`)?.focus())
  }
}

/**
 * Where is each party strongest? (VE-101, VE-101e.) The chosen party's federal first-preference share in 2025, estimated onto
 * the 88 state seats (ADR 0025: a static asset, validated before use). It opens on One Nation and offers the same view for
 * Labor, the Coalition, the Greens and Independents, with the same colour logic and wording for each. It is about seats,
 * never people, and a link between seats is not a cause. The lens never shows an unvalidated figure.
 */
export default function OneNationLens({ seats, statics, mode, title, onMode, onShowSeat, at, replay = true, dataLabel }: LensProps & OneNationExtras) {
  const pal = usePalette()
  const party = useParty()
  const option = PARTY_OPTIONS.find((o) => o.id === party)!
  const base = pal.party[option.bucket]
  const [asset, setAsset] = useState<AssetState>(null)
  const [tier, setTier] = useState<Tier | null>(null)
  const [measureKey, setMeasureKey] = useState<string | null>(null)
  const pick = useSeatPick()
  const [flowOn, setFlowOn] = useState(false)
  const [stageRef] = useSize<HTMLDivElement>()
  // The shape (Map or Hex) the viewer last chose, so coming back from the profile returns to it.
  const [lastShape, setLastShape] = useState<'map' | 'hex'>('map')
  if ((mode === 'map' || mode === 'hex') && mode !== lastShape) setLastShape(mode)
  const shape: 'map' | 'hex' = mode === 'hex' ? 'hex' : mode === 'map' ? 'map' : lastShape

  // The asset loads with the lens (its own chunk), then is checked against the district statics (hold last good).
  useEffect(() => {
    let alive = true
    loadPartyAsset(new Set(statics.districtById.keys())).then((a) => alive && setAsset(a ?? 'failed'))
    return () => {
      alive = false
    }
  }, [statics])
  // The booth history for the other-votes view: loaded quietly from the source in use (the replay's file, or the live
  // booth_history layer, topped up as the viewed tick moves), and the view simply never appears if it will not load.
  const boothSource = useBoothSource()
  const booths = useBoothData(useBoothsAvailable(boothSource), boothSource, at ?? 0)
  const history = useMemo(() => (booths.status === 'ready' ? parseFlowHistory(booths.data.columns) : null), [booths])
  const flow = useMemo(() => {
    if (!history || at === undefined) return null
    const input = [...seats.values()].map((s) => ({ id: s.id, tcp: s.tcp ? { a: s.tcp.a, b: s.tcp.b } : null }))
    return flowRows(input, history, at)
  }, [history, seats, at])
  const flowOk = flow !== null && flowReady(flow.rows)
  const resultsIn = useMemo(() => hasResults(seats.values()), [seats])
  const lanes = useMemo(() => flowLanes(flow?.rows ?? []), [flow])
  const flowById = useMemo(() => new Map((flow?.rows ?? []).map((r) => [r.id, r] as const)), [flow])
  // Closing the lens puts the choice back to One Nation, so it opens there next time.
  useEffect(() => resetParty, [])

  useEffect(() => {
    let alive = true
    loadTier(window.innerWidth < NARROW_PX ? 0 : 1).then((t) => alive && setTier(t), () => undefined)
    return () => {
      alive = false
    }
  }, [])

  const ready = asset !== null && asset !== 'failed' ? asset : null
  const names = useMemo(() => new Map([...statics.districtById].map(([id, d]) => [id, d.short_name] as const)), [statics])
  const view: View | null = useMemo(() => (shape === 'hex' ? hexView(statics) : tier ? mapView(tier, statics, false) : null), [shape, tier, statics])

  // One row per seat for the chosen party; the same function the side panel ranks.
  const list = useMemo(() => liveRows(partyRows(ready?.party_shares ?? [], party, names), seats.values(), party), [ready, party, names, seats])
  const liveCount = useMemo(() => list.filter((r) => r.live).length, [list])
  // VE-282: from the first figures on the map shows only tonight's count; before that, the 2025 estimate.
  const final = useMemo(() => isFinal(seats.values()), [seats])
  useEffect(() => { setFinal(final); return () => setFinal(false) }, [final])
  const started = useMemo(() => countingStarted(seats.values()), [seats])
  const byId = useMemo(() => new Map(list.map((r) => [r.id, r] as const)), [list])
  const max = useMemo(() => rampMax(list.filter((r) => !r.notStanding && !r.noFigures).map((r) => r.pct)), [list])
  const measure = MEASURES.find((m) => m.key === measureKey) ?? MEASURES[0]!
  const censusById = useMemo(() => new Map((ready?.districts ?? []).map((s) => [s.district_id, s] as const)), [ready])
  const bands = useMemo(
    () =>
      quintileBands(
        list.flatMap((r) => {
          if (r.noFigures) return []
          const seat = censusById.get(r.id)
          const x = seat ? valueOf(measure, seat) : null
          return x === null ? [] : [{ id: r.id, x, share: r.pct }]
        }),
      ),
    [list, censusById, measure],
  )

  const top: Top = flowOn && flowOk ? 'flow' : topOf(mode)
  // The side panel ranks the split while this view is open (it reads it from the store), and goes back to the party ranking after.
  const shownFlow = top === 'flow' ? flow?.rows ?? null : null
  useEffect(() => {
    setFlow(shownFlow)
    return () => setFlow(null)
  }, [shownFlow])
  // The panel and the phone handle rank the same rows the vote map draws (VE-270).
  const shownLive = top === 'flow' || !ready ? null : list
  useEffect(() => {
    setLive(shownLive)
    return () => setLive(null)
  }, [shownLive])
  const wordsFor = (id: number): string => {
    if (top === 'flow') {
      const f = flowById.get(id)
      return f ? flowSentence(f, names.get(id) ?? '') : ''
    }
    const r = byId.get(id)
    if (!r) return ''
    if (top === 'share') {
      const seat = censusById.get(id)
      const v = seat ? valueOf(measure, seat) : null
      return `${liveSentence(r, party, final)} ${measure.chip}: ${v === null ? 'no figure' : measure.fmt(v)}.`
    }
    return liveSentence(r, party, final)
  }

  const setTop = (t: Top) => {
    pick.clear()
    setFlowOn(t === 'flow')
    if (t !== 'flow') onMode(t === 'vote' ? lastShape : 'share')
  }
  const choose = (p: ShareParty) => {
    pick.clear()
    setParty(p)
  }
  // VE-282: the pill follows hover and focus. The held seat's details are in the side panel (published below); only the Other
  // votes view, which has no panel for a seat, keeps its held pill with the "Show this seat" button.
  const activeId = top === 'flow' ? pick.active : pick.previewing
  const holding = top === 'flow' && activeId !== null && pick.sticky === activeId && pick.hover === null
  const pickedId = top === 'flow' ? null : pick.sticky
  const notLiveWord = replay ? notLiveMarker(dataLabel ?? 'Replay') : null
  const { clear: clearPick, select: selectSeat } = pick
  useEffect(() => {
    setSeatPick({ id: pickedId, seats, replay, final, notLive: notLiveWord, clear: clearPick, show: onShowSeat ?? null, pickOther: selectSeat })
  }, [pickedId, seats, replay, final, notLiveWord, clearPick, selectSeat, onShowSeat])
  useEffect(() => clearSeatPick, [])
  // A phone's seat list is a collapsed sheet: a pick opens it so the facts are on screen (the lens cannot reach the sheet's state, so it presses its handle, as the Multiples lens does).
  useEffect(() => {
    if (pickedId === null) return
    document.querySelector<HTMLButtonElement>('.rail[data-open="false"] .rail__handle')?.click()
  }, [pickedId])

  if (asset === 'failed') {
    return (
      <div className="arrows onl" data-mode={top} data-testid="onl-lens">
        <LensBar title={title} />
        <p className="onl__marker">{MARKER}</p>
        <p className="onl__failed" role="status" data-testid="onl-failed">{NOT_AVAILABLE}</p>
      </div>
    )
  }

  const name = partyLabel(party)
  // Seats on tonight's count are named in the marker; replay or trial figures say so too (hard rule 2), whatever the view.
  const liveOn = top !== 'flow' && started
  const liveLine = liveMarker(liveCount, list.length, started, final)
  const markerText = top === 'flow' ? (replay ? notLiveMarker(dataLabel ?? 'Replay') : MARKER) : liveOn ? (replay ? `${notLiveMarker(dataLabel ?? 'Replay')}. ${liveLine}` : liveLine) : MARKER
  // The third view is offered only once enough seats have both counts (FB-148: hide until there is something to see).
  const tops = TOPS.filter((t) => t.id !== 'flow' || flowOk)
  const partialCount = list.filter((r) => r.partial && !r.notStanding && !r.noFigures).length
  const noneCount = list.filter((r) => r.notStanding).length
  const waitCount = list.filter((r) => r.noFigures).length
  const caption =
    top === 'flow'
      ? 'The votes of candidates outside the top two, split between the top two. Seats, not people.'
      : top === 'vote'
      ? ''
      : `Seats in the top fifth for ${measure.noun} average ${bands[0]!.mean.toFixed(1)}% for ${name}; the bottom fifth, ${bands[4]!.mean.toFixed(1)}%. Seats, not people.`

  return (
    <div className="arrows onl" data-mode={top} data-testid="onl-lens">
      <LensBar
        title={title}
        modes={top === 'vote' ? SHAPES : undefined}
        mode={shape}
        onMode={onMode}
        info={
          top === 'flow' ? (
            <StageInfo label="About this view">
              <p>When a seat is down to two candidates, VEC counts each ballot again for those two. The gain each finalist makes between the two counts is where the votes of everyone else went.</p>
              <p>This is all the other candidates&apos; votes together, not any one party&apos;s voters. It uses only polling places that have both counts, and leaves out early and postal votes. Seats with an Independent or Other finalist, or too few such votes, are left out.</p>
              <p>It is about seats, never people. Source: Victorian Electoral Commission.</p>
            </StageInfo>
          ) : (
          <StageInfo label="About this view">
            <StrongestArt top={top} base={base} max={max} partyName={name} />
            <p>Federal votes from 2025 show until counting starts, then tonight&apos;s count only. &quot;No figures yet&quot;: under {LIVE_MIN_PCT}% counted.</p>
            <p>The Coalition is the Liberals and Nationals together.</p>
            <p>About seats, never people; a link is not a cause. The state results take over. Sources: © Commonwealth of Australia, Australian Electoral Commission (CC BY 4.0); ABS Census 2021.</p>
            {!resultsIn && pollsLineFor(party, ONP_POLLS) !== '' && <p data-testid="onl-polls">{pollsLineFor(party, ONP_POLLS)}</p>}
          </StageInfo>
          )
        }
      >
        {top !== 'flow' && (
        <div className="segmented" style={{ flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', maxWidth: '100%' }} role="radiogroup" aria-label="Party" data-testid="onl-parties" onKeyDown={radioKeys(PARTY_OPTIONS.map((o) => o.id), party, choose, 'data-party')}>
          {PARTY_OPTIONS.map((o) => (
            <button key={o.id} type="button" role="radio" data-party={o.id} aria-checked={party === o.id} tabIndex={party === o.id ? 0 : -1} onClick={() => choose(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
        )}
        <div className="segmented" role="radiogroup" aria-label="What to show" onKeyDown={radioKeys(tops.map((t) => t.id), top, setTop, 'data-top')}>
          {tops.map((t) => (
            <button key={t.id} type="button" role="radio" data-top={t.id} aria-checked={top === t.id} tabIndex={top === t.id ? 0 : -1} onClick={() => setTop(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </LensBar>

      <p className="onl__marker" data-testid="onl-marker" data-kind={top === 'flow' && replay ? 'notlive' : 'source'} data-live={started && top !== 'flow'}>{markerText}</p>

      {top === 'share' && (
        <div className="onl__chips" role="group" aria-label="Sort seats by" data-testid="onl-measures">
          {MEASURES.map((m) => (
            <button key={m.key} type="button" className="onl__chip" data-measure={m.key} aria-pressed={m.key === measure.key} onClick={() => { pick.clear(); setMeasureKey(m.key) }}>
              {m.chip}
            </button>
          ))}
        </div>
      )}
      {caption !== '' && <p className="arrows__caption onl__caption" data-testid="onl-caption">{ready ? caption : ''}</p>}

      <div className="arrows__stage onl__stage" ref={stageRef}>
        <div className="onl__plot" {...pick.container}>
          {!ready ? (
            <p className="explore-lens__loading" role="status">Loading...</p>
          ) : top === 'flow' ? (
            <FlowView lanes={lanes} names={names} words={wordsFor} pal={pal} pick={pick} />
          ) : top === 'vote' ? (
            <PartyView final={final} view={view} shape={shape} rows={byId} base={base} max={max} partyName={name} names={names} words={wordsFor} pal={pal} pick={pick} />
          ) : (
            <BandsView final={final} bands={bands} rows={byId} measure={measure} base={base} max={max} partyName={name} names={names} words={wordsFor} pal={pal} pick={pick} />
          )}
        </div>
        {activeId !== null && byId.has(activeId) && (
          <div className="onl__pill" role="status" data-testid="onl-pill" data-top={top} data-id={activeId} data-held={holding}>
            <span>{wordsFor(activeId)}</span>
            {holding ? (
              <span className="onl__pill__act">
                <button type="button" className="onl__show" data-testid="onl-show" onClick={() => onShowSeat?.(activeId)}>Show this seat</button>
                <span className="onl__pill__hint">Tap again to clear.</span>
              </span>
            ) : (
              <span className="onl__pill__hint">{moreHint(isCoarsePointer())}</span>
            )}
          </div>
        )}
      </div>

      {ready && top === 'vote' && <PartyKey wait={waitCount} partyName={name} base={base} max={max} partial={partialCount} none={noneCount} />}
      {ready && top === 'share' && <BandsKey base={base} max={max} />}
      {ready && top === 'flow' && <FlowKey parties={lanes} />}
    </div>
  )
}
