/* eslint-disable react-refresh/only-export-components -- the context, its hooks and the components that read them belong together (the cost is a full reload, not a fast refresh, when this file changes) */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { changesBetween, freshness, type SeatChange } from '../derive/changes'
import type { SeatPaint } from '../derive/colour'
import type { Seat } from '../derive/seats'
import type { Rgb } from '../theme/theme'
import { getMotion } from '../state/motion'
import { rollChipText } from './rollChip'
import '../styles/effects.css'

/**
 * Update effects (VE-60, docs/research/update-effects.md): what the views do when a new snapshot arrives, so people
 * can see what changed. One cue per event, quiet for counts, distinct for flips, settled for declared.
 *
 * What changed comes from `derive/changes.ts` (previous snapshot against the new one). It is worked out during
 * render, in the same pass that puts the new figures on screen, so a number never lands without its cue. Only a
 * single step forward or back animates: a scrub jump, a first load or a snapshot that changes nothing animates
 * nothing. Cues wait for a view morph to land, and are dropped after HOLD_MS (the overlays then unmount).
 */

/** How long an update's overlays stay mounted. Longest cue: flip halo, 450 + 1,200 ms. */
export const HOLD_MS = 2400

export interface Fx {
  /** Changes with every shown tick; the key that restarts a cue. */
  seq: number
  /** The cues may show now: this step changed something, no morph is in flight, and the hold has not run out. */
  active: boolean
  /** Reduced motion: still-frame cues only (no roll, wipe, scale or movement). */
  reduced: boolean
  /** Multiplies every duration; under 1 while Rewind plays fast. */
  scale: number
  changes: ReadonlyMap<number, SeatChange>
  /** The previous snapshot's seat for each changed seat, so a flip can wipe from the old colour. */
  prevSeats: ReadonlyMap<number, Seat>
  prevRgb: ReadonlyMap<number, Rgb>
  /** 0..1 freshness of each recently counted seat (the dot). Present whether or not a cue is active. */
  fresh: ReadonlyMap<number, number>
}

const NONE = new Map<number, never>() as ReadonlyMap<number, never>
export const NO_FX: Fx = { seq: 0, active: false, reduced: false, scale: 1, changes: NONE, prevSeats: NONE, prevRgb: NONE, fresh: NONE }

const FxContext = createContext<Fx>(NO_FX)
export const FxProvider = FxContext.Provider
export const useFx = (): Fx => useContext(FxContext)

interface Track {
  idx: number
  seats: Map<number, Seat>
  paints: Map<number, SeatPaint>
  seq: number
  changes: ReadonlyMap<number, SeatChange>
  prevSeats: ReadonlyMap<number, Seat>
  prevRgb: ReadonlyMap<number, Rgb>
}

interface Args {
  idx: number
  seats: Map<number, Seat>
  paints: Map<number, SeatPaint>
  seatsAt: readonly Map<number, Seat>[]
  ticks: readonly { snapshotAt: number }[]
  /** A view morph is in flight: cues queue until it lands. */
  morphing: boolean
  /** Following the latest figures (not scrubbed back). */
  live: boolean
  playing: boolean
  speed: number
}

/** Rewind at speed s plays a step every 1200 / s ms, so cues shorten, but never below 0.4 (they must still read). */
export const fxScale = (playing: boolean, speed: number): number => (playing ? Math.max(0.4, 1 / Math.sqrt(speed)) : 1)

const isReduced = (): boolean => getMotion() === 'reduced'

export function useUpdateEffects(a: Args): Fx {
  // The previous tick is kept in state and compared during render (React's "adjust state on a prop change" pattern),
  // so the new figures and their cue arrive in one commit.
  const [track, setTrack] = useState<Track>({ idx: a.idx, seats: a.seats, paints: a.paints, seq: 0, changes: NONE, prevSeats: NONE, prevRgb: NONE })
  let cur = track
  if (track.idx !== a.idx || track.seats !== a.seats || track.paints !== a.paints) {
    if (track.idx !== a.idx) {
      const step = track.idx >= 0 && a.idx >= 0 && Math.abs(a.idx - track.idx) === 1
      const changes = step ? changesBetween(track.seats, a.seats) : NONE
      const prevSeats = new Map<number, Seat>()
      const prevRgb = new Map<number, Rgb>()
      for (const id of changes.keys()) {
        const s = track.seats.get(id)
        const p = track.paints.get(id)
        if (s) prevSeats.set(id, s)
        if (p) prevRgb.set(id, p.rgb)
      }
      cur = { idx: a.idx, seats: a.seats, paints: a.paints, seq: track.seq + 1, changes, prevSeats, prevRgb }
    } else {
      // Same tick, new objects (a colour or focus change, or the timeline rebuilt): keep the cue, keep the latest.
      cur = { ...track, seats: a.seats, paints: a.paints }
    }
    setTrack(cur)
  }

  const [done, setDone] = useState(0)
  const hasChanges = cur.changes.size > 0
  useEffect(() => {
    if (!hasChanges || a.morphing) return
    // The hold starts once the cue has had a frame to paint: on a slow phone a step can block the main thread for
    // longer than the hold, and a timer started at commit would remove the cue before anyone saw it.
    let t = 0
    const f = requestAnimationFrame(() => {
      t = window.setTimeout(() => setDone(cur.seq), HOLD_MS)
    })
    return () => {
      cancelAnimationFrame(f)
      window.clearTimeout(t)
    }
  }, [cur.seq, hasChanges, a.morphing])

  const active = hasChanges && done !== cur.seq && !a.morphing
  const fresh = useMemo(() => freshness(a.seatsAt, a.ticks, a.idx, a.live ? 'live' : 'rewind'), [a.seatsAt, a.ticks, a.idx, a.live])
  const scale = fxScale(a.playing, a.speed)
  const reduced = isReduced()
  return useMemo(
    () => ({ seq: cur.seq, active, reduced, scale, changes: cur.changes, prevSeats: cur.prevSeats, prevRgb: cur.prevRgb, fresh }),
    [cur.seq, active, reduced, scale, cur.changes, cur.prevSeats, cur.prevRgb, fresh],
  )
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3
const NUMBER_MS = 700
const CHIP_MS = 1600
const CHIP_HOLD_MS = 2000

/**
 * A number that rolls to its new value (cubic ease-out, 700 ms) when a cue is active, and otherwise just changes.
 * It always ends on the exact value, and under reduced motion jumps straight there. The text is written to the DOM
 * directly (no React state per frame), so a tick that moves 88 rail rows costs no re-renders.
 * Returns refs for the value and, optionally, a "+n" chip that shows the change for 1.6 s (held 2 s when reduced).
 */
export function useRoll(value: number, digits = 0, chip = false) {
  const fx = useFx()
  const fxRef = useRef(fx)
  const valueRef = useRef<HTMLSpanElement>(null)
  const chipRef = useRef<HTMLSpanElement>(null)
  const shown = useRef<number | null>(null)
  /** The last value asked for: what the reader was told, while `shown` may be half way through a roll. */
  const target = useRef<number | null>(null)
  const raf = useRef(0)
  useLayoutEffect(() => {
    fxRef.current = fx
  })
  useLayoutEffect(() => {
    const el = valueRef.current
    if (!el) return
    const f = fxRef.current
    const from = shown.current
    const last = target.current
    target.current = value
    const write = (n: number) => {
      el.textContent = n.toFixed(digits)
    }
    window.cancelAnimationFrame(raf.current)
    if (from === null || from === value || !f.active) {
      shown.current = value
      write(value)
      return
    }
    const chipEl = chipRef.current
    // VE-291: the change is from the last count given, not the half-rolled number on screen (that wrote "+0").
    const text = rollChipText(last ?? from, value, digits)
    if (chip && chipEl && text !== null && typeof chipEl.animate === 'function') {
      chipEl.textContent = text
      chipEl.getAnimations().forEach((x) => x.cancel())
      if (f.reduced) {
        chipEl.animate([{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: CHIP_HOLD_MS })
      } else {
        chipEl.animate(
          [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)', offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
          { duration: CHIP_MS * f.scale, easing: 'ease-out' },
        )
      }
    }
    if (f.reduced) {
      shown.current = value
      write(value)
      return
    }
    const t0 = performance.now()
    const dur = NUMBER_MS * f.scale
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur)
      const v = k >= 1 ? value : from + (value - from) * easeOut(k)
      shown.current = v
      write(v)
      if (k < 1) raf.current = window.requestAnimationFrame(step)
    }
    raf.current = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(raf.current)
  }, [value, digits, chip])
  return { valueRef, chipRef }
}

/** A rolling number as inline text; `chip` adds the "+n" after it. */
export function Roll({ value, digits = 0, chip = false }: { value: number; digits?: number; chip?: boolean }) {
  const { valueRef, chipRef } = useRoll(value, digits, chip)
  return (
    <>
      <span ref={valueRef} />
      {chip && <span ref={chipRef} className="fx-chip" aria-hidden />}
    </>
  )
}

/**
 * The ARIA live line (polite): what changed on the last step, for screen readers in every motion mode. It speaks
 * only when something changed, and says nothing for a scrub jump.
 */
export function FxAnnouncer({ seats }: { seats: ReadonlyMap<number, Seat> }) {
  const fx = useFx()
  const text = useMemo(() => {
    if (fx.changes.size === 0) return ''
    const names = (pick: (c: SeatChange) => boolean) => [...fx.changes].filter(([, c]) => pick(c)).map(([id]) => seats.get(id)?.name ?? String(id))
    const flipped = names((c) => c.flipped)
    const declared = names((c) => c.declared)
    const parts = [`${fx.changes.size} ${fx.changes.size === 1 ? 'seat' : 'seats'} updated`]
    if (flipped.length) parts.push(`leader changed in ${flipped.slice(0, 5).join(', ')}${flipped.length > 5 ? ` and ${flipped.length - 5} more` : ''}`)
    if (declared.length) parts.push(`declared: ${declared.slice(0, 5).join(', ')}${declared.length > 5 ? ` and ${declared.length - 5} more` : ''}`)
    return parts.join('. ')
  }, [fx.changes, seats])
  return (
    <p className="sr-only" aria-live="polite" data-testid="fx-live">
      {text}
    </p>
  )
}
