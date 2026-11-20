// The public (Pages) build gate for which AGOL view it reads. Pure and import-free so vite.config.ts can use it
// and the unit tests can reach it. ADR 0030: live data has its own view, so a public build accepts that view only;
// trial and replay data live on the dev service and its view and can never be shown as real (hard rule 2).

export const LIVE_VIEW_NAME = 'vic26election_live_view'

/** The service name is the path segment just before /FeatureServer. */
function serviceName(url: URL): string | null {
  const m = /\/services\/([^/]+)\/FeatureServer\/?$/.exec(url.pathname)
  return m?.[1] ?? null
}

/** Problems with a public build's settings; empty means fine. The live view's URL is not known until it exists, so the check is by name. */
export function checkProductionView(env: Record<string, string | undefined>): string[] {
  const problems: string[] = []
  const raw = (env.VITE_AGOL_VIEW_URL ?? '').trim()
  if (!raw) {
    problems.push(`VITE_AGOL_VIEW_URL must be set to the live view (${LIVE_VIEW_NAME}); a public build has no default`)
  } else {
    let parsed: URL | null = null
    try {
      parsed = new URL(raw)
    } catch {
      // Falls through to the "not a URL" problem.
    }
    const name = parsed ? serviceName(parsed) : null
    if (!parsed || parsed.protocol !== 'https:') problems.push('VITE_AGOL_VIEW_URL is not an https URL')
    else if (name === 'vic26election_view') problems.push('VITE_AGOL_VIEW_URL names the dev view (vic26election_view); a public build reads the live view only')
    else if (name !== LIVE_VIEW_NAME) {
      problems.push(
        /vic26election_dev/i.test(parsed.pathname)
          ? 'VITE_AGOL_VIEW_URL names the dev service (vic26election_dev)'
          : `VITE_AGOL_VIEW_URL is not the live view (${LIVE_VIEW_NAME})`,
      )
    }
  }
  problems.push(...checkLatestUrl(env))
  const source = (env.VITE_RESULTS_SOURCE ?? '').trim()
  if (source && source !== 'agol') problems.push(`VITE_RESULTS_SOURCE is "${source}", a public build reads agol only`)
  return problems
}

/**
 * VITE_LATEST_URL, when set, is fetched by every visitor and its origin goes into the CSP, so it must be https on the
 * project's blob storage (or the CDN host PUBLIC_BASE_URL names, if one is configured). Empty is fine: no pointer.
 */
function checkLatestUrl(env: Record<string, string | undefined>): string[] {
  const raw = (env.VITE_LATEST_URL ?? '').trim()
  if (!raw) return []
  let host: string
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return ['VITE_LATEST_URL is not an https URL']
    host = u.hostname.toLowerCase()
  } catch {
    return ['VITE_LATEST_URL is not a URL']
  }
  let cdnHost: string | null = null
  try {
    const cdn = (env.PUBLIC_BASE_URL ?? '').trim()
    cdnHost = cdn ? new URL(cdn).hostname.toLowerCase() : null
  } catch {
    // An unparseable CDN setting allows nothing extra.
  }
  // The leading dot matters: "evilblob.core.windows.net" must not pass.
  if (host.endsWith('.blob.core.windows.net') || host === cdnHost) return []
  return [`VITE_LATEST_URL host (${host}) is not Azure blob storage (.blob.core.windows.net) or the configured CDN host`]
}

/**
 * Whether this is the public build, which shows live data only. Not the dev server, and not the rehearsal rig (a
 * production build pointed at a stand-in view on this machine, which serves marked replay data). A real public build
 * always points at services*.arcgis.com (checkProductionView), so an unparsable URL counts as public: fail safe.
 */
export function isPublicBuild(dev: boolean, viewUrl: string | undefined): boolean {
  if (dev) return false
  try {
    const host = new URL((viewUrl ?? '').trim()).hostname.toLowerCase()
    return !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)
  } catch {
    return true
  }
}
