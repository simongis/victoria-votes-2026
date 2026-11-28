import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { KEEP_LIVE_ATTR } from './explore/inertBehind'

/** The "i" that keeps explanation off the screen at rest (FB-01, FB-19). Escape or a click outside closes it. */
export function InfoButton({ label, children, align = 'right', up = false, className, face, keepLive }: { label: string; children: ReactNode; align?: 'left' | 'right'; /** Open upwards, for an "i" at the bottom of the stage. */ up?: boolean; className?: string; /** VE-303: what the button shows instead of the bare "i" (the header About, the stage How to read). */ face?: ReactNode; /** VE-307: stays usable while a lens makes the page behind it inert (the header's About). */ keepLive?: boolean }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className={`info${className ? ` ${className}` : ''}`} ref={wrap} {...(keepLive ? { [KEEP_LIVE_ATTR]: '' } : {})}>
      <button
        ref={btn}
        type="button"
        className="info__btn"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {face ?? 'i'}
      </button>
      {open && (
        <div className={`info__pop info__pop--${align}${up ? ' info__pop--up' : ''}`} id={id} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </span>
  )
}
