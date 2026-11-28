import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import '../../../styles/similar.css'
import { swingShown } from '../../../derive/colour'
import { gainShown } from '../../../derive/list'
import { changeWords, likePlaceRow, likePlacesHeadline } from '../../../derive/likePlaces'
import { sharedLine, sharedTraits } from '../../../derive/sharedTraits'
import { notLiveMarker } from '../../../derive/status'
import { ordinal } from '../../../derive/boothPanel'
import { isFinal } from '../../../derive/turnout'
import { css, usePalette } from '../../../theme/theme'
import { allDeclared, leaderRgb, LEAD_STEP_WORDS, stepRgb, type LeadStep } from '../../../views/encoding'
import type { ExploreMode } from '../../../state/view'
import { StageInfo } from '../../info/StageInfo'
import { SimilarArt } from '../../info/lensArt'
import { LIST_HALF, sheetGrows } from '../../sheet/sheet'
import { useSheet } from '../../sheet/useSheet'
import { loadTier, tierFor, type Tier } from '../../map/tiers'
import { CREDIT_NAME, CREDIT_URL, FORECAST_BASE, forecastSimilarHref } from '../forecastLink'
import type { LensProps } from '../lenses'
import { LensBar } from '../LensBar'
import { Shape } from '../Shape'
import { useTraitTable } from './sharedData'
import { locateSeat, type GeoLike } from './locate'
import { hexView, mapView, type Item, type View } from '../stageGeom'
import { VIC_OUTLINE_PATH, VIC_OUTLINE_VIEWBOX } from '../../map/vicOutline'
import { frameFor, tweenFrame, type Frame } from './framing'
import { NEAREST, SIMILAR_CREDIT, awayLine, bandOf, kmBetween, nearest, rankOf, rowLabel } from './similarity'
import { T, clearOverlays, drawGen, makeOverlays, paintLeaders, setHot, type Overlays, type ThreadView } from './threads'

/** What App passes beyond LensProps: the seat selected on the main stage (where the lens starts), and how the data is marked. */
export interface SimilarExtras {
  selectedId?: number | null
  /** The results are the replay (or trial): the leaders a row shows are then marked, never shown as real. Unknown counts as replay. */
  replay?: boolean
  dataLabel?: 'Replay' | 'Trial' | 'Not live' | null
}

const MODES: readonly { mode: ExploreMode; label: string }[] = [
  { mode: 'map', label: 'Map' },
  { mode: 'hex', label: 'Hex' },
]
/** The gap between the phone key and the map below it (VE-227). */
const LEGEND_GAP_PX = 6
const NARROW_PX = 700
/** Where the words are a bottom sheet (similar.css), and the closed sheet's height: just its 44 px handle. */
const PHONE_SHEET = '(max-width: 699px)'
const CLOSED_PX = 44
/** The main map's tick sizes per geometry tier (map/tiers.ts), to tell which tier is on show. */
const TIER_TICKS = [100, 25, 5] as const
/**
 * VE-209c (FB-246): the look of the five and their threads on the app's light paper (similar.css). "sand" is the
 * recommendation: the five in a warm sand with a sepia ink edge and a soft daylight halo, sepia ink threads with a
 * light casing, so they echo the lit round 1 look Simon picked without One Nation's orange. "ink" (white paper cut-outs
 * with a soft shadow) and "slate" are the round 3 alternatives (prototypes/similarity-map, Round 3); switching is this one word.
 */
const LOOK: 'ink' | 'sand' | 'slate' = 'sand'

/** Rank label radius in viewBox units: a hex's own size, or a share of the Map's width. */
function unitOf(view: View, shown: ExploreMode): number {
  if (shown === 'hex') {
    const it = view.items[0]
    const first = it?.geom.split(' ')[0]?.split(',').map(Number)
    return it && first ? Math.hypot(first[0]! - it.cx, first[1]! - it.cy) * 0.58 : 1
  }
  return view.vb[2] / 78
}

/**
 * VE-209 (FB-243), merged with Seats like this in VE-212 (FB-250): "How are seats like yours voting?" Pick a seat and
 * threads draw out to the five seats most like it, often far away. The ranks are place similarity only (no scores); the
 * votes are laid beside them: each place's leader colour and status line, and a headline that counts out of five. Before any
 * result the words give the 2022 holders. Counted votes only, from the time on show, so Rewind applies; never a forecast.
 */
export default function SimilarLens({ seats, statics, mode, title, onMode, onShowSeat, selectedId, replay = true, dataLabel }: LensProps & SimilarExtras) {
  const shown: ExploreMode = mode === 'hex' ? 'hex' : 'map'
  const pal = usePalette()
  const [tier, setTier] = useState<Tier | null>(null)
  const [picked, setPicked] = useState<number | null>(() => (selectedId != null && nearest(selectedId).length > 0 ? selectedId : null))
  const [hoverSeat, setHoverSeat] = useState<number | null>(null)
  const [hoverRow, setHoverRow] = useState<number | null>(null)
  // VE-213: the Map frames the picked seat and its five; "All of Victoria" zooms out until the next pick.
  const [zoomedOut, setZoomedOut] = useState(false)
  const [framed, setFramed] = useState(false)
  const frameRef = useRef<Frame | null>(null)
  const measureRef = useRef<(() => void) | null>(null)
  const lastViewRef = useRef<View | null>(null)
  const stopTween = useRef<(() => void) | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<SVGSVGElement>(null)
  const glowRef = useRef<SVGSVGElement>(null)
  const topRef = useRef<SVGSVGElement>(null)
  const ovRef = useRef<Overlays | null>(null)
  // VE-218 (FB-255), VE-228 (ADR 0035): on a phone the words ride in the shared bottom sheet. Peek shows the picker and headline;
  // half and full show what they share and the rows; closed (a drag down from peek) leaves only the handle. Desktop ignores it.
  const sheetRef = useRef<HTMLElement>(null)
  // The peeking (or closed) sheet's height, so the framing refits when the map area changes shape (a longer headline, a closed sheet).
  const [peekH, setPeekH] = useState(0)
  const sheet = useSheet(sheetRef, {
    query: PHONE_SHEET,
    share: LIST_HALF,
    full: true,
    fit: true,
    below: 'closed',
    closedPx: CLOSED_PX,
    scroller: () => sheetRef.current?.querySelector<HTMLElement>('.similar__more') ?? null,
    // The map keeps clear of the sheet at peek, published as --sheet-h (a CSS variable via the CSSOM, never an inline style
    // attribute); taller heights overlay the map, as the seat sheet does, so the map does not refit under them.
    onPlace: (stops, at) => {
      const h = stops.find((x) => x.name === (at === 'closed' ? 'closed' : 'peek'))?.h ?? 0
      rootRef.current?.style.setProperty('--sheet-h', `${h}px`)
      setPeekH(h)
    },
  })
  const { set: setSheet } = sheet
  // Off the phone sheet (desktop, or wider than the phone query) the map has the whole height.
  useLayoutEffect(() => {
    if (!sheet.active) rootRef.current?.style.removeProperty('--sheet-h')
  }, [sheet.active])

  // The Map outlines give both the Map view and the seat centres the distances are measured between, so they load for Hex too.
  useEffect(() => {
    let alive = true
    loadTier(window.innerWidth < NARROW_PX ? 0 : 1).then((t) => alive && setTier(t), () => undefined)
    return () => {
      alive = false
    }
  }, [])

  const mapV = useMemo(() => (tier ? mapView(tier, statics, false) : null), [tier, statics])
  const view: View | null = useMemo(() => (shown === 'hex' ? hexView(statics) : mapV), [shown, statics, mapV])
  const near = useMemo(() => (picked === null ? [] : nearest(picked)), [picked])
  const me = picked === null ? null : (seats.get(picked) ?? null)
  const nameOf = (id: number): string => seats.get(id)?.name ?? String(id)

  // VE-227 (finding 12): on a phone the key wraps over the top of the map, where a far-edge seat such as Mildura sits. Its height
  // (plus a gap) is published as --legend-h so the map starts below it, and the framing fits the room that is left.
  const [keyH, setKeyH] = useState(0)
  const hasKey = me !== null
  useLayoutEffect(() => {
    const root = rootRef.current
    const legend = stageRef.current?.querySelector<HTMLElement>('.similar__legend')
    if (!root) return
    const phone = window.matchMedia('(max-width: 699px)')
    const put = () => {
      const h = phone.matches && legend ? Math.round(legend.getBoundingClientRect().height) + LEGEND_GAP_PX : 0
      root.style.setProperty('--legend-h', `${h}px`)
      setKeyH(h)
    }
    put()
    const ro = new ResizeObserver(put)
    if (legend) ro.observe(legend)
    phone.addEventListener('change', put)
    return () => {
      ro.disconnect()
      phone.removeEventListener('change', put)
    }
  }, [hasKey])

  const byId = useMemo(() => new Map((view?.items ?? []).map((it): [number, Item] => [it.id, it])), [view])
  const tv: ThreadView | null = useMemo(() => {
    if (!view) return null
    return {
      vb: view.vb,
      // Follows the frame, so the rank labels stay the same size on screen at any zoom.
      get unit() {
        return shown === 'hex' ? unitOf(view, shown) : (frameRef.current ?? view.vb)[2] / 78
      },
      centre: (id) => {
        const it = byId.get(id)
        return it ? [it.cx, it.cy] : [0, 0]
      },
      shape: (id, cls, extra = {}) => {
        const it = byId.get(id)!
        const el = document.createElementNS('http://www.w3.org/2000/svg', shown === 'hex' ? 'polygon' : 'path')
        el.setAttribute(shown === 'hex' ? 'points' : 'd', it.geom)
        el.setAttribute('class', cls)
        for (const [k, v] of Object.entries(extra)) el.setAttribute(k, String(v))
        return el
      },
    }
  }, [view, shown, byId])

  // Overlays: set up once per view (Map or Hex), and kept the right pixel size by a resize observer so strokes and
  // badges look the same on a phone.
  useLayoutEffect(() => {
    const glow = glowRef.current
    const top = topRef.current
    const stage = stageRef.current
    const base = baseRef.current
    if (!tv || !glow || !top || !stage || !base) return
    const ov = makeOverlays(tv, glow, top)
    ovRef.current = ov
    const measure = () => {
      const r = base.getBoundingClientRect()
      if (!r.width || !r.height) return
      const f = frameRef.current ?? tv.vb
      const px = Math.max(f[2] / r.width, f[3] / r.height)
      if (Math.abs(px - ov.px) / ov.px < 0.01 && stage.style.getPropertyValue('--px')) return
      ov.px = px
      // The blurs are in world units, so they follow the zoom to keep the same softness on screen (4.1 and 1.3 px).
      const blurs = glow.querySelectorAll('feGaussianBlur')
      blurs[0]?.setAttribute('stdDeviation', String(px * 4.1))
      blurs[1]?.setAttribute('stdDeviation', String(px * 1.3))
      stage.style.setProperty('--px', String(px))
      ov.relayout()
    }
    measureRef.current = measure
    // A rebuilt overlay (Map to Hex and back) starts at the frame already on show.
    const vbNow = (frameRef.current ?? tv.vb).join(' ')
    for (const el of [base, glow, top]) el.setAttribute('viewBox', vbNow)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(base)
    return () => {
      ro.disconnect()
      measureRef.current = null
      ovRef.current = null
      glow.replaceChildren()
      top.replaceChildren()
    }
  }, [tv])

  // VE-213: frame the picked seat and its five (Map only; Hex stays whole), eased with the app's motion setting and instant
  // with reduced motion. Strokes, badges and blurs are screen-pixel sized (measure), so only the viewBox moves.
  useLayoutEffect(() => {
    const base = baseRef.current
    const glow = glowRef.current
    const top = topRef.current
    if (!view || !base || !glow || !top) return
    const r = base.getBoundingClientRect()
    const aspect = r.width && r.height ? r.width / r.height : 1.4
    const boxes = [picked, ...near].map((id) => (id === null ? undefined : byId.get(id)?.box))
    const target = shown === 'map' && !zoomedOut && picked !== null && boxes.every((b) => b !== undefined) ? frameFor(boxes as NonNullable<(typeof boxes)[number]>[], view.vb, aspect) : null
    const goal: Frame = target ?? view.vb
    setFramed(target !== null)
    stopTween.current?.()
    const apply = (f: Frame) => {
      frameRef.current = f
      for (const el of [base, glow, top]) el.setAttribute('viewBox', f.join(' '))
      measureRef.current?.()
    }
    // VE-218 (FB-257): the same rule as the main map: fetch a finer outline once the zoom shows the difference (tierFor), never a
    // coarser one again. A phone starts on the coarsest, so a framed city would otherwise stay blocky.
    if (shown === 'map' && tier && r.width > 0) {
      const have = TIER_TICKS.indexOf(tier.tick as (typeof TIER_TICKS)[number])
      const want = tierFor((goal[2] * tier.tick) / r.width)
      if (want > have) loadTier(want).then((t) => setTier((cur) => (cur && TIER_TICKS.indexOf(cur.tick as (typeof TIER_TICKS)[number]) >= want ? cur : t)), () => undefined)
    }
    const sameView = lastViewRef.current === view
    lastViewRef.current = view
    const from = frameRef.current
    const off = document.documentElement.dataset['motion'] === 'off'
    if (!sameView || !from || off || shown === 'hex') apply(goal)
    else stopTween.current = tweenFrame(from, goal, 380, apply)
    return () => stopTween.current?.()
  }, [view, shown, picked, near, zoomedOut, byId, tier, peekH, keyH])

  // Draw the threads for the picked seat: the old set fades first, then the new draws (threads.ts). The rows read the lead-in off --lead.
  useLayoutEffect(() => {
    const ov = ovRef.current
    if (!ov || !tv) return
    if (picked === null || near.length === 0) {
      clearOverlays(ov)
      return
    }
    const lead = drawGen(tv, ov, picked, near, true)
    rootRef.current?.style.setProperty('--lead', `${lead}ms`)
  }, [tv, picked, near])

  // One thread lit at a time: a row hovered or focused, or a lit seat hovered on the map.
  const hot = hoverRow ?? (hoverSeat !== null && near.includes(hoverSeat) ? hoverSeat : null)
  useLayoutEffect(() => {
    if (ovRef.current) setHot(ovRef.current, hot)
  }, [hot, tv, picked, near])

  // VE-212: the picked seat and the five wear their leader colour once they have a leader, and go back to Sand when a
  // Rewind takes them to before they reported. Runs after the draw above, so a freshly drawn set is painted too.
  useLayoutEffect(() => {
    const ov = ovRef.current
    if (!ov || !tv) return
    paintLeaders(ov, picked, (id) => {
      const s = seats.get(id)
      return s?.leader ? css(leaderRgb(s, pal)) : null
    }, (id) => { const s = seats.get(id); return !!s && gainShown(s) })
  }, [tv, picked, near, seats, pal])

  const pick = (id: number | null) => {
    setPicked(id)
    setZoomedOut(false)
    setHoverRow(null)
    setHoverSeat(null)
    // A new pick raises a closed sheet to peek, so the words always answer the tap.
    setSheet((d) => (d === 'closed' ? 'peek' : d))
  }
  // VE-221 (B14): the lens opens on the seat the reader picked or searched. With none it asks "Which is your seat?", and the
  // button beside the picker may use the device's location. Called only from that button's click, never on load; the point is
  // matched here against the loaded district shapes, and nothing is sent or stored. Any failure leaves the picker as it was.
  const [locating, setLocating] = useState(false)
  const [locNote, setLocNote] = useState<string | null>(null)
  const findMySeat = async () => {
    setLocating(true)
    setLocNote(null)
    const geo: GeoLike | undefined = typeof navigator !== 'undefined' ? navigator.geolocation : undefined
    const r = await locateSeat(statics.districts, geo)
    setLocating(false)
    if (r.ok && nearest(r.id).length > 0) pick(r.id)
    else setLocNote(r.ok ? 'No match for your seat. Choose it from the list.' : r.reason === 'outside' ? 'You look to be outside Victoria. Choose a seat from the list.' : r.reason === 'denied' ? 'Location is off for this site. Choose your seat from the list.' : 'Could not find where you are. Choose your seat from the list.')
  }
  const idOf = (t: EventTarget | null): number | null => {
    const el = t instanceof Element ? t.closest<SVGElement>('[data-id]') : null
    return el ? Number(el.dataset['id']) : null
  }
  const onOver = (e: PointerEvent) => e.pointerType === 'mouse' && setHoverSeat(idOf(e.target))
  const onOut = (e: PointerEvent) => e.pointerType === 'mouse' && setHoverSeat(idOf(e.relatedTarget))
  const onTap = (e: MouseEvent) => {
    const id = idOf(e.target)
    if (id === null) return
    pick(picked === id ? null : id)
  }

  const names = useMemo(
    () => [...seats.values()].filter((s) => nearest(s.id).length > 0).sort((a, b) => a.name.localeCompare(b.name, 'en-AU')),
    [seats],
  )
  const kmTo = (id: number): number | null => {
    const a = mapV?.items.find((it) => it.id === picked)
    const b = mapV?.items.find((it) => it.id === id)
    return a && b && tier ? kmBetween({ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }, tier.tick) : null
  }
  const rows = near.map((id, i) => {
    const s = seats.get(id)
    const status = s ? likePlaceRow(s) : { party: null, line: 'Not counted yet', held: null }
    const away = awayLine(kmTo(id))
    return { id, rank: i + 1, name: nameOf(id), away, status, change: s ? changeWords(s) : null, rgb: s?.leader ? css(leaderRgb(s, pal)) : null }
  })
  const seatIds = useMemo(() => new Set(seats.keys()), [seats])
  const traitTable = useTraitTable(seatIds)
  const traits = useMemo(() => (picked !== null && traitTable ? sharedTraits(picked, near, traitTable) : []), [picked, near, traitTable])
  const shareLine = sharedLine(traits)
  const final = useMemo(() => isFinal(seats.values()), [seats])
  // The swing is the one the seat panel shows at this time (swingShown: nothing under the counted threshold or with a changed pairing).
  const swingOfPlace = (id: number): number | null => { const s = seats.get(id); return s ? swingShown(s, statics.districtById.get(id)) : null }
  const words = picked !== null && near.length > 0 ? likePlacesHeadline(picked, near, seats, final, swingOfPlace) : null
  // Any of the five has a result: the colours, the key and (for replay or trial data) the marker all depend on it.
  const anyLeader = near.some((id) => seats.get(id)?.leader) || (me?.leader ?? null) !== null
  const showKey = anyLeader && !allDeclared(seats.values())

  const hovered = hoverSeat !== null ? seats.get(hoverSeat) : undefined
  const hoverText = !hovered ? '' : hoverSeat === picked ? `${hovered.name}: picked seat` : picked !== null ? `${hovered.name}: ${rankOf(picked, hoverSeat!) === null ? 'not in the five' : `${ordinal(rankOf(picked, hoverSeat!)!)} most like ${seats.get(picked)?.name ?? 'the picked seat'}`}` : hovered.name
  const spoken = me && near.length > 0 ? `The ${NEAREST} seats most like ${me.name}: ${rows.map((r) => `${r.rank} ${r.name}`).join(', ')}.` : ''
  const svgLabel = `${shown === 'hex' ? 'Hexagons' : 'Map'} of the 88 seats.${me ? ` Threads run from ${me.name} to the ${NEAREST} seats most like it.` : ' Pick a seat to see the five seats most like it.'}`

  return (
    <div className="arrows similar" data-mode={shown} data-testid="similar-lens" ref={rootRef}>
      <LensBar
        title={title}
        modes={MODES}
        mode={shown}
        onMode={onMode}
        info={
          <StageInfo label="About seats that are alike">
            <div className="similar__info">
              <SimilarArt />
              {/* VE-303 (Simon expected voting to count): say plainly that "alike" is about the place only. */}
              <p data-testid="similar-meaning"><b>Alike as places (Census, land use, built form), not by past votes.</b> It describes places, not people.</p>
              <p>It is a rank, not a score.</p>
              {traits.length > 0 && me && (
                <>
                  <p>What they share comes from the Census and SEIFA; the ranking itself comes from the place model.</p>
                  <table className="similar__shared" data-testid="similar-shared-table">
                    <caption className="sr-only">What {me.name} and the five seats most like it share</caption>
                    <thead>
                      <tr>
                        <th scope="col">Seat</th>
                        {traits.map((t) => (
                          <th scope="col" key={t.key}>{t.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {traits[0]!.values.map((v, i) => (
                        <tr key={v.id}>
                          <th scope="row">{nameOf(v.id)}</th>
                          {traits.map((t) => (
                            <td key={t.key}>{t.values[i]!.text ?? '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="similar__credit">Source: Australian Bureau of Statistics (Census 2021 and SEIFA 2021), licensed CC BY 4.0.</p>
                </>
              )}
              <p>Only counted votes are shown. It is not a forecast.</p>
              {/* VE-312 (Simon): the credit names the site, never a person, and the site's name always links to it. */}
              <p className="similar__credit" data-testid="similar-credit">
                {SIMILAR_CREDIT}{' '}
                <a href={CREDIT_URL} target="_blank" rel="noopener noreferrer" data-testid="similar-credit-link">{CREDIT_NAME}</a>
              </p>
            </div>
          </StageInfo>
        }
      />

      <div className="similar__body">
        <div className="similar__stage" data-look={LOOK} ref={stageRef} onPointerOver={onOver} onPointerOut={onOut} onClick={onTap}>
          {view ? (
            <>
              <svg ref={baseRef} className="similar__svg" viewBox={view.vb.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label={svgLabel}>
                {view.items.map((it) => {
                  const r = picked === null || it.id === picked ? null : rankOf(picked, it.id)
                  return <Shape key={it.id} mode={shown} it={it} className="similar__seat" data-id={it.id} data-testid="similar-seat" data-band={r === null ? undefined : bandOf(r)} />
                })}
              </svg>
              <svg key={`g${shown}`} ref={glowRef} className="ov ov--glow" viewBox={view.vb.join(' ')} preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-testid="similar-glow" />
              <svg key={`t${shown}`} ref={topRef} className="ov ov--top" viewBox={view.vb.join(' ')} preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-testid="similar-threads" />
              {shown === 'map' && (framed || zoomedOut) && (
                <button type="button" className="similar__fit" data-testid="similar-fit" onClick={() => setZoomedOut((z) => !z)}>
                  <svg viewBox={VIC_OUTLINE_VIEWBOX} aria-hidden="true">
                    <path d={VIC_OUTLINE_PATH} />
                  </svg>
                  {zoomedOut ? 'Zoom to these seats' : 'All of Victoria'}
                </button>
              )}
              <p className="similar__hover" aria-hidden="true" data-testid="similar-hover">{hoverText}</p>
              {me && (
                <ul className="similar__legend" aria-hidden="true" data-testid="similar-legend">
                  <li><i className="similar__sw similar__sw--pick" />Picked seat</li>
                  <li><i className="similar__sw similar__sw--glow" />Five most alike</li>
                  {near.some((id) => { const s = seats.get(id); return !!s && gainShown(s) }) && <li data-testid="similar-gain-key"><i className="similar__sw similar__sw--gain" />Changing hands</li>}
                  {/* The app's Leader key: the same three steps, drawn in Labor's colour so it never reshuffles (StageControls). */}
                  {showKey && ([0, 1, 2] as LeadStep[]).map((step) => (
                    <li key={step} data-testid="similar-key"><i className="similar__sw similar__sw--lead" style={{ background: css(stepRgb('ALP', step, pal)) }} />{LEAD_STEP_WORDS[step]}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="explore-lens__loading" role="status">Loading...</p>
          )}
        </div>

        <aside className="similar__panel" aria-label="Seats most like the picked seat" data-testid="similar-sheet" ref={sheetRef}>
          <button
            type="button"
            className="similar__grip"
            data-testid="similar-grip"
            aria-expanded={sheet.detent === 'half' || sheet.detent === 'full'}
            aria-label={sheet.detent === 'closed' ? 'Show the seats most like this seat' : sheetGrows(sheet) ? 'Show more' : 'Show less'}
            onClick={sheet.step}
            {...sheet.zone}
          />
          <label className="similar__pick" {...sheet.zone}>
            {me ? 'Seat' : 'Which is your seat?'}
            <select className="similar__select" value={picked ?? ''} data-testid="similar-select" onChange={(e) => pick(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">Choose a seat</option>
              {names.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          {me && near.length > 0 ? (
            <>
              <h3 className="similar__head" data-testid="similar-head" data-sheet-peek>{words?.headline}</h3>
              <div className="similar__more">
              {shareLine && <p className="similar__share" data-testid="similar-share">{shareLine}</p>}
              {words?.picked && <p className="similar__picked" data-testid="similar-picked">{words.picked}</p>}
              <ol className="similar__list" key={me.id} aria-label={`The ${near.length} seats most like ${me.name}`} data-testid="similar-list">
                {rows.map((r) => (
                  <li key={r.id} className="enter" style={{ animationDelay: `calc(var(--lead, 0ms) + ${r.rank - 1}*${T.STAGGER}ms)` } as CSSProperties}>
                    <button
                      type="button"
                      className={`similar__row${hot === r.id ? ' is-hot' : ''}`}
                      data-testid="similar-row"
                      data-district={r.id}
                      aria-label={rowLabel(r.rank, r.name, r.away, `${r.status.line}${r.change ? `, ${r.change}` : ''}${r.status.held ? `, ${r.status.held}` : ''}`)}
                      onClick={() => pick(r.id)}
                      onPointerEnter={(e) => e.pointerType === 'mouse' && setHoverRow(r.id)}
                      onPointerLeave={() => setHoverRow(null)}
                      onFocus={() => setHoverRow(r.id)}
                      onBlur={() => setHoverRow(null)}
                    >
                      <span className="similar__n" aria-hidden>{r.rank}</span>
                      <span className="similar__t">
                        <span className="similar__name">{r.name}</span>
                        {r.away && <span className="similar__sub" data-testid="similar-away">{r.away}</span>}
                        <span className="similar__status" data-testid="similar-status" data-party={r.status.party ?? undefined}>
                          <i className="similar__dot" data-none={r.rgb ? undefined : ''} style={r.rgb ? { background: r.rgb } : undefined} aria-hidden />
                          {r.status.line}{r.change && ` · ${r.change}`}
                        </span>
                        {r.status.held && <span className="similar__muted" data-testid="similar-held">{r.status.held}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {anyLeader && replay && <p className="similar__note" data-testid="similar-marker">{notLiveMarker(dataLabel ?? 'Replay')}</p>}
              {onShowSeat && (
                <p className="similar__src">
                  <button type="button" className="like__link" data-testid="similar-open" onClick={() => onShowSeat(me.id)}>Open {me.name} on the main map</button>
                </p>
              )}
              {FORECAST_BASE && (
                <p className="similar__src">
                  <a href={forecastSimilarHref(FORECAST_BASE, me.name)} target="_blank" rel="noopener noreferrer" data-testid="similar-source" aria-label={`${me.name} on the polling model, on another site (opens in a new tab)`}>
                    {me.name} on the polling model {'↗'}
                  </a>
                </p>
              )}
              </div>
              <p className="sr-only" role="status">{spoken}</p>
            </>
          ) : (
            <>
              <p className="similar__lead" data-testid="similar-hint">Choose your seat, or tap one on the map, to see the five seats most like it.</p>
              <button type="button" className="similar__locate" data-testid="similar-locate" data-sheet-peek disabled={locating} onClick={() => void findMySeat()}>
                {locating ? 'Finding your seat...' : 'Use my location'}
              </button>
              {locNote && <p className="similar__lead" role="status" data-testid="similar-locate-note" data-sheet-peek>{locNote}</p>}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
