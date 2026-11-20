import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ComponentType } from 'react'
import type { Statics } from '../../data/types'
import type { Seat } from '../../derive/seats'
import { COUNTED_LENS_FINAL_TITLE, isFinal } from '../../derive/turnout'
import type { ExploreMode, ExploreState } from '../../state/view'
import { LENSES, questionOf, type LensDef, type LensProps } from './lenses'
import type { OneNationExtras } from './one-nation/OneNationLens'
import type { SimilarExtras } from './similar/SimilarLens'
import { markPeekIntroSeen, peekIntroDue, readPeek, writePeek, type PeekState } from './pref'
import { readyLenses } from './ready'
import { useNight } from './multiples/nightStore'
import { setPhoneBit } from '../../state/phoneBits'
import { FORECAST_BASE, forecastHref } from './forecastLink'
import { ForecastThumb } from './Thumbs'

interface Props {
  seats: Map<number, Seat>
  statics: Statics
  /** The lens open on the stage (from ?explore=), or null for the map. */
  explore: ExploreState | null
  onExplore: (e: ExploreState | null) => void
  /** Rewind is open or the viewer is looking back in time. The card stays (FB-123); it is told only so it can keep clear of Rewind on a phone. */
  rewinding: boolean
  /** A lens asked to show one seat on the main stage: the lens closes and the seat is selected (the panel opens). */
  onSelectSeat?: (id: number) => void
  /** The seat selected on the main stage, which the places-like-yours lens starts from. */
  selectedId?: number | null
  /** The moment on show (epoch ms), so a lens reads the same tick as the stage, live or in Rewind. */
  at?: number
  /** The results are the replay (or trial), not the live feed: a lens that reads replay-only data shows it marked, or not at all. */
  replay: boolean
  /** VE-149: why it is not live (the band badge's word), so a lens marker says Trial for trial data, not Replay. */
  dataLabel?: 'Replay' | 'Trial' | 'Not live' | null
}

const lensById = (id: string): LensDef | undefined => LENSES.find((l) => l.id === id)

/**
 * Explore (ADR 0022): a small card peeking from the bottom of the stage, a sheet of cards, and each view full stage
 * with a way back. The card can be minimised or dismissed, remembered per viewer. Everything here is chrome on the
 * stage, so the app's own view (shape, colour, selection, time) is exactly as it was when the viewer comes back.
 */
export function ExploreLayer({ seats, statics, explore, onExplore, rewinding, onSelectSeat, selectedId, at, replay, dataLabel }: Props) {
  const [peek, setPeek] = useState<PeekState>(readPeek)
  const [sheet, setSheet] = useState(false)
  // VE-210: the first-visit highlight. Marked seen after the first render, so a second visit does not pulse (the CSS skips it for reduced motion).
  const [intro] = useState(() => readPeek() === 'open' && peekIntroDue())
  useEffect(() => { if (intro) markPeekIntroSeen() }, [intro])
  const peekBtn = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLDivElement>(null)
  const lens = explore ? lensById(explore.lens) : undefined
  // lenses.ts is the host's contract and fixes LensProps; the extras ride along and are read by the lenses that declare them.
  const Lens = lens?.Lens as ComponentType<LensProps & OneNationExtras & SimilarExtras> | undefined
  // VE-165: the Counted lens asks about turnout once every seat is declared (the ramp is unchanged).
  const final = useMemo(() => isFinal(seats.values()), [seats])
  const lensTitle = lens?.id === 'counted' && final ? COUNTED_LENS_FINAL_TITLE : lens ? questionOf(lens, final) : ''
  // FB-148: a card or thumbnail only once its lens has enough data; an opened lens (a link) shows regardless.
  const night = useNight()
  // night is read through ready.ts (getNight); listing it here re-runs the test when the night moves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const offered = useMemo(() => readyLenses(LENSES, seats), [seats, night])

  // A link to a lens that does not exist opens the map.
  useEffect(() => {
    if (explore && !lens) onExplore(null)
  }, [explore, lens, onExplore])

  // VE-144a: the View sheet on a phone opens this same sheet of lenses, so it learns how many are offered and how to open it.
  // VE-200: the Polling model link is one more card when the build sets its address, so the count includes it.
  const offeredCount = offered.length + (FORECAST_BASE ? 1 : 0)
  useEffect(() => {
    setPhoneBit('moreWays', { count: offeredCount, open: () => setSheet(true) })
    return () => setPhoneBit('moreWays', null)
  }, [offeredCount])

  const setPeekState = useCallback((s: PeekState) => {
    setPeek(s)
    writePeek(s)
  }, [])

  // Where focus returns to when the sheet or a lens closes: the card the viewer came from.
  const wasOpen = useRef(false)
  const open = sheet || !!lens
  useEffect(() => {
    // On a phone the card is hidden (VE-144a) and the way in was View, so focus goes back there.
    if (wasOpen.current && !open)
      requestAnimationFrame(() => {
        const card = peekBtn.current
        const shown = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.offsetParent !== null
        // The stage chip is in the DOM but hidden on a phone, so take the first of the way-ins that is actually drawn.
        const target = [card, ...document.querySelectorAll('.more-ways-chip, .view-sheet__btn')].find(shown)
        target?.focus()
      })
    wasOpen.current = open
  }, [open])

  // Escape closes the sheet, then the lens. Capture phase and preventDefault, so the app's own Escape (clear the picked seat) does not also fire.
  useEffect(() => {
    if (!sheet && !lens) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      if (sheet) setSheet(false)
      else onExplore(null)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [sheet, lens, onExplore])

  // While a lens fills the stage, everything behind it is inert, so Tab and screen readers stay in the lens (VE-104).
  const lensId = lens?.id
  useEffect(() => {
    const el = lensRef.current
    if (!el) return
    // Walk up to the app root, making every sibling on the way inert: the band, rail, footer and panel sit outside the stage.
    const behind: Element[] = []
    for (let node: Element | null = el; node && !node.classList.contains('app'); node = node.parentElement) {
      for (const c of node.parentElement?.children ?? []) if (c !== node) behind.push(c)
    }
    behind.forEach((c) => c.setAttribute('inert', ''))
    return () => behind.forEach((c) => c.removeAttribute('inert'))
  }, [lensId])

  // Focus into the sheet when it opens.
  useEffect(() => {
    if (sheet) sheetRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [sheet])

  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button, a[href]')]
    if (items.length === 0) return
    const first = items[0]!
    const last = items[items.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const openLens = (id: string) => {
    setSheet(false)
    onExplore({ lens: id, mode: lensById(id)?.defaultMode ?? 'map' })
  }
  const showSeat = useCallback(
    (id: number) => {
      onExplore(null)
      onSelectSeat?.(id)
    },
    [onExplore, onSelectSeat],
  )
  const setMode = useCallback((mode: ExploreMode) => explore && onExplore({ ...explore, mode }), [explore, onExplore])

  const forecastTo = FORECAST_BASE ? forecastHref(FORECAST_BASE, selectedId != null ? seats.get(selectedId)?.name : null) : null

  const showPeek = peek !== 'gone'
  const cardHidden = !!lens

  return (
    <>
      {showPeek && (
        <div className="explore-peek" data-state={peek} data-rewinding={rewinding} data-pulse={intro || undefined} data-testid="explore-peek" style={cardHidden ? { display: 'none' } : undefined}>
          {peek === 'open' ? (
            <>
              <button ref={peekBtn} type="button" className="explore-peek__main" aria-haspopup="dialog" onClick={() => setSheet(true)}>
                {/* FB-183: over Rewind the card is just the label and its buttons, so it takes less room. */}
                {!rewinding && (
                  <>
                    <span className="explore-peek__thumbs">
                      {offered.map((l) => (
                        <l.Thumb key={l.id} />
                      ))}
                    </span>
                    {/* Phone (CSS): one icon replaces the four thumbnails, so the label stays on one line (VE-106). */}
                    <svg className="explore-peek__icon" viewBox="0 0 16 16" width="18" height="18" aria-hidden focusable="false">
                      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <rect x="9" y="9" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </>
                )}
                <span className="explore-peek__label">{offeredCount} more ways to see it</span>
              </button>
              <button type="button" className="explore-peek__x" aria-label="Minimise More ways to see it" title="Minimise" onClick={() => setPeekState('min')}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button type="button" className="explore-peek__x" aria-label="Dismiss More ways to see it" title="Dismiss" onClick={() => setPeekState('gone')}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </>
          ) : (
            <>
              <button ref={peekBtn} type="button" className="explore-peek__chip" aria-haspopup="dialog" onClick={() => setSheet(true)}>
                Explore
              </button>
              <button type="button" className="explore-peek__x" aria-label="Show More ways to see it again" title="Show the card" onClick={() => setPeekState('open')}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false"><path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </>
          )}
        </div>
      )}

      {/* Once the card is dismissed this small text button is the way back in: same place on desktop and phone (VE-104). */}
      {peek === 'gone' && !lens && (
        <button ref={peekBtn} type="button" className="explore-more" data-rewinding={rewinding} data-testid="explore-more" aria-haspopup="dialog" onClick={() => setSheet(true)}>
          More ways to see it
        </button>
      )}

      {sheet && (
        <div className="explore-sheet" data-testid="explore-sheet">
          <div className="explore-sheet__scrim" onClick={() => setSheet(false)} />
          <div ref={sheetRef} className="explore-sheet__card" role="dialog" aria-modal="true" aria-label="More ways to see it" onKeyDown={trap}>
            <div className="explore-sheet__head">
              <h2>More ways to see it</h2>
              <button type="button" className="explore-sheet__close" aria-label="Close" onClick={() => setSheet(false)}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden focusable="false"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
            <ul className="explore-sheet__grid">
              {offered.map((l) => (
                <li key={l.id}>
                  <button type="button" className="explore-card" data-lens={l.id} onClick={() => openLens(l.id)}>
                    <l.Thumb />
                    <span className="explore-card__q">{questionOf(l, final)}</span>
                  </button>
                </li>
              ))}
              {forecastTo && (
                <li>
                  {/* VE-200 (FB-231): a link out, never a result: the words say forecast and another site. */}
                  <a
                    className="explore-card explore-card--link"
                    data-lens="forecast"
                    href={forecastTo}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="What did the polls forecast? Polling model, another site. A forecast, not results. Opens in a new tab."
                  >
                    <ForecastThumb />
                    <span className="explore-card__q">What did the polls forecast?</span>
                    <span className="explore-card__sub">
                      Polling model
                      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden focusable="false"><path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {lens && Lens && explore && (
        <div ref={lensRef} className="explore-lens" data-testid="explore-lens" data-lens={lens.id} role="region" aria-label={lensTitle}>
          <Suspense fallback={<p className="explore-lens__loading" role="status">Loading...</p>}>
            <Lens seats={seats} statics={statics} mode={explore.mode} title={lensTitle} onMode={setMode} onShowSeat={showSeat} at={at} replay={replay} dataLabel={dataLabel} selectedId={selectedId} />
          </Suspense>
          {/* Where the Explore card sat, so the way back is where the way in was (FB-133). */}
          <div className="explore-lens__foot">
            <button type="button" className="explore-lens__back" data-testid="explore-back" aria-label="Back to the map" onClick={() => onExplore(null)}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden focusable="false"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {/* VE-227 (finding 4): a portrait phone shows just "Map" (CSS), at the start of the lens bar where View sits on the main map. */}
              <span aria-hidden>
                <span className="explore-lens__back-pre">Back to the </span>
                <span className="explore-lens__back-word">map</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
