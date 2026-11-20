import { getMotion } from '../state/motion'
import { drawHalos, HALO_MS, type HaloSpec } from './halo'
import { drawFrame, prepareGeometry, snapshotScreen, type FrameInfo, type PreparedGeometry, type ScreenSnapshot, type TransitionScene } from './draw'
import type { MorphShape } from './morph'
import {
  MODES,
  createCrossfade,
  createTimeline,
  modePos,
  planTransition,
  type Crossfade,
  type Mode,
  type MotionMode,
} from './timeline'

/**
 * Drives a canvas overlay from the timeline. At rest the overlay is cleared and `onStage` says active: false,
 * so the real views show; while a run is in flight `active` is true and the shell hides the views' shapes
 * (and fades their labels using mapLabels and seatLabels). Reduced motion never draws on the canvas: the shell
 * receives `crossfade` 0..1 and fades the views itself.
 */

export interface StageEvent {
  active: boolean
  mode: Mode
  frame: FrameInfo | null
  /** Reduced motion only: 0..1 fade from the old view to the new one. */
  crossfade: number | null
}

export interface RunnerOptions {
  canvas: HTMLCanvasElement
  geometry: MorphShape[]
  /** Called at the start of each run so pan, zoom and size are read fresh. */
  getScene: () => TransitionScene
  onStage?: (e: StageEvent) => void
  /** Defaults to the visitor's Animations setting (state/motion.ts). */
  motion?: () => MotionMode
  startMode?: Mode
  /** Injectable for tests. */
  raf?: (cb: (t: number) => void) => number
  caf?: (id: number) => void
}

export interface TransitionRunner {
  readonly mode: Mode
  readonly running: boolean
  /** Animate to `to`; resolves true on arrival, false if a later call superseded it. */
  run(to: Mode): Promise<boolean>
  /** Play the seat-flip halo once. Ignored (false) while a transition is in flight, so the two never overlap. */
  pulse(spec: HaloSpec): boolean
  /** Set the mode with no animation (initial state, or the shell changed view for another reason). */
  set(mode: Mode): void
  dispose(): void
}

export function createTransitionRunner(opts: RunnerOptions): TransitionRunner {
  const geom: PreparedGeometry = prepareGeometry(opts.geometry)
  const raf = opts.raf ?? ((cb) => requestAnimationFrame(cb))
  const caf = opts.caf ?? ((id) => cancelAnimationFrame(id))
  const emit = (e: StageEvent) => opts.onStage?.(e)
  const tl = createTimeline(modePos(opts.startMode ?? 'map'))
  let mode: Mode = opts.startMode ?? 'map'
  let snap: ScreenSnapshot | null = null
  let fade: Crossfade | null = null
  let fadeTo: Mode = mode
  let handle = 0
  let last = 0
  let settle: ((arrived: boolean) => void) | null = null

  let haloHandle = 0

  const ctx = () => opts.canvas.getContext('2d')

  function size(scene: { width: number; height: number }): void {
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1)
    const w = Math.round(scene.width * dpr)
    const h = Math.round(scene.height * dpr)
    if (opts.canvas.width !== w || opts.canvas.height !== h) {
      opts.canvas.width = w
      opts.canvas.height = h
    }
    ctx()?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function stopHalo(): void {
    if (!haloHandle) return
    caf(haloHandle)
    haloHandle = 0
    const c = ctx()
    if (c) c.clearRect(0, 0, opts.canvas.width, opts.canvas.height)
  }

  function finish(arrived: boolean): void {
    const c = ctx()
    const sc = snap?.scene
    snap = null
    fade = null
    const s = settle
    settle = null
    // Tell the shell first, then clear: a shell that reveals its views synchronously does so in the same paint
    // as the canvas clearing, so there is no blank frame between the two.
    emit({ active: false, mode, frame: null, crossfade: null })
    if (c && sc) c.clearRect(0, 0, sc.width, sc.height)
    s?.(arrived)
  }

  function frame(now: number): void {
    handle = 0
    const dt = Math.min(50, now - last)
    last = now
    if (fade) {
      fade.advance(dt)
      if (fade.progress >= 0.5) mode = fadeTo
      emit({ active: true, mode, frame: null, crossfade: fade.progress })
      if (fade.done) finish(true)
      else handle = raf(frame)
      return
    }
    tl.advance(dt)
    const c = ctx()
    if (snap && c) {
      const info = drawFrame(c, snap, tl.pos)
      emit({ active: tl.busy, mode, frame: info, crossfade: null })
    }
    if (tl.busy) handle = raf(frame)
    else {
      mode = MODES[Math.round(tl.pos)] ?? mode
      finish(true)
    }
  }

  return {
    get mode() {
      return mode
    },
    get running() {
      return handle !== 0
    },
    run(to) {
      const from = MODES[Math.round(tl.pos)] ?? mode
      const plan = planTransition(from, to, (opts.motion ?? getMotion)())
      if (plan.kind === 'none' && !tl.busy) return Promise.resolve(true)
      stopHalo()
      settle?.(false)
      const done = new Promise<boolean>((res) => (settle = res))
      if (plan.kind === 'crossfade') {
        tl.jumpTo(modePos(to))
        fade = createCrossfade(plan.durationMs)
        fadeTo = to
      } else {
        // Read the views once per run; a retarget mid-flight reuses the snapshot, so reversal is seamless.
        if (!snap) {
          const scene = opts.getScene()
          size(scene)
          snap = snapshotScreen(geom, scene)
        }
        tl.setTarget(modePos(to))
        mode = to
        // Draw the starting frame now, so the views can hide in the same paint as the first shapes appear.
        const c = ctx()
        if (c && snap) emit({ active: true, mode, frame: drawFrame(c, snap, tl.pos), crossfade: null })
      }
      if (!handle) {
        last = performance.now()
        handle = raf(frame)
      }
      return done
    },
    pulse(spec) {
      if (handle || tl.busy || fade) return false
      stopHalo()
      size(spec)
      const c = ctx()
      if (!c) return false
      const t0 = performance.now()
      const step = (now: number) => {
        const ms = now - t0
        drawHalos(c, spec, ms)
        if (ms < HALO_MS) haloHandle = raf(step)
        else haloHandle = 0
      }
      haloHandle = raf(step)
      return true
    },
    set(m) {
      stopHalo()
      if (handle) caf(handle)
      handle = 0
      tl.jumpTo(modePos(m))
      mode = m
      finish(false)
    },
    dispose() {
      stopHalo()
      if (handle) caf(handle)
      handle = 0
      settle?.(false)
      settle = null
    },
  }
}
