import type { IconName } from '../derive/profile'

/** One consistent line set: 24 grid, 1.6 stroke, round caps, currentColor so each theme tints it. */
const PATHS: Record<IconName, string[]> = {
  globe: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z'],
  flag: ['M6 21V4', 'M6 4h11l-2.5 4L17 12H6'],
  age: ['M12 7a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5z', 'M7 21v-6a5 5 0 0 1 10 0v6', 'M7 21h10'],
  income: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5c-1.4 0-2.5.8-2.5 2c0 3 5 1.5 5 4.5c0 1.2-1.1 2-2.5 2c-1.1 0-2.1-.5-2.6-1.5', 'M12 6.5V8M12 16v1.5'],
  key: ['M8 14a4 4 0 1 1 3.8-5H21v3h-2v2h-3v-2h-4.2A4 4 0 0 1 8 14z'],
  house: ['M3 11l9-7l9 7', 'M5.5 9.5V20h13V9.5', 'M10 20v-5h4v5'],
  crane: ['M5 21V5', 'M3 21h18', 'M5 5h14l-3 3', 'M16 8v6', 'M14 14h4v3h-4z'],
  cap: ['M2 9l10-5l10 5l-10 5z', 'M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5', 'M22 9v6'],
  scale: ['M12 4v16', 'M5 20h14', 'M5 7h14', 'M5 7l-3 7a3 3 0 0 0 6 0z', 'M19 7l-3 7a3 3 0 0 0 6 0z'],
}

export function ProfileIcon({ name }: { name: IconName }) {
  return (
    <svg className="pf-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
