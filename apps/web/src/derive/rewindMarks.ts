/** One candidate hour label on the Rewind axis: its centre `x` and its `w`idth in px, and the text. */
export interface Mark {
  x: number
  w: number
  label: string
}

export interface Axis {
  /** Track width in px. */
  width: number
  /** Room the left end label ("6:03 pm") takes from the left edge, and the right one ("Now", "Final") from the right edge. */
  leftEnd: number
  rightEnd: number
  /** Least clear space between any two labels, end labels included. */
  gap: number
}

const fits = (m: Mark, a: Axis): boolean => m.x - m.w / 2 >= a.leftEnd + a.gap && m.x + m.w / 2 <= a.width - a.rightEnd - a.gap

/** True when `idx` (in order) have at least `gap` px between neighbours. */
const spaced = (marks: readonly Mark[], idx: readonly number[], gap: number): boolean => {
  for (let i = 1; i < idx.length; i++) {
    const p = marks[idx[i - 1]!]!
    const q = marks[idx[i]!]!
    if (q.x - q.w / 2 - (p.x + p.w / 2) < gap) return false
  }
  return true
}

/**
 * Which hour labels to show on a phone's Rewind axis (VE-185). Every hour if they all fit with `gap` px between labels,
 * else every second, then every third and so on, so the night still reads as evenly spaced hours. The first and last
 * marks of the axis are the end labels (start time, "Now" or "Final"), which are always there; an hour that would sit
 * under one is left out before the hours are counted off. Returns indices into `marks`, in order.
 */
export function pickMarks(marks: readonly Mark[], axis: Axis): number[] {
  const usable: number[] = []
  marks.forEach((m, i) => {
    if (fits(m, axis)) usable.push(i)
  })
  for (let stride = 1; stride <= usable.length; stride++) {
    // The first stride with a clean run wins; among its offsets, the one showing most hours.
    let win: number[] | null = null
    for (let o = 0; o < stride; o++) {
      const idx: number[] = []
      for (let k = o; k < usable.length; k += stride) idx.push(usable[k]!)
      if (spaced(marks, idx, axis.gap) && (!win || idx.length > win.length)) win = idx
    }
    if (win) return win
  }
  return []
}
