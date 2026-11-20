/**
 * The portrait phone test. The Melbourne close-up that gave this file its name went in VE-217 (ADR 0032: phones get one
 * Victoria map the reader zooms); the hook stays because the Hex's closest seats block (ClosestSeats.tsx) uses it to know
 * it is on a phone held upright.
 */
import { useEffect, useState } from 'react'

export const CLOSE_UP_QUERY = '(orientation: portrait) and (max-width: 1023px)'
export function useCloseUpFits(): boolean {
  const get = () => typeof matchMedia === 'function' && matchMedia(CLOSE_UP_QUERY).matches
  const [fits, setFits] = useState(get)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(CLOSE_UP_QUERY)
    const on = () => setFits(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return fits
}
