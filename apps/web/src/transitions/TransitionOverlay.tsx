import { useEffect, useRef, type CSSProperties, type MutableRefObject } from 'react'
import type { MorphShape } from './morph'
import { createTransitionRunner, type StageEvent, type TransitionRunner } from './runner'
import type { TransitionScene } from './draw'
import type { Mode } from './timeline'

/**
 * A canvas that sits over the map and seats panes (position: absolute, inset 0, pointer-events none). It draws
 * only mid-flight; at rest it is blank and the real views show. The shell keeps the runner in `runnerRef` and
 * calls `runnerRef.current?.run('seats')` when the view changes.
 */

export interface TransitionOverlayProps {
  /** Pairs from buildMorphShapes, built once per geometry load. */
  geometry: MorphShape[]
  /** Read at the start of each run: size, projections (map and seats), seat colours, theme colours. */
  getScene: () => TransitionScene
  /** Stage changes: hide the real views' shapes while active, fade labels, show cross-fade, count numerals. */
  onStage?: (e: StageEvent) => void
  runnerRef: MutableRefObject<TransitionRunner | null>
  startMode?: Mode
  className?: string
}

const style: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }

export function TransitionOverlay({ geometry, getScene, onStage, runnerRef, startMode, className }: TransitionOverlayProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Latest callbacks without rebuilding the runner (which would drop a run in flight).
  const sceneRef = useRef(getScene)
  const stageRef = useRef(onStage)
  useEffect(() => {
    sceneRef.current = getScene
    stageRef.current = onStage
  })

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const runner = createTransitionRunner({
      canvas: el,
      geometry,
      startMode,
      getScene: () => sceneRef.current(),
      onStage: (e) => stageRef.current?.(e),
    })
    runnerRef.current = runner
    return () => {
      runner.dispose()
      if (runnerRef.current === runner) runnerRef.current = null
    }
  }, [geometry, startMode, runnerRef])

  return <canvas ref={canvas} className={className} style={style} aria-hidden="true" />
}
