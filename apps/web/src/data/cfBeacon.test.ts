import { describe, expect, it } from 'vitest'
import { BEACON_CONNECT_HOST, BEACON_SCRIPT_URL, beaconTag, checkBeaconToken, injectBeacon } from './cfBeacon'

// A made-up token, built rather than written out, so the public export's secret scans do not flag a test fixture.
const FAKE = '0123456789abcdef'.repeat(2)

describe('checkBeaconToken', () => {
  it('treats absent and blank as "no beacon", not a problem', () => {
    expect(checkBeaconToken(undefined)).toEqual({ token: null, problems: [] })
    expect(checkBeaconToken('')).toEqual({ token: null, problems: [] })
    expect(checkBeaconToken('   ')).toEqual({ token: null, problems: [] })
  })

  it('accepts 32 lowercase hex, trimming stray whitespace from a pasted variable', () => {
    expect(checkBeaconToken(FAKE)).toEqual({ token: FAKE, problems: [] })
    expect(checkBeaconToken(` ${FAKE}\n`)).toEqual({ token: FAKE, problems: [] })
  })

  it.each([
    ['too short', FAKE.slice(1)],
    ['too long', FAKE + 'a'],
    ['uppercase', FAKE.toUpperCase().replace(/0/g, 'A')],
    ['non-hex', 'g'.repeat(32)],
    ['a quote that would break out of the attribute', `${FAKE.slice(2)}"}`],
    ['markup', `${FAKE.slice(0, 20)}<script>`],
  ])('refuses %s, naming VITE_CF_BEACON_TOKEN and never echoing the value', (_n, bad) => {
    const r = checkBeaconToken(bad)
    expect(r.token).toBeNull()
    expect(r.problems).toHaveLength(1)
    expect(r.problems[0]).toMatch(/VITE_CF_BEACON_TOKEN/)
    expect(r.problems[0]).not.toContain(bad.trim())
  })
})

describe('beaconTag and injectBeacon', () => {
  it('builds one deferred external script with the token in data-cf-beacon', () => {
    const tag = beaconTag(FAKE)
    expect(tag).toBe(`<script defer src="${BEACON_SCRIPT_URL}" data-cf-beacon='{"token": "${FAKE}"}'></script>`)
  })

  it('inserts the tag once, before </body>', () => {
    const out = injectBeacon('<html><body><div id="root"></div></body></html>', FAKE)
    expect(out.match(/beacon\.min\.js/g)).toHaveLength(1)
    expect(out).toMatch(/<\/script>\s*<\/body>/)
  })

  it('leaves the page untouched with no token', () => {
    const html = '<html><body></body></html>'
    expect(injectBeacon(html, null)).toBe(html)
  })

  it('uses the hosts Cloudflare documents', () => {
    expect(BEACON_SCRIPT_URL).toBe('https://static.cloudflareinsights.com/beacon.min.js')
    expect(BEACON_CONNECT_HOST).toBe('https://cloudflareinsights.com')
  })
})
