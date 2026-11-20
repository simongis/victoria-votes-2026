import { useMemo } from 'react'
import { swarm } from '../../../derive/oneNation'
import { PARTY_NAMES } from '../../../parties'
import { css, type Palette } from '../../../theme/theme'
import { useSize } from '../stageGeom'
import type { Lane } from './flow'
import type { SeatPick } from './useSeatPick'

interface Props {
  lanes: readonly Lane[]
  names: ReadonlyMap<number, string>
  words: (id: number) => string
  pal: Palette
  pick: SeatPick
}

const NARROW_PX = 600
const PAD = 14
const AXIS_H = 40
const LANE_HEAD = 34

/**
 * Where did the other votes go? One lane for each pairing of top two (Labor and Liberal, Labor and Greens...), one dot
 * for each seat, placed by the share of the votes for candidates outside the top two that went to the lane's first-named
 * party. The line at 50 is an even split. A dot takes the colour of the party that got more of them. It is about seats.
 */
export function FlowView({ lanes, names, words, pal, pick }: Props) {
  const [ref, size] = useSize<HTMLDivElement>()
  const narrow = size.w > 0 && size.w < NARROW_PX
  const W = Math.max(size.w, 260)
  const r = narrow ? 4 : 5
  const sx = (v: number) => PAD + (Math.min(100, Math.max(0, v)) / 100) * (W - 2 * PAD)

  // Each lane is as tall as its stack of dots needs, so a crowded lane grows instead of the dots overlapping.
  const { layout, H } = useMemo(() => {
    const stacks = lanes.map((lane) => {
      const px = lane.items.map((i) => sx(i.shareX))
      const ks = swarm(px, 2 * r + 1)
      const reach = Math.max(0, ...ks.map(Math.abs))
      return { lane, px, ks, body: Math.max(40, (2 * reach + 1) * (2 * r + 1) + 8) }
    })
    const out = stacks.map((st, i) => {
      const top = stacks.slice(0, i).reduce((n, q) => n + LANE_HEAD + q.body, 0)
      const cy = top + LANE_HEAD + st.body / 2
      return { lane: st.lane, top, bottom: top + LANE_HEAD + st.body, dots: st.lane.items.map((it, n) => ({ id: it.id, cx: st.px[n]!, cy: cy + st.ks[n]! * (2 * r + 1), x: it.shareX })) }
    })
    return { layout: out, H: (out.at(-1)?.bottom ?? 0) + AXIS_H }
    // sx closes over W; list the primitive so the layout rebuilds when the width changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, r, W])
  const nav = useMemo(() => layout.flatMap((l) => l.dots.map((d) => ({ id: d.id, x: d.cx, y: d.cy }))), [layout])
  const first = nav[0]?.id ?? null

  return (
    <div className="onl__scatter" ref={ref} style={{ overflowY: 'auto' }} data-testid="flow-scroll">
      {size.w > 0 && (
        <svg width={W} height={H + 110} viewBox={`0 0 ${W} ${H + 110}`} role="group" aria-label="For each seat, the share of the votes for candidates outside the top two that went to each of the top two, one dot for each seat, in a row for each pairing. Tab to a dot, then use the arrow keys." onKeyDown={(e) => pick.onKey(e, nav)}>
          {layout.map(({ lane, top, bottom, dots }) => {
            const bodyBottom = bottom - 2
            return (
              <g key={`${lane.x}-${lane.y}`} data-testid="flow-lane" data-lane={`${lane.x}-${lane.y}`}>
                {top > 0 && <line x1="4" x2={W - 4} y1={top} y2={top} stroke="var(--color-border)" strokeDasharray="2 3" />}
                <text className="onl__axis" x={PAD} y={top + 16} fontWeight="700">{PARTY_NAMES[lane.x]} and {PARTY_NAMES[lane.y]} in the top two</text>
                <text className="prefs__tick" x={PAD} y={top + 30} fontSize="11" fill="var(--color-text-subtle)">{`${lane.items.length} seat${lane.items.length === 1 ? '' : 's'}`}</text>
                <line x1={sx(50)} x2={sx(50)} y1={top + LANE_HEAD - 2} y2={bodyBottom} stroke="var(--color-text)" strokeWidth="1.5" />
                {[0, 25, 75, 100].map((t) => (
                  <line key={t} x1={sx(t)} x2={sx(t)} y1={top + LANE_HEAD - 2} y2={bodyBottom} stroke="var(--color-border)" />
                ))}
                {dots.map((d) => (
                  <g key={d.id} className="onl__dot" data-testid="flow-dot" data-share={d.x.toFixed(1)} {...pick.mark(d.id, words(d.id) || (names.get(d.id) ?? ''), first)}>
                    <circle cx={d.cx} cy={d.cy} r={r + 3} fill="transparent" />
                    <circle className="onl__d" cx={d.cx} cy={d.cy} r={r} fill={css(pal.party[d.x >= 50 ? lane.x : lane.y])} stroke={css(pal.paper)} />
                    {d.id === pick.active && <circle className="prefs__pick" cx={d.cx} cy={d.cy} r={r + 2.5} fill="none" stroke={css(pal.selected)} />}
                  </g>
                ))}
              </g>
            )
          })}
          <g className="prefs__tick" data-testid="flow-axis">
            {[0, 25, 50, 75, 100].map((t) => (
              <text key={t} x={sx(t)} y={H - AXIS_H + 18} textAnchor={t === 0 ? 'start' : t === 100 ? 'end' : 'middle'}>{t}%</text>
            ))}
          </g>
          <text className="onl__axis" x={W / 2} y={H - 6} textAnchor="middle">Share going to the first-named party; the rest went to the other</text>
        </svg>
      )}
    </div>
  )
}

export function FlowKey({ parties }: { parties: readonly Lane[] }) {
  const seen = [...new Set(parties.flatMap((l) => [l.x, l.y]))]
  return (
    <ul className="arrows__legend onl__key" aria-label="Key" data-testid="flow-key">
      {seen.map((p) => (
        <li key={p}>
          <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, marginRight: 4, background: `var(--party-${p.toLowerCase()})` }} aria-hidden />
          {PARTY_NAMES[p]}
        </li>
      ))}
      <li className="onl__nokey">A dot takes the colour of the party that got more of the other votes. Line: an even split.</li>
    </ul>
  )
}
