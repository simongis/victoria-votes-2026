import { useEffect, useState } from 'react'

/** The wall clock, re-read every `everyMs` so "paused" can appear without a new snapshot arriving (the 45 minute rule). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(t)
  }, [everyMs])
  return now
}
