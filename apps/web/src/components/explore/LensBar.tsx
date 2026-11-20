import type { KeyboardEvent, ReactNode } from 'react'

export interface BarMode<T extends string> {
  mode: T
  label: string
}

/**
 * The frame every lens shares (VE-123, FB-132, FB-137): the shape toggle top left where the main view's own sits, the
 * lens's title top right (bigger than before), the "i" at the far right, then any other controls in a second row.
 * One component, so a new lens cannot drift from the others.
 */
export function LensBar<T extends string>({ title, modes, mode, onMode, info, children }: {
  title: string
  /** Map / Hex (and Ranked for swing). Omit when the lens's current view has no shape to choose. */
  modes?: readonly BarMode<T>[]
  mode?: T
  onMode?: (m: T) => void
  info?: ReactNode
  /** Everything else: a second row under the toggle, kept to a line or two at rest. */
  children?: ReactNode
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!modes || !onMode) return
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const at = modes.findIndex((m) => m.mode === mode)
    const next = modes[(at + step + modes.length) % modes.length]!
    onMode(next.mode)
    const host = e.currentTarget
    requestAnimationFrame(() => host.querySelector<HTMLButtonElement>(`[data-mode="${next.mode}"]`)?.focus())
  }
  return (
    <div className="lens-bar">
      <div className="lens-bar__row">
        {modes && (
          <div className="segmented lens-bar__shape" role="radiogroup" aria-label="How to draw it" onKeyDown={onKey}>
            {modes.map((m) => (
              <button key={m.mode} type="button" role="radio" data-mode={m.mode} aria-checked={mode === m.mode} tabIndex={mode === m.mode ? 0 : -1} onClick={() => onMode?.(m.mode)}>
                {m.label}
              </button>
            ))}
          </div>
        )}
        <h2 className="explore-lens__title">{title}</h2>
        {info && <span className="lens-bar__info">{info}</span>}
      </div>
      {children && <div className="arrows__bar lens-bar__sub">{children}</div>}
    </div>
  )
}
