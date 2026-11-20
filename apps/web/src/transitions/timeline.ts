/**
 * Timing, easing and the transition scalar, all pure. One scalar `pos` runs 0 = Map, 1 = Seats, 2 = Tally; every
 * frame is a function of pos, so a mid-flight click only retargets it. Velocity ramps (about 130 ms to full
 * speed), so reversing never jolts: position and velocity are both continuous across a retarget.
 */

export type Mode = 'map' | 'seats' | 'tally'
export const MODES: Mode[] = ['map', 'seats', 'tally']
export const modePos = (m: Mode): number => MODES.indexOf(m)

/** Milliseconds, from docs/research/transitions-and-wow.md section 5. */
export const TIMING = {
  labelsOutMs: 250,
  morphMs: 1000,
  labelsInMs: 300,
  chipMs: 200,
  flyMs: 900,
  staggerMaxMs: 320,
  staggerEachMs: 8,
  countMs: 400,
  crossfadeMs: 450,
  rampMs: 130,
  /** Two segments in one go would take about 3 s at base speed. */
  chainSpeedup: 1.3,
} as const

/** Duration of pos 0..1 (labels out, morph, labels in) and pos 1..2 (chips, stagger, fly, count). */
export const SEGMENT_MS: [number, number] = [
  TIMING.labelsOutMs + TIMING.morphMs + TIMING.labelsInMs,
  TIMING.chipMs + TIMING.staggerMaxMs + TIMING.flyMs + TIMING.countMs,
]

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export interface MorphStage {
  /** 0..1 shape progress (eased). */
  e: number
  /** Opacity of the Map view's labels: out first when leaving Map. */
  mapLabels: number
  /** Opacity of the Seats view's labels: in last when arriving at Seats. */
  seatLabels: number
}

/** p is the segment progress 0..1 (pos for the Map-Seats segment). */
export function morphStage(p: number): MorphStage {
  const ms = clamp01(p) * SEGMENT_MS[0]
  const { labelsOutMs, morphMs, labelsInMs } = TIMING
  return {
    e: ease(clamp01((ms - labelsOutMs) / morphMs)),
    mapLabels: 1 - smooth(0, 1, ms / labelsOutMs),
    seatLabels: smooth(0, 1, (ms - labelsOutMs - morphMs) / labelsInMs),
  }
}

export interface TallyStage {
  /** Hex to chip, 0..1 (eased). */
  shrink: number
  /** Chip to bar slot and count-up, 0..1 (eased). */
  settle: number
  /** Milliseconds into the segment, for per-seat flight. */
  ms: number
}

/** p is the segment progress 0..1 (pos - 1 for the Seats-Tally segment). */
export function tallyStage(p: number): TallyStage {
  const ms = clamp01(p) * SEGMENT_MS[1]
  const { chipMs, staggerMaxMs, flyMs, countMs } = TIMING
  return {
    ms,
    shrink: ease(clamp01(ms / chipMs)),
    settle: ease(clamp01((ms - (chipMs + staggerMaxMs + flyMs)) / countMs)),
  }
}

/** Flight progress 0..1 for a seat of the given rank within its party block (a block travels together). */
export function flyProgress(ms: number, rankInBlock: number): number {
  const delay = Math.min(TIMING.staggerMaxMs, rankInBlock * TIMING.staggerEachMs)
  return ease(clamp01((ms - TIMING.chipMs - delay) / TIMING.flyMs))
}

export interface Timeline {
  readonly pos: number
  readonly target: number
  readonly velocity: number
  readonly busy: boolean
  setTarget(t: number): void
  /** Jump straight to a position (scrubbing, or a second tap on the mode already heading there). */
  jumpTo(p: number): void
  /** Advance by dt milliseconds; dt is capped so a stalled tab does not teleport. */
  advance(dt: number): void
}

export function createTimeline(initial = 0, durations: [number, number] = SEGMENT_MS): Timeline {
  let pos = initial
  let target = initial
  let v = 0
  const accel = 1 / durations[0] / TIMING.rampMs // pos per ms per ms
  return {
    get pos() {
      return pos
    },
    get target() {
      return target
    },
    get velocity() {
      return v
    },
    get busy() {
      return pos !== target || v !== 0
    },
    setTarget(t) {
      target = t
    },
    jumpTo(p) {
      pos = target = p
      v = 0
    },
    advance(dtRaw) {
      const dt = Math.min(50, Math.max(0, dtRaw))
      const d = target - pos
      if (d === 0 && v === 0) return
      const dir = d !== 0 ? Math.sign(d) : Math.sign(v)
      const seg = dir > 0 ? (pos < 1 ? 0 : 1) : pos > 1 ? 1 : 0
      const speed = (1 / durations[seg]!) * (Math.abs(d) > 1 ? TIMING.chainSpeedup : 1)
      const vt = d === 0 ? 0 : dir * speed
      v += Math.max(-accel * dt, Math.min(accel * dt, vt - v))
      const next = pos + v * dt
      if ((target - pos) * (target - next) <= 0) {
        pos = target
        v = 0
      } else pos = next
    },
  }
}

/** Reduced motion: nothing moves; the old view fades to the new one. */
export interface Crossfade {
  readonly progress: number
  readonly done: boolean
  advance(dt: number): void
}

export function createCrossfade(ms: number = TIMING.crossfadeMs): Crossfade {
  let t = 0
  return {
    get progress() {
      return clamp01(t / ms)
    },
    get done() {
      return t >= ms
    },
    advance(dt) {
      t += Math.max(0, dt)
    },
  }
}

export type MotionMode = 'full' | 'reduced'

export interface TransitionPlan {
  kind: 'chain' | 'crossfade' | 'none'
  from: Mode
  to: Mode
  /** Total running time at base speed. */
  durationMs: number
}

export function planTransition(from: Mode, to: Mode, motion: MotionMode): TransitionPlan {
  if (from === to) return { kind: 'none', from, to, durationMs: 0 }
  if (motion === 'reduced') return { kind: 'crossfade', from, to, durationMs: TIMING.crossfadeMs }
  const a = modePos(from)
  const b = modePos(to)
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  let ms = 0
  for (let s = lo; s < hi; s++) ms += SEGMENT_MS[s]!
  return { kind: 'chain', from, to, durationMs: hi - lo > 1 ? ms / TIMING.chainSpeedup : ms }
}
