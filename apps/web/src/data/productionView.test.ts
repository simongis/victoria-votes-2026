import { describe, expect, it } from 'vitest'
import { checkProductionView, isPublicBuild, LIVE_VIEW_NAME } from './productionView'

const url = (name: string) => `https://services1.arcgis.com/ORG/arcgis/rest/services/${name}/FeatureServer`

// ADR 0030: a public (BASE_PATH) build reads the live view and nothing else, so trial and replay data cannot be shown as real.
describe('checkProductionView', () => {
  it('names the live view', () => {
    expect(LIVE_VIEW_NAME).toBe('vic26election_live_view')
  })

  it('accepts the live view, with or without a trailing slash', () => {
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: url('vic26election_live_view') })).toEqual([])
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: url('vic26election_live_view') + '/' })).toEqual([])
  })

  it('accepts the live view whichever organisation hosts it (its URL is not known until it exists)', () => {
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: 'https://services-ap1.arcgis.com/OTHER/arcgis/rest/services/vic26election_live_view/FeatureServer' })).toEqual([])
  })

  it('refuses a build with no view URL: the dev view is no longer a default for a public build', () => {
    expect(checkProductionView({})).toEqual([expect.stringMatching(/VITE_AGOL_VIEW_URL must be set.*vic26election_live_view/)])
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: '  ' })).toHaveLength(1)
  })

  it('refuses the dev view and the dev service', () => {
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: url('vic26election_view') })).toEqual([expect.stringMatching(/dev view/)])
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: url('vic26election_dev') })).toEqual([expect.stringMatching(/dev/)])
  })

  it('refuses the live source service (writable) and look-alike names', () => {
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: url('vic26election_live') })).toHaveLength(1)
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: url('vic26election_live_view_copy') })).toHaveLength(1)
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: 'https://evil.example/vic26election_live_view/FeatureServer' })).toHaveLength(1)
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: 'http://services1.arcgis.com/O/arcgis/rest/services/vic26election_live_view/FeatureServer' })).toHaveLength(1)
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: 'not a url' })).toHaveLength(1)
  })

  it('refuses a name only present in the query string or a different path position', () => {
    expect(checkProductionView({ VITE_AGOL_VIEW_URL: url('vic26election_view') + '?x=vic26election_live_view' })).toHaveLength(1)
  })

  it('still requires the agol source', () => {
    const ok = { VITE_AGOL_VIEW_URL: url('vic26election_live_view') }
    expect(checkProductionView({ ...ok, VITE_RESULTS_SOURCE: 'agol' })).toEqual([])
    expect(checkProductionView({ ...ok, VITE_RESULTS_SOURCE: 'replay' })).toEqual([expect.stringMatching(/agol only/)])
  })
})

// VE-188: the optional static pointer is fetched by every visitor, so a public build only accepts the project's own storage.
describe('checkProductionView, VITE_LATEST_URL', () => {
  const base = { VITE_AGOL_VIEW_URL: url('vic26election_live_view') }
  const latest = (u: string, extra: Record<string, string> = {}) => checkProductionView({ ...base, VITE_LATEST_URL: u, ...extra })

  it('accepts unset or empty (the app then polls the status row alone)', () => {
    expect(checkProductionView(base)).toEqual([])
    expect(latest('')).toEqual([])
  })
  it('accepts an https blob storage host', () => {
    expect(latest('https://vic26abc.blob.core.windows.net/public/latest.json')).toEqual([])
  })
  it('refuses http, other hosts, lookalikes and non-URLs, naming the setting', () => {
    for (const u of [
      'http://vic26abc.blob.core.windows.net/public/latest.json',
      'https://evil.example/latest.json',
      'https://blob.core.windows.net.evil.example/latest.json',
      'https://evilblob.core.windows.net.example/latest.json',
      'https://core.windows.net/latest.json',
      'not a url',
    ]) {
      const problems = latest(u)
      expect(problems, u).toHaveLength(1)
      expect(problems[0]).toContain('VITE_LATEST_URL')
    }
  })
  it('accepts the CDN host named by PUBLIC_BASE_URL, and only that one', () => {
    const cdn = { PUBLIC_BASE_URL: 'https://cdn.example.org/vic26' }
    expect(latest('https://cdn.example.org/vic26/latest.json', cdn)).toEqual([])
    expect(latest('https://other.example.org/latest.json', cdn)).toHaveLength(1)
  })
})

// VE-188: the public build shows live data only; the rehearsal rig (production build, loopback stand-in view) must keep drawing marked replay data.
describe('isPublicBuild', () => {
  const view = (host: string) => `https://${host}/arcgis/rest/services/vic26election_live_view/FeatureServer`
  it('is never true on the dev server', () => {
    expect(isPublicBuild(true, view('services1.arcgis.com'))).toBe(false)
  })
  it('is false for a loopback view (the rig)', () => {
    for (const h of ['127.0.0.1:8443', 'localhost:8443', '[::1]:8443', 'LOCALHOST']) expect(isPublicBuild(false, view(h)), h).toBe(false)
  })
  it('is true for the real service host, and when the URL is unset or unparsable (fails safe)', () => {
    expect(isPublicBuild(false, view('services1.arcgis.com'))).toBe(true)
    expect(isPublicBuild(false, view('services-ap1.arcgis.com'))).toBe(true)
    expect(isPublicBuild(false, 'not a url')).toBe(true)
    expect(isPublicBuild(false, undefined)).toBe(true)
  })
})
