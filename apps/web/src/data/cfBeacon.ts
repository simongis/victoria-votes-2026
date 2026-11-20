// Cloudflare Web Analytics beacon (VE-187). Pure and import-free so vite.config.ts and the unit tests can both reach it.
// The site token is public (it ships in the page), but it still goes into HTML, so it is checked before use.

// Hosts per Cloudflare's CSP reference (developers.cloudflare.com/fundamentals/reference/policies-compliances/content-security-policies/)
// and the Web Analytics FAQ (developers.cloudflare.com/web-analytics/faq/): the script loads from static.cloudflareinsights.com and,
// for a site not proxied through Cloudflare (ours is on GitHub Pages), reports to cloudflareinsights.com/cdn-cgi/rum.
// The script is allowed by its exact URL, not the whole host.
export const BEACON_SCRIPT_URL = 'https://static.cloudflareinsights.com/beacon.min.js'
export const BEACON_CONNECT_HOST = 'https://cloudflareinsights.com'

// 32 lowercase hex is the token shape in the backlog (VE-187). The docs do not state the format, so this is UNVERIFIED;
// if a real token ever fails, loosen this on sight of it, but keep it to characters that cannot break out of an attribute.
const TOKEN_RE = /^[0-9a-f]{32}$/

export interface BeaconCheck {
  /** The trimmed token, or null when no beacon should load (absent, or invalid). */
  token: string | null
  problems: string[]
}

export function checkBeaconToken(raw: string | undefined): BeaconCheck {
  const value = (raw ?? '').trim()
  if (!value) return { token: null, problems: [] }
  // The bad value is deliberately not echoed: it goes to CI logs, and a mistyped secret could be one.
  if (!TOKEN_RE.test(value)) return { token: null, problems: ['VITE_CF_BEACON_TOKEN must be 32 lowercase hex characters (or left empty for no analytics)'] }
  return { token: value, problems: [] }
}

export function beaconTag(token: string): string {
  return `<script defer src="${BEACON_SCRIPT_URL}" data-cf-beacon='{"token": "${token}"}'></script>`
}

/** Adds the beacon before </body>; a null token returns the page unchanged. */
export function injectBeacon(html: string, token: string | null): string {
  if (!token) return html
  return html.replace('</body>', `    ${beaconTag(token)}\n  </body>`)
}
