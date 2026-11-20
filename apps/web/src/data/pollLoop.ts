/**
 * The polling loop behind useResults (VE-54): one check at a time, the next scheduled by pollPlan.nextDelay once
 * the last has finished, so two requests are never in flight. Framework-free so fake timers can drive it.
 */
import type { KillSwitchState } from '@vic26/schema'
import { nextDelay, shouldCatchUp } from './pollPlan'

export interface CheckResult {
  snapshotAt: number | null
  state: KillSwitchState | null | undefined
}

export interface PollLoopOptions {
  /** One check. Throws on failure. */
  check(): Promise<CheckResult>
  /** Fixed interval (replay demo clock). Skips jitter, hiding and backoff, which only make sense against a real server. */
  fixedMs?: number
  /** Called after every check with the failure count (0 after a success). */
  onCycle?(errors: number): void
  now?: () => number
  rand?: () => number
  doc?: VisibilityDoc
}

/** The slice of Document the loop uses, narrow so tests can fake it. */
export interface VisibilityDoc {
  readonly visibilityState: DocumentVisibilityState
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

/** Starts polling now; returns a stop function. */
export function startPolling(o: PollLoopOptions): () => void {
  const now = o.now ?? Date.now
  const rand = o.rand ?? Math.random
  const doc = o.doc ?? document
  let stopped = false
  let busy = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastCheckAt: number | null = null
  let errors = 0
  let held: CheckResult = { snapshotAt: null, state: null }

  const schedule = () => {
    if (stopped) return
    const delay =
      o.fixedMs ??
      nextDelay({ now: now(), snapshotAt: held.snapshotAt, visible: doc.visibilityState !== 'hidden', errors, state: held.state, rand })
    timer = setTimeout(() => void run(), delay)
  }

  async function run() {
    if (stopped || busy) return
    if (timer) clearTimeout(timer)
    timer = null
    busy = true
    try {
      held = await o.check()
      errors = 0
    } catch {
      errors += 1
    } finally {
      busy = false
      lastCheckAt = now()
      if (!stopped) o.onCycle?.(errors)
      schedule()
    }
  }

  const onVisible = () => {
    // Hiding replaces the pending 30 s wait with the 5 minute one; a check in flight just finishes and schedules itself.
    if (doc.visibilityState === 'hidden' && !busy && timer) {
      clearTimeout(timer)
      schedule()
    }
    if (o.fixedMs === undefined && shouldCatchUp({ now: now(), lastCheckAt, visible: doc.visibilityState !== 'hidden' })) void run()
  }
  doc.addEventListener('visibilitychange', onVisible)
  void run()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    doc.removeEventListener('visibilitychange', onVisible)
  }
}
