// VE-209, from the VE-205 prototype (round 2, FB-239), redrawn in daylight for VE-209c (FB-246). Every effect explains something:
//   - threads draw outwards from the picked seat, rank 1 first, so the eye follows the reach in rank order;
//   - each destination lifts off the page as its thread arrives (its shadow or halo blooms), and its rank badge pops
//     in, so the rank lands with the place;
//   - changing seat fades the old set out quickly (about 200 ms) before the new one draws, never a hard cut;
//   - at rest the lift breathes very slowly. Chosen over a light travelling along each thread because a moving spot
//     pulls the eye every few seconds and competes with reading the list; a slow change stays peripheral.
// On the app's light paper a glow does not read, so the five are lifted the way paper is: a crisp ink edge over a soft
// shadow or halo, while the threads are deep ink with a white casing so they cross seats cleanly.
// Layers, bottom to top:
//   glow overlay: the picked seat's and the five's shadows (blurred), then the threads' soft halos;
//   top overlay: the picked seat, the five lifted seats, the threads (casing, then core), the rank badges, the source.
// Lifts, threads and badges are separate groups, each keyed by data-id, so a thread is never hidden under a later seat.
// Performance: the shadows live in their own overlay <svg>, so the breathing is an opacity animation of one element that
// the browser composites without repainting the blur. The threads overlay is static at rest.
// No animation library: CSS keyframes and SVG attributes only. Timings sit here and are set on the elements (CSSOM, not style attributes); reduced motion (the device setting or the app's Animations switch) drops every move and keeps a short fade.
// The lens renders the two overlay <svg> elements itself and this file only fills them, so React never owns the nodes added here.

export interface ThreadView {
  vb: [number, number, number, number]
  /** Rank label radius, in viewBox units. */
  unit: number
  centre: (id: number) => [number, number]
  shape: (id: number, cls: string, extra?: Record<string, string | number>) => SVGElement
}

const NS = 'http://www.w3.org/2000/svg'
function s(tag: string, attrs: Record<string, string | number | undefined> = {}, ...kids: (Node | string)[]): SVGElement {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v))
  for (const kid of kids) el.append(kid)
  return el
}

/**
 * Sets the stagger and the line width through the CSSOM, never a style="" attribute: the production CSP has no
 * style-src-attr (vite.config.ts), so an inline style attribute is blocked and the delays are lost (VE-211, VE-212).
 */
function timed<E extends SVGElement>(el: E, delayMs: number, w?: string): E {
  el.style.animationDelay = `${delayMs}ms`
  if (w !== undefined) el.style.setProperty('--w', w)
  return el
}

/** Milliseconds. Total draw for five threads: 4 x STAGGER + DRAW, about 800 ms, inside the brief's 600 to 900. */
export const T = { OUT: 200, STAGGER: 95, DRAW: 420, BLOOM: 420, BADGE: 260 } as const
/** When rank i (0-based) starts drawing and when its thread arrives, after the lead-in. */
export const startAt = (i: number, lead: number): number => lead + i * T.STAGGER
export const arriveAt = (i: number, lead: number): number => startAt(i, lead) + T.DRAW * 0.85

/** Thread widths in screen pixels: the ink core tapers from source to seat; the white casing adds CASE on each side. */
const W = { CORE0: 2.4, CORE1: 0.9, CASE: 1.3 } as const

interface Curve {
  a: [number, number]
  c: [number, number]
  b: [number, number]
}
/** Arc over the map: bend towards the top of the page by about a quarter of the span, like a thread lifted off it. */
function curve(a: [number, number], b: [number, number]): Curve {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  let nx = dy / len
  let ny = -dx / len
  if (ny > 0) {
    nx = -nx
    ny = -ny
  }
  return { a, b, c: [(a[0] + b[0]) / 2 + nx * len * 0.26, (a[1] + b[1]) / 2 + ny * len * 0.26] }
}
const centreLine = (q: Curve): string => `M${q.a[0]} ${q.a[1]}Q${q.c[0]} ${q.c[1]} ${q.b[0]} ${q.b[1]}`

/** A ribbon round the curve that tapers from w0 at the source to w1 at the destination (viewBox units). Cheap: 24 steps. */
function ribbon(q: Curve, w0: number, w1: number): string {
  const n = 24
  const L: string[] = []
  const R: string[] = []
  for (let k = 0; k <= n; k++) {
    const t = k / n
    const u = 1 - t
    const x = u * u * q.a[0] + 2 * u * t * q.c[0] + t * t * q.b[0]
    const y = u * u * q.a[1] + 2 * u * t * q.c[1] + t * t * q.b[1]
    const tx = 2 * u * (q.c[0] - q.a[0]) + 2 * t * (q.b[0] - q.c[0])
    const ty = 2 * u * (q.c[1] - q.a[1]) + 2 * t * (q.b[1] - q.c[1])
    const tl = Math.hypot(tx, ty) || 1
    const hw = (w0 * u + w1 * t) / 2
    L.push(`${+(x - (ty / tl) * hw).toPrecision(7)} ${+(y + (tx / tl) * hw).toPrecision(7)}`)
    R.push(`${+(x + (ty / tl) * hw).toPrecision(7)} ${+(y - (tx / tl) * hw).toPrecision(7)}`)
  }
  return `M${L.join('L')}L${R.reverse().join('L')}Z`
}

/** The two overlays the threads draw into, stacked over the seat map. They never take pointer events. */
export interface Overlays {
  glow: SVGSVGElement
  top: SVGSVGElement
  /** Screen pixels to viewBox units, kept current by the lens's ResizeObserver so strokes stay the same on a phone. */
  px: number
  /** Re-lays the tapered ribbons after a resize (their width is geometry, not a stroke). */
  relayout: () => void
}

let uid = 0
/** Prepares the two empty overlay svgs the lens rendered (their viewBox is already set): the blur filters go in the glow one. */
export function makeOverlays(v: ThreadView, glow: SVGSVGElement, top: SVGSVGElement): Overlays {
  const id = `sim${++uid}`
  // One blur for the seat shadows and one finer one for the thread halos. userSpaceOnUse so a long thin halo is not clipped.
  const [x, y, w, h] = v.vb
  glow.replaceChildren(
    s(
      'defs',
      {},
      s('filter', { id: `${id}-bloom`, filterUnits: 'userSpaceOnUse', x: x - w * 0.1, y: y - h * 0.1, width: w * 1.2, height: h * 1.2 }, s('feGaussianBlur', { stdDeviation: w / 220 })),
      s('filter', { id: `${id}-halo`, filterUnits: 'userSpaceOnUse', x: x - w * 0.1, y: y - h * 0.1, width: w * 1.2, height: h * 1.2 }, s('feGaussianBlur', { stdDeviation: w / 700 })),
    ),
  )
  top.replaceChildren()
  glow.dataset['fid'] = id
  return { glow, top, px: w / 900, relayout: () => undefined }
}

/**
 * Draws one "generation": the threads, lifts and badges for one picked seat. Any earlier generation fades out first.
 * Returns the lead-in in ms (the old set's fade), which the list rows add to their own stagger.
 */
export function drawGen(v: ThreadView, ov: Overlays, picked: number, nearest: number[], animate: boolean): number {
  const old = [...ov.glow.querySelectorAll<SVGGElement>(':scope > g.gen'), ...ov.top.querySelectorAll<SVGGElement>(':scope > g.gen')]
  const hadOld = old.length > 0
  for (const g of old) {
    if (g.classList.contains('gen--out')) continue
    g.classList.add('gen--out')
    window.setTimeout(() => g.remove(), T.OUT + 40)
  }
  const lead = animate && hadOld ? T.OUT * 0.9 : 0
  const cls = animate ? 'gen gen--in' : 'gen gen--still'
  const fid = ov.glow.dataset['fid']!
  const px = ov.px
  const gGlow = s('g', { class: cls }) as SVGGElement
  const gTop = s('g', { class: cls }) as SVGGElement
  // Masks live inside the generation (and leave with it); ids are unique per generation so an old, fully drawn mask
  // never stands in for a new one while the old set fades.
  const defs = s('defs')
  const gid = `${fid}g${++uid}`
  const [vx, vy, vw, vh] = v.vb
  const a = v.centre(picked)

  // The picked seat: cross-fades with the old one (no stagger), lifted like the five, outlined in the app's selection ink.
  gGlow.append(s('g', { class: 'bloom-wrap bloom-wrap--pick', filter: `url(#${fid}-bloom)` }, timed(v.shape(picked, 'c-glowpick'), lead * 0.5)))
  const shadows = s('g', { class: 'shadows' })
  const halos = s('g', { class: 'halos', filter: `url(#${fid}-halo)` })
  const lifts = s('g', { class: 'lifts' })
  const threads = s('g', { class: 'threads' })
  const badges = s('g', { class: 'badges' })
  const relays: (() => void)[] = []
  // Badges keep at least an 18 px circle, so the rank stays readable on a phone where the Map's seats are specks.
  const badgeR = (k: number): number => Math.max(v.unit * 0.62, 9 * k)
  const coreD = (q: Curve, weight: number, k: number): string => ribbon(q, W.CORE0 * weight * k, W.CORE1 * k)
  const caseD = (q: Curve, weight: number, k: number): string => ribbon(q, (W.CORE0 * weight + 2 * W.CASE) * k, (W.CORE1 + 2 * W.CASE) * k)
  nearest.forEach((id, i) => {
    const q = curve(a, v.centre(id))
    const t0 = startAt(i, lead)
    const t1 = arriveAt(i, lead)
    const weight = 1 - i * 0.1
    // Shadow (or halo, by look): the seat's lift off the page, blooming as its thread arrives.
    shadows.append(s('g', { class: 'item', 'data-id': id }, s('g', { filter: `url(#${fid}-bloom)` }, timed(v.shape(id, 'c-glow'), t1 - 60))))
    // Halo: a soft stroke drawn with the thread (pathLength 1 makes the dash maths unit-free).
    halos.append(s('g', { class: 'item', 'data-id': id }, timed(s('path', { d: centreLine(q), class: 'c-halo', pathLength: 1 }), t0, (4.5 * weight).toFixed(2))))
    lifts.append(s('g', { class: 'lift', 'data-id': id }, timed(v.shape(id, 'c-lift', { 'data-lift': id }), t1)))
    // Core over a white casing: two tapered ribbons, revealed from the source by a mask whose stroke draws along the curve.
    const mid = `${gid}m${i}`
    const reveal = timed(s('path', { d: centreLine(q), class: 'c-reveal', pathLength: 1 }), t0)
    defs.append(s('mask', { id: mid, maskUnits: 'userSpaceOnUse', x: vx - vw * 0.1, y: vy - vh * 0.1, width: vw * 1.2, height: vh * 1.2 }, reveal))
    const casing = s('path', { class: 'c-case', d: caseD(q, weight, px) })
    const core = s('path', { class: 'c-core', d: coreD(q, weight, px) })
    threads.append(s('g', { class: 'item', 'data-id': id }, s('g', { mask: `url(#${mid})` }, casing, core)))
    const bc = s('circle', { cx: q.b[0], cy: q.b[1], r: badgeR(px) })
    const bt = s('text', { x: q.b[0], y: q.b[1], 'font-size': badgeR(px) * 1.2, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, String(i + 1))
    // Badges in rank order, last in the DOM so no thread crosses a number.
    badges.append(s('g', { class: 'mark', 'data-id': id }, timed(s('g', { class: 'c-badge' }, bc, bt), t1 + 40)))
    relays.push(() => {
      casing.setAttribute('d', caseD(q, weight, ov.px))
      core.setAttribute('d', coreD(q, weight, ov.px))
      reveal.style.setProperty('--rw', String(24 * ov.px))
      bc.setAttribute('r', String(badgeR(ov.px)))
      bt.setAttribute('font-size', String(badgeR(ov.px) * 1.2))
    })
    reveal.style.setProperty('--rw', String(24 * px))
  })
  // Rank 1's thread drawn last, so where two threads cross the nearer match is on top.
  threads.replaceChildren(...[...threads.children].reverse())
  gGlow.append(shadows, halos)
  // The source: a dot with one soft ripple as the threads leave it.
  // Sized in screen pixels (4 to 6 px), relaid on resize like the ribbons, so it never swamps a small seat on a phone.
  const srcR = (k: number): number => Math.min(Math.max(v.unit * 0.55, 4 * k), 6 * k)
  const ripple = timed(s('circle', { cx: a[0], cy: a[1], r: srcR(px) * 2.4, class: 'c-ripple' }), lead)
  const source = timed(s('circle', { cx: a[0], cy: a[1], r: srcR(px), class: 'c-source' }), lead * 0.5)
  relays.push(() => {
    ripple.setAttribute('r', String(srcR(ov.px) * 2.4))
    source.setAttribute('r', String(srcR(ov.px)))
  })
  gTop.append(defs, timed(v.shape(picked, 'c-pick'), lead * 0.5), lifts, threads, badges, ripple, source)
  ov.glow.append(gGlow)
  ov.top.append(gTop)
  ov.relayout = () => {
    for (const f of relays) f()
  }
  return lead
}

/** Lights one thread, its seat and its badge (and dims the rest), or clears that with null. */
export function setHot(ov: Overlays, id: number | null): void {
  for (const svg of [ov.glow, ov.top]) {
    const live = svg.querySelector<SVGGElement>(':scope > g.gen:not(.gen--out)')
    svg.classList.toggle('has-hot', id !== null)
    if (!live) continue
    for (const it of live.querySelectorAll<SVGGElement>('g[data-id]')) it.classList.toggle('is-hot', Number(it.dataset['id']) === id)
  }
}

/** Fades every drawn thread out (a seat un-picked), the way a change of seat fades the old set. */
export function clearOverlays(ov: Overlays): void {
  for (const svg of [ov.glow, ov.top]) {
    for (const g of svg.querySelectorAll<SVGGElement>(':scope > g.gen')) {
      if (g.classList.contains('gen--out')) continue
      g.classList.add('gen--out')
      window.setTimeout(() => g.remove(), T.OUT + 40)
    }
  }
  setHot(ov, null)
}

/**
 * VE-212: colours the picked seat and the five with each seat's leader colour (rgb css string), or back to Sand (the CSS
 * default) for a seat with none. Set on the element's style (CSSOM), so the fill eases in with the app's update effect.
 */
export function paintLeaders(ov: Overlays, picked: number | null, colourOf: (id: number) => string | null, gainOf: (id: number) => boolean = () => false): void {
  const live = ov.top.querySelector<SVGGElement>(':scope > g.gen:not(.gen--out)')
  if (!live) return
  const set = (el: SVGElement, c: string | null) => (c ? el.style.setProperty('fill', c) : el.style.removeProperty('fill'))
  // VE-213: a match changing hands wears the Gains ring (an ink edge, app.css .map-gain). classList is the CSSOM, so the CSP is untouched.
  for (const el of live.querySelectorAll<SVGElement>('.c-lift[data-lift]')) {
    const id = Number(el.getAttribute('data-lift'))
    set(el, colourOf(id))
    el.classList.toggle('is-gain', gainOf(id))
  }
  const pick = live.querySelector<SVGElement>('.c-pick')
  if (pick && picked !== null) set(pick, colourOf(picked))
}
