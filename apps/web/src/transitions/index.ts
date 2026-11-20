/**
 * Map to Seats to Tally transitions (VE-47). Self-contained: nothing here imports a view or the shell.
 *
 *   1. Once per geometry load:  const geometry = buildMorphShapes(statics.districts, statics.seatHexes)
 *   2. Render <TransitionOverlay geometry getScene onStage runnerRef /> over the panes.
 *   3. On a view change:        runnerRef.current?.run('seats')   (or 'map', 'tally')
 */
export { buildMorphShapes, merc, type MorphShape } from './morph'
export { TransitionOverlay, type TransitionOverlayProps } from './TransitionOverlay'
export { createTransitionRunner, type RunnerOptions, type StageEvent, type TransitionRunner } from './runner'
export { assignFor } from './draw'
export type { SceneBoard, SceneSeat, ScreenFn, TransitionScene } from './draw'
export { MODES, type Mode, type MotionMode } from './timeline'
export type { TallyKind } from './tally'
export { drawHalos, HALO_MS, haloAt, type Halo, type HaloSpec } from './halo'
export { layoutFor, type TallyLayout } from './tally'
