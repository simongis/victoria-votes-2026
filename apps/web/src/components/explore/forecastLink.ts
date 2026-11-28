/**
 * VE-200, VE-201, VE-209: links out to a separate forecast site. A link only: no live data from that site enters this app (the one static exception is the place ranks the Similar lens ships, used with the author's say-so, FB-238). The address
 * comes from the build (VITE_FORECAST_URL); empty means no links anywhere. FORECAST_BASE is the one switch, and the only
 * places that read it are:
 *   - components/explore/ExploreLayer.tsx (the Polling model card, and its count in the View menu)
 *   - components/DistrictPanel.tsx (the last line of the seat panel)
 *   - components/explore/similar/SimilarLens.tsx (the "<seat> on the polling model (another site)" line; the lens and its
 *     credit stay when the link is off)
 * VE-312: the credits in About and the Similar key link to CREDIT_URL whatever this switch says.
 * To remove the feature for good, see docs/ops.md, Polling model link.
 */

/** The seat name as people read it: without the word District. */
export function seatLabel(name: string): string {
  return name.trim().replace(/\s+District$/i, '')
}

/** The district name as the forecast site writes its district id: lowercase words joined by hyphens (albert-park). */
export function seatSlug(name: string): string {
  return name
    .trim()
    .replace(/\s+District$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The forecast address from the build, or null when there is none. Only https is accepted, so a mistyped or hostile
 * variable cannot put a javascript: or plain-http link on the page. A trailing slash is added so the hash joins cleanly.
 */
export function forecastBase(raw: string | undefined): string | null {
  const v = raw?.trim()
  if (!v) return null
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  const s = u.toString()
  return s.endsWith('/') ? s : `${s}/`
}

/**
 * The link target: the plain address, or the selected seat on the other site's modelling tab. VE-236: the statewide tab
 * ignores #seat=, so the seat must be opened on ?tab=modelling.
 */
export function forecastHref(base: string, seatName?: string | null): string {
  return seatName ? `${base}?tab=modelling#seat=${seatSlug(seatName)}` : base
}

/** VE-209: the source site's similarity map for one seat (its modelling tab, seat picked). */
export function forecastSimilarHref(base: string, seatName: string): string {
  return forecastHref(base, seatName)
}

/**
 * VE-312 (Simon): the credit for the seat forecasts and the place-similarity ranks names the site, not a person, and the
 * site's name always links here (About and the Similar key). It is a credit, so it does not follow the FORECAST_BASE switch.
 */
export const CREDIT_NAME = 'SpatialSearch'
export const CREDIT_URL = 'https://spatialsearch.io/elections/'

/** The base address set at build time, or null. Read once; Vite inlines it. */
export const FORECAST_BASE: string | null = forecastBase(import.meta.env.VITE_FORECAST_URL)
