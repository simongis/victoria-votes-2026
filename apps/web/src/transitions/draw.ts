import type { PartyBucket } from '@vic26/schema'
import type { Position } from '../data/types'
import { chipRingFor, islandAlpha, type MorphShape } from './morph'
import { assignSlots, blockSub, layoutFor, slotAt, type Slot, type TallyAssignment, type TallyKind, type TallyLayout } from './tally'
import { clamp01, flyProgress, morphStage, tallyStage } from './timeline'

/**
 * Canvas drawing for the transition overlay. Everything is a pure function of (prepared shapes, scene, pos), so
 * it can be driven by the timeline, a scrubber or a test. Colours always arrive in the scene (from the theme
 * palette via views/encoding.ts); there are no colour literals here.
 */

export type ScreenFn = (p: Position) => Position

export interface SceneSeat {
  id: number
  party: PartyBucket | null
  /** CSS colour for the seat, as the real views draw it. */
  fill: string
  /** Firm or won (not just leading): orders seats inside a party block in the tally. */
  firm?: boolean
  /** The Board's colour for the seat (margin depth); the chip fades to it as it lands. */
  boardFill?: string
}

/** Where each seat's tile sits in the Board, in canvas pixels, in the order the tiles fly in. */
export interface SceneBoard {
  tiles: { id: number; cx: number; cy: number; w: number; h: number }[]
}

export interface TransitionScene {
  width: number
  height: number
  /** Planar (Web Mercator metres, as in MorphShape) to canvas pixels, for each real view. */
  project: { map: ScreenFn; seats: ScreenFn }
  seats: SceneSeat[]
  tally: TallyKind
  /** When set, the third stop is the Board (VE-61) and the chips land on these tiles instead of the tally bar. */
  board?: SceneBoard
  /** Seat outline, track behind the bar, and the majority marker: theme colours. */
  stroke: string
  track: string
  marker: string
  /** The selected district, drawn with an outline above the rest so selection survives the flight. */
  selected?: { id: number; stroke: string } | null
}

/** Computed once per geometry load: the morph pairs and the chip rings that pair with each hex. */
export interface PreparedGeometry {
  shapes: MorphShape[]
  chips: Position[][]
}

export function prepareGeometry(shapes: MorphShape[]): PreparedGeometry {
  return { shapes, chips: shapes.map((s) => chipRingFor(s.hex, s.hexCentre, s.hex.length)) }
}

interface ScreenShape {
  id: number
  geo: Position[]
  hex: Position[]
  islands: { ring: Position[]; target: Position }[]
  hexCentre: Position
  chip: Position[]
}

/** Shapes in canvas pixels, taken at the start of a run so the views' pan and zoom are read once, not per frame. */
export interface ScreenSnapshot {
  scene: TransitionScene
  shapes: ScreenShape[]
  layout: TallyLayout
  assignment: TallyAssignment
  fillById: Map<number, string>
}

/**
 * Which tally slot each seat takes. Shared with the Tally pane so its cells sit exactly where the chips land
 * (x is only an ordering key, so any positive scale of the hex centre gives the same answer).
 */
export function assignFor(shapes: { id: number; hexCentre: Position }[], seats: SceneSeat[]): TallyAssignment {
  const byId = new Map(seats.map((s) => [s.id, s]))
  return assignSlots(
    shapes.map((s) => {
      const seat = byId.get(s.id)
      const party = seat?.party ?? null
      return { id: s.id, party, x: s.hexCentre[0], sub: blockSub(party, seat?.firm ?? false) }
    }),
  )
}

export function snapshotScreen(geom: PreparedGeometry, scene: TransitionScene): ScreenSnapshot {
  const { map, seats } = scene.project
  const shapes = geom.shapes.map(
    (s, i): ScreenShape => ({
      id: s.id,
      geo: s.geo.map(map),
      hex: s.hex.map(seats),
      islands: s.islands.map((isl) => ({ ring: isl.ring.map(map), target: seats(isl.target) })),
      hexCentre: seats(s.hexCentre),
      chip: geom.chips[i]!,
    }),
  )
  // The selected shape goes last so its outline is not painted over by a neighbour.
  const selId = scene.selected?.id
  if (selId !== undefined) shapes.sort((a, b) => Number(a.id === selId) - Number(b.id === selId))
  if (scene.board) {
    const slots = scene.board.tiles.map((t): Slot => ({ cx: t.cx, cy: t.cy, w: t.w, h: t.h }))
    const bySeat = new Map(scene.board.tiles.map((t, i) => [t.id, { slot: i, rank: i }]))
    const board: TallyLayout = { key: 'board', slots, lines: [], majX: 0, majY: 0, numL: { x: 0, y: 0 }, numR: { x: 0, y: 0 }, minorsY: 0, centreX: scene.width / 2 }
    return {
      scene,
      shapes,
      layout: board,
      assignment: { bySeat, counts: { alp: 0, coalition: 0, minor: new Map(), undecided: 0 } },
      fillById: new Map(scene.seats.map((s) => [s.id, s.fill])),
    }
  }
  const assignment = assignFor(shapes, scene.seats)
  return {
    scene,
    shapes,
    layout: layoutFor(scene.tally, scene.width, scene.height, Math.max(1, shapes.length)),
    assignment,
    fillById: new Map(scene.seats.map((s) => [s.id, s.fill])),
  }
}

function trace(c: CanvasRenderingContext2D, pts: ArrayLike<Position>, lerpTo?: ArrayLike<Position>, e = 0): void {
  c.beginPath()
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k]!
    const b = lerpTo ? lerpTo[k]! : a
    const x = a[0] + (b[0] - a[0]) * e
    const y = a[1] + (b[1] - a[1]) * e
    if (k === 0) c.moveTo(x, y)
    else c.lineTo(x, y)
  }
  c.closePath()
}

function paint(c: CanvasRenderingContext2D, snap: ScreenSnapshot, id: number, alpha: number): void {
  c.globalAlpha = alpha
  c.fillStyle = snap.fillById.get(id) ?? snap.scene.track
  c.fill()
  c.strokeStyle = snap.scene.stroke
  c.lineWidth = 0.8
  c.stroke()
  c.globalAlpha = 1
}

/** Outline the selected shape; called after its path is built, so it sits above the neighbours drawn before it. */
function outline(c: CanvasRenderingContext2D, snap: ScreenSnapshot, id: number): void {
  const sel = snap.scene.selected
  if (!sel || sel.id !== id) return
  c.strokeStyle = sel.stroke
  c.lineWidth = 3
  c.stroke()
}

/** Map to Seats at morph progress e (0..1): bodies lerp, islands collapse into the hex edge and fade by 60%. */
export function drawMorph(c: CanvasRenderingContext2D, snap: ScreenSnapshot, e: number): void {
  for (const s of snap.shapes) {
    trace(c, s.geo, s.hex, e)
    paint(c, snap, s.id, 1)
    outline(c, snap, s.id)
    const a = islandAlpha(e)
    if (a > 0.01) {
      for (const isl of s.islands) {
        trace(
          c,
          isl.ring,
          isl.ring.map((): Position => isl.target),
          e,
        )
        paint(c, snap, s.id, a)
      }
    }
  }
}

export interface TallyDraw {
  /** 0..1: how far the chips have stretched into their slots; also drives the numerals and majority marker. */
  settle: number
}

/** Seats to Tally at segment progress p (0..1). Returns settle so the shell can count the numerals up. */
export function drawTally(c: CanvasRenderingContext2D, snap: ScreenSnapshot, p: number): TallyDraw {
  const { shrink, settle, ms } = tallyStage(p)
  const { layout, assignment, scene } = snap
  if (!scene.board && scene.tally === 'bar' && layout.slots.length > 0) {
    // Track behind the chips, so the bar reads as a bar before the seats land.
    const first = layout.slots[0]!
    const last = layout.slots[layout.slots.length - 1]!
    const left = first.cx - first.w / 2
    c.globalAlpha = 0.9 * shrink
    c.fillStyle = scene.track
    c.fillRect(left, first.cy - first.h / 2, last.cx + last.w / 2 - left, first.h)
    c.globalAlpha = 1
  }
  for (const s of snap.shapes) {
    const a = assignment.bySeat.get(s.id)
    if (!a) continue
    const slot = slotAt(layout.slots, a.slot)
    const f = Math.max(5, Math.min(14, slot.w))
    const fly = flyProgress(ms, a.rank)
    const [cx0, cy0] = s.hexCentre
    const cx = cx0 + (slot.cx - cx0) * fly
    const cy = cy0 + (slot.cy - cy0) * fly
    const bw = f + (slot.w - f) * settle
    const bh = f + (slot.h - f) * settle
    c.beginPath()
    for (let k = 0; k < s.hex.length; k++) {
      const hp = s.hex[k]!
      const cp = s.chip[k]!
      // Hex to chip while shrinking; then the unit chip scales to the slot rectangle.
      const x = shrink < 1 ? hp[0] - cx0 + (cp[0] * f - (hp[0] - cx0)) * shrink : cp[0] * bw
      const y = shrink < 1 ? hp[1] - cy0 + (cp[1] * f - (hp[1] - cy0)) * shrink : cp[1] * bh
      if (k === 0) c.moveTo(cx + x, cy + y)
      else c.lineTo(cx + x, cy + y)
    }
    c.closePath()
    paint(c, snap, s.id, 1)
    // The chip takes the Board's depth colour as it settles into its tile.
    const bf = scene.board ? scene.seats.find((q) => q.id === s.id)?.boardFill : undefined
    if (bf && settle > 0) {
      c.globalAlpha = settle
      c.fillStyle = bf
      c.fill()
      c.globalAlpha = 1
    }
    outline(c, snap, s.id)
  }
  if (settle > 0) {
    c.globalAlpha = settle
    c.strokeStyle = scene.marker
    c.lineWidth = 2
    for (const l of layout.lines) {
      c.beginPath()
      c.moveTo(l[0], l[1])
      c.lineTo(l[2], l[3])
      c.stroke()
    }
    c.globalAlpha = 1
  }
  return { settle }
}

export interface FrameInfo {
  pos: number
  /** Opacity for the Map view's labels and the Seats view's labels. */
  mapLabels: number
  seatLabels: number
  /** Count-up numerals (only past the Seats view). */
  counts: { alp: number; coalition: number; settle: number } | null
}

/** One frame at scalar pos (0 = Map, 1 = Seats, 2 = Tally). Clears the canvas first. */
export function drawFrame(c: CanvasRenderingContext2D, snap: ScreenSnapshot, pos: number): FrameInfo {
  c.clearRect(0, 0, snap.scene.width, snap.scene.height)
  const p = clamp01(pos)
  const st = morphStage(p)
  if (pos <= 1) {
    drawMorph(c, snap, st.e)
    return { pos, mapLabels: st.mapLabels, seatLabels: st.seatLabels, counts: null }
  }
  const { settle } = drawTally(c, snap, pos - 1)
  const k = snap.assignment.counts
  return {
    pos,
    mapLabels: 0,
    // Seat labels belong to the hex view, which is gone once the chips shrink.
    seatLabels: 0,
    counts: snap.scene.board ? null : { alp: Math.round(k.alp * settle), coalition: Math.round(k.coalition * settle), settle },
  }
}
