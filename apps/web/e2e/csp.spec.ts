import { expect, test, type Locator, type Page } from '@playwright/test'

// VE-148: the production build, served by `vite preview` under the Pages path, must run under its Content Security
// Policy without a single violation, and must not request anything that comes back 4xx from its own origin.
//
// Needs a production build, so it only runs when E2E_PREVIEW_URL names one (the normal suite and the dev server skip it):
//   BASE_PATH=/victoria-votes-2026/ npm run build -w @vic26/web
//   BASE_PATH=/victoria-votes-2026/ npx vite preview apps/web --port 5184 --strictPort --host 127.0.0.1
//   E2E_BASE_URL=http://127.0.0.1:5184 E2E_PREVIEW_URL=http://127.0.0.1:5184/victoria-votes-2026/ npx playwright test csp.spec.ts
// On Windows Git Bash, prefix commands with MSYS_NO_PATHCONV=1 or BASE_PATH is rewritten to a Git path.
//
// With data (VE-164): the rig serves the replay over self-signed https under .../vic26election_live_view/FeatureServer
// (docs/rehearsal.md, "The production build on the rig"). Build with that URL as VITE_AGOL_VIEW_URL, then set
// E2E_EXPECT_DATA=1 so the spec also insists the page really drew seats and shows the replay marker (hard rule 2).
// Without data the page is empty and these checks would pass for nothing, hence the flag.
const PREVIEW = process.env.E2E_PREVIEW_URL?.trim()
test.skip(!PREVIEW, 'set E2E_PREVIEW_URL to a vite preview of the production build')
// The rig's certificate is self-signed; nothing else in this spec talks https to anything it should distrust.
test.use({ ignoreHTTPSErrors: true })
const EXPECT_DATA = process.env.E2E_EXPECT_DATA === '1'

// The lens ids in src/components/explore/lenses.ts. A lens a build cannot open yet just shows the main view, which is fine.
const LENSES = ['arrows', 'counted', 'prefs', 'one-nation', 'similar', 'multiples']

interface Watch {
  violations: () => Promise<string[]>
  badResponses: string[]
  pageErrors: string[]
}

async function watch(page: Page): Promise<Watch> {
  // Registered before any page script runs, so a violation during boot is not missed.
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] }
    w.__csp = []
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile || 'page'}:${e.lineNumber}`)
    })
  })
  const origin = new URL(PREVIEW!).origin
  const badResponses: string[] = []
  const pageErrors: string[] = []
  page.on('response', (r) => {
    // Own origin only: the public AGOL view is the real service and its answers are not this spec's business.
    if (r.url().startsWith(origin) && r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`)
  })
  page.on('pageerror', (e) => pageErrors.push(e.message))
  // Chrome also logs a blocked load to the console; catch it in case the event listener missed one.
  page.on('console', (m) => {
    if (/Content Security Policy|violates the following/i.test(m.text())) pageErrors.push(`console: ${m.text().slice(0, 200)}`)
  })
  return {
    violations: () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp),
    badResponses,
    pageErrors,
  }
}

/** Opens the app and gives the first paint and the first data fetch time to settle. */
async function open(page: Page, query = '') {
  await page.goto(`${PREVIEW}${query}`)
  await expect(page.getByRole('heading', { name: 'Victoria Votes 2026' })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2_500)
}

/** Clicks the first of these if it is on screen; a build with no figures yet may not offer every control. */
async function clickIfThere(page: Page, loc: Locator) {
  const first = loc.first()
  if (await first.isVisible().catch(() => false)) {
    await first.click()
    await page.waitForTimeout(800)
    return true
  }
  return false
}

async function expectClean(page: Page, w: Watch) {
  expect(await w.violations(), 'CSP violations').toEqual([])
  expect(w.badResponses, '4xx or 5xx from the app origin').toEqual([])
  expect(w.pageErrors, 'page errors and CSP console lines').toEqual([])
  // The policy must really be there, or every check above passes for nothing.
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
}

test('desktop: main view, shapes, seat panel and polling places run clean under the CSP', async ({ page }) => {
  const w = await watch(page)
  await open(page)
  await expect(page.getByTestId('map-svg')).toBeVisible({ timeout: 30_000 })
  if (EXPECT_DATA) {
    // The data on the rig is the 2022 replay: it must say so, and it must really have drawn seats (the hexes sit under the map until Hex is chosen).
    await expect(page.getByTestId('data-label')).toContainText('Replay')
    await expect(page.locator('[data-testid=seat-hexes] polygon[role="button"]').first()).toBeAttached({ timeout: 30_000 })
  }

  await clickIfThere(page, page.getByRole('radio', { name: 'Hex', exact: true }))
  await clickIfThere(page, page.getByRole('radio', { name: 'Map', exact: true }))

  // Seat panel: click a hex (the result of a click is the district panel).
  await clickIfThere(page, page.locator('[data-testid=seat-hexes] polygon[role="button"]'))
  await page.keyboard.press('Escape')

  // Polling places, then back.
  if (await clickIfThere(page, page.getByRole('button', { name: 'Polling places', exact: true }))) {
    await page.waitForTimeout(1_500)
    await clickIfThere(page, page.getByRole('button', { name: 'Hide seats' }))
  }
  // The info sheet carries the attribution (ADR 0017); opening it exercises the dialog styles.
  await clickIfThere(page, page.getByRole('button', { name: /About these figures|About this view|How to read this/ }))
  await expectClean(page, w)
})

for (const lens of LENSES) {
  test(`desktop: the ${lens} lens runs clean under the CSP`, async ({ page }) => {
    const w = await watch(page)
    await open(page, `?explore=${lens}`)
    await page.waitForTimeout(2_000)
    await expectClean(page, w)
  })
}

test('phone (390 px): main view, the View sheet and a seat run clean under the CSP', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const w = await watch(page)
  await open(page)
  if (await clickIfThere(page, page.getByRole('button', { name: 'View', exact: true }))) {
    await clickIfThere(page, page.getByRole('dialog', { name: 'View' }).getByRole('radio', { name: 'Hex', exact: true }))
  }
  await clickIfThere(page, page.locator('[data-testid=seat-hexes] polygon[role="button"]'))
  await page.keyboard.press('Escape')
  await expectClean(page, w)
})

test('the policy names the public view and nothing else outside the site', async ({ page }) => {
  await page.goto(PREVIEW!)
  const csp = (await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')) ?? ''
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("script-src 'self'")
  expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|\*/)
  const connect = /connect-src ([^;]+)/.exec(csp)?.[1]?.split(' ') ?? []
  expect(connect).toContain("'self'")
  // Only https origins beyond 'self', and the dev service is never one of them. A port is allowed on 127.0.0.1 alone
  // (the rig's stand-in); a real public view never has one.
  for (const src of connect.filter((s) => s !== "'self'")) expect(src).toMatch(/^https:\/\/([a-z0-9.-]+|127\.0\.0\.1:\d+)$/)
  expect(csp).not.toMatch(/vic26election_dev/)
})

// VE-187: the analytics beacon is in the page and the policy exactly when the build had VITE_CF_BEACON_TOKEN. Set
// E2E_BEACON_TOKEN to the same value the build used to check the "with" side; leave it unset to check the "without" side.
test('the Cloudflare beacon appears only when the build carried a token, with only its two hosts in the policy', async ({ page }) => {
  const token = process.env.E2E_BEACON_TOKEN?.trim()
  await page.goto(PREVIEW!)
  const csp = (await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')) ?? ''
  const beacons = page.locator('script[src*="cloudflareinsights"]')
  if (token) {
    await expect(beacons).toHaveCount(1)
    await expect(beacons).toHaveAttribute('src', 'https://static.cloudflareinsights.com/beacon.min.js')
    await expect(beacons).toHaveAttribute('data-cf-beacon', `{"token": "${token}"}`)
    expect(/script-src ([^;]+)/.exec(csp)?.[1]).toBe("'self' https://static.cloudflareinsights.com/beacon.min.js")
    expect(/connect-src ([^;]+)/.exec(csp)?.[1]?.split(' ')).toContain('https://cloudflareinsights.com')
  } else {
    await expect(beacons).toHaveCount(0)
    expect(csp).not.toMatch(/cloudflare/)
  }
})

// VE-212 (VE-211 worker B): the places-like-yours lens drew its thread stagger through style="" attributes, which the CSP
// refuses (58 style-src-attr violations), so the delays were lost in the public build. They are now set through the CSSOM.
test('desktop: the places-like-yours lens draws its threads with their stagger and no CSP violation', async ({ page }) => {
  const w = await watch(page)
  await open(page, '?explore=similar')
  await expect(page.getByTestId('similar-lens')).toBeVisible({ timeout: 30_000 })
  if (EXPECT_DATA) {
    // Needs the seats loaded: five badges drawn means the picked seat and its five places were found.
    await expect(page.getByTestId('similar-threads').locator('g.gen:not(.gen--out) .c-badge')).toHaveCount(5, { timeout: 30_000 })
    const delays = await page.locator('.similar .gen:not(.gen--out) .c-halo').evaluateAll((els) => els.map((e) => getComputedStyle(e).animationDelay))
    expect(new Set(delays).size, 'each thread has its own start delay').toBe(5)
  }
  if (EXPECT_DATA) await page.getByTestId('similar-select').selectOption({ index: 5 })
  await page.waitForTimeout(1_500)
  await expectClean(page, w)
})
