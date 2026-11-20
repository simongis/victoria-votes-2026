import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Tick } from '../data/types'
import type { ViewAction, ViewState } from '../state/view'
import type { BaseState } from '../state/timeState'
import { shownIndex } from '../state/view'
import { currentMotion, usePresence } from './DistrictPanel'
import { setPhoneBit } from '../state/phoneBits'
import { pickMarks } from '../derive/rewindMarks'

const SPEEDS = [1, 4, 8]

const HOUR_MS = 3600_000
/** Melbourne's offset from UTC is a whole number of hours, so a whole UTC hour is a whole Melbourne hour. */
const hourFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hour12: true })
const ODD_SPACES = new RegExp(`[${String.fromCharCode(0x202f, 0xa0)}]`, 'g')
/** `short` drops the space ("7pm") so more labels fit a phone's track (VE-185). */
const hourLabel = (ms: number, short = false): string => {
  const s = hourFmt.format(ms).replace(ODD_SPACES, ' ').toLowerCase()
  return short ? s.replace(' ', '') : s
}
/** Phones are under 1024 px, the same break the Rewind card goes compact at (app.css). */
const PHONE_QUERY = '(max-width: 1023.98px)'
/** Width of a label at the axis' 10px type, a little over, so the 8 px gap holds without measuring each one. */
const textW = (s: string): number => s.length * 6 + 2
const PHONE_GAP = 8
/** Room a tick's label needs either side of its centre, and the room the end labels ("6:03 pm", "Now") take at each edge, in px. */
const HOUR_GAP = 36
const END_LEFT = 52
const END_RIGHT = 34

/**
 * Hour ticks for the Rewind axis (VE-168, finding 21). The slider steps through the ticks evenly, so an hour sits where its
 * first tick does, not at its share of the clock time; the real tick times decide where each one goes. Only the night (the
 * first 12 hours) gets hours, and only as many as fit in `width` px beside the end labels. Kept in this file (the e2e spec proves it by what is on screen).
 */
function hourTicks(times: readonly number[], width: number, phone: { left: string; right: string } | null): { at: number; label: string }[] {
  const n = times.length - 1
  if (n <= 0 || times[0] === undefined) return []
  const start = times[0]
  const found: { at: number; label: string }[] = []
  let prev = Math.floor(start / HOUR_MS)
  for (let i = 1; i <= n; i++) {
    const t = times[i]!
    if (t - start >= 12 * HOUR_MS) break
    const h = Math.floor(t / HOUR_MS)
    if (h !== prev) {
      found.push({ at: i / n, label: hourLabel(h * HOUR_MS, phone !== null) })
      prev = h
    }
  }
  if (phone) {
    // VE-185: a phone's track is narrow, so the marks are short ("7pm") and picked by room: every hour, else every second or third.
    const marks = found.map((f) => ({ x: 8 + (width - 16) * f.at, w: textW(f.label), label: f.label }))
    const keep = pickMarks(marks, { width, leftEnd: textW(phone.left), rightEnd: textW(phone.right), gap: PHONE_GAP })
    return keep.map((k) => found[k]!)
  }
  const out: { at: number; label: string }[] = []
  let last = END_LEFT - HOUR_GAP
  for (const f of found) {
    const x = f.at * width
    if (x - last >= HOUR_GAP && x >= END_LEFT && x <= width - END_RIGHT) {
      out.push(f)
      last = x
    }
  }
  return out
}

interface Props {
  view: ViewState
  ticks: Tick[]
  label: (ms: number) => string
  dispatch: (a: ViewAction) => void
  /** What Back to now returns to: live, paused or final (ADR 0024). Final reads "Back to final". */
  base: BaseState
}

/**
 * Rewind as a pull-up: closed at rest (open on now), it scrubs and plays every tick so far. A small sparkline of
 * statewide % counted sits behind the slider to show the shape of the night. While the viewer is behind the latest tick
 * the button turns into "Back to now" (or "Back to final") in the rewind violet, and the top band's pill says
 * Rewinding (ADR 0024); the scrubber stays in the panel just above it.
 */
export function Rewind({ view, ticks, label, dispatch, base }: Props) {
  const n = view.nowIdx
  // The panel stays mounted for its leave animation (see usePresence); the stage makes room in step via CSS on .app.
  const motion = currentMotion()
  const { present, closing } = usePresence(view.rewindOpen, motion)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = panel.current
    if (!el) return
    if (closing) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [closing, present])
  // VE-144a: on a phone the footer strip is gone at rest and "Rewind the night" in the View sheet is the way in.
  useEffect(() => {
    setPhoneBit('rewind', { toggle: () => dispatch({ type: 'rewind' }) })
    return () => setPhoneBit('rewind', null)
  }, [dispatch])
  // The track's width decides how many hour ticks fit (VE-168). 150 is a phone's before the first measure.
  const [trackW, setTrackW] = useState(150)
  const roRef = useRef<ResizeObserver | null>(null)
  const trackRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    setTrackW(el.clientWidth || 150)
    roRef.current = new ResizeObserver(() => setTrackW(el.clientWidth || 150))
    roRef.current.observe(el)
  }, [])
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const startLabel = ticks[0] ? label(ticks[0].snapshotAt) : ''
  const endLabel = base === 'final' ? 'Final' : 'Now'
  const hours = useMemo(
    () => hourTicks(ticks.slice(0, n + 1).map((t) => t.snapshotAt), trackW, phone ? { left: startLabel, right: endLabel } : null),
    [ticks, n, trackW, phone, startLabel, endLabel],
  )
  const shown = shownIndex(view)
  const live = view.viewIdx === null
  const peak = Math.max(1, ...ticks.slice(0, n + 1).map((t) => t.countedPct))
  const xs = (i: number) => (n <= 0 ? 0 : (i / n) * 100)
  let d = ''
  for (let i = 0; i <= n; i++) d += `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(2)},${(24 - (ticks[i]!.countedPct / peak) * 22).toFixed(2)}`

  return (
    <div className={`rewind${view.rewindOpen ? ' rewind--open' : ''}`}>
      <div className="rewind__bar">
        {live ? (
          <button type="button" className="rewind__handle" aria-expanded={view.rewindOpen} aria-controls="rewind-panel" onClick={() => dispatch({ type: 'rewind' })}>
            {/* Material Symbols "history": a clock face with a counter-clockwise arrow. The button's text is its accessible name. */}
            <svg className="rewind__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
              <path
                fill="currentColor"
                d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
              />
            </svg>
            Rewind
          </button>
        ) : (
          <button type="button" className="rewind__handle rewind__back" data-testid="back-to-now" onClick={() => dispatch({ type: 'live' })}>
            {/* Material Symbols "skip_next": jump to the end, which is now. The text stays as the accessible name. */}
            <svg className="rewind__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
              <path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
            {base === 'final' ? 'Back to final' : 'Back to now'}
          </button>
        )}
      </div>
      {present && (
        <div ref={panel} className="rewind__panel" id="rewind-panel" data-motion={motion} data-state={closing ? 'closing' : 'open'}>
          <button
            type="button"
            className="icon-btn rewind__play"
            aria-label={view.playing ? 'Pause playback' : 'Play the night'}
            title={view.playing ? 'Pause playback' : 'Play the night'}
            disabled={n <= 0}
            onClick={() => dispatch({ type: view.playing ? 'pause' : 'play' })}
          >
            {view.playing ? '❚❚' : '▶'}
          </button>
          <div className="rewind__track" ref={trackRef}>
            <svg className="rewind__spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
              {d && <path d={`${d}L100,24L0,24Z`} />}
            </svg>
            <input
              type="range"
              min={0}
              max={Math.max(0, n)}
              step={1}
              value={Math.max(0, shown)}
              aria-label="Results time"
              aria-valuetext={shown < 0 ? 'No results yet' : live ? `${base === 'final' ? 'Final' : 'Now'}, ${label(ticks[shown]!.snapshotAt)}` : label(ticks[shown]!.snapshotAt)}
              onChange={(e) => dispatch({ type: 'scrub', idx: Number(e.target.value) })}
            />
            <div className="rewind__ends" aria-hidden>
              <span>{startLabel}</span>
              {hours.map((h) => (
                <span key={h.label} className="rewind__hour" data-testid="rewind-hour" style={{ left: `calc(8px + (100% - 16px) * ${h.at})` }}>
                  {h.label}
                </span>
              ))}
              <span>{endLabel}</span>
            </div>
          </div>
          <div className="segmented" role="group" aria-label="Playback speed">
            {SPEEDS.map((sp) => (
              <button key={sp} type="button" aria-pressed={view.speed === sp} onClick={() => dispatch({ type: 'speed', speed: sp })}>
                {sp}x
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
