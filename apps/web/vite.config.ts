import { defineConfig, type Plugin } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkProductionView, isPublicBuild } from './src/data/productionView.ts'
import { BEACON_CONNECT_HOST, BEACON_SCRIPT_URL, checkBeaconToken, injectBeacon } from './src/data/cfBeacon.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

// GitHub Pages project URLs look like https://owner.github.io/repo/, so build
// with BASE_PATH=/repo/. Defaults to / for local dev and root hosting.
const base = process.env.BASE_PATH?.trim() || '/'

// The five-minute replay (VE-45) is served from where ingest wrote it, so nothing is copied into git or public/.
// Dev and preview only: a production build reads AGOL. REPLAY_DIR overrides the folder.
const replayDir = path.resolve(here, process.env.REPLAY_DIR ?? '../../packages/ingest/out/replay-se22-5min')
const REPLAY_PREFIX = `${base}replay5/`
const MIME: Record<string, string> = { '.json': 'application/json', '.geojson': 'application/geo+json' }

function replayMount(): Plugin {
  const handler = (req: { url?: string }, res: import('node:http').ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0] ?? ''
    if (!url.startsWith(REPLAY_PREFIX)) return next()
    const file = path.resolve(replayDir, decodeURIComponent(url.slice(REPLAY_PREFIX.length)))
    if (!file.startsWith(replayDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404
      res.end('not found')
      return
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  }
  return {
    name: 'vic26-replay-mount',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  }
}

// ---- Go-live guards (VE-148) -----------------------------------------------------------------------------------------
// GitHub Pages cannot set response headers, so the Content Security Policy goes in as a <meta> tag, at build only
// (the dev server needs inline HMR scripts). Meta CSP cannot carry frame-ancestors, report-uri or sandbox.

/** The public view, read from the one place that names it (agolSource.ts), so config and app cannot drift apart. */
function publicViewUrl(): string {
  const src = fs.readFileSync(path.resolve(here, 'src/data/agolSource.ts'), 'utf8')
  const m = /DEFAULT_VIEW_URL\s*=\s*['"`]([^'"`]+)['"`]/.exec(src)
  if (!m?.[1]) throw new Error('vite.config: could not read DEFAULT_VIEW_URL from src/data/agolSource.ts')
  return m[1]
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function buildCsp(env: Record<string, string>, publicUrl: string, styleHashes: string[], beacon = false): string {
  const connect = new Set<string>(["'self'"])
  for (const u of [publicUrl, env.VITE_AGOL_VIEW_URL ?? '', env.VITE_LATEST_URL ?? '']) {
    const o = u.trim() ? originOf(u.trim()) : null
    if (o) connect.add(o)
  }
  // Inline style attributes are not allowed: React sets styles through the CSSOM, which a style-src without
  // 'unsafe-inline' still permits. The one <style> in index.html (the neutral first paint) is allowed by hash.
  // Analytics (VE-187): only the beacon's exact script URL and its reporting host, and only when the build carries the tag.
  if (beacon) connect.add(BEACON_CONNECT_HOST)
  const style = ["'self'", ...styleHashes.map((h) => `'sha256-${h}'`)]
  return [
    "default-src 'self'",
    `script-src 'self'${beacon ? ` ${BEACON_SCRIPT_URL}` : ''}`,
    `style-src ${style.join(' ')}`,
    "img-src 'self' data:",
    "worker-src 'self'",
    `connect-src ${[...connect].join(' ')}`,
    "font-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ')
}

function goLiveGuards(): Plugin {
  let env: Record<string, string> = {}
  // Set only for the public build; null everywhere else (dev, replay, the rehearsal rig on 127.0.0.1) so none of them load it.
  let beaconToken: string | null = null
  return {
    name: 'vic26-go-live-guards',
    apply: 'build',
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir || config.root, 'VITE_')
      // Real process env wins in loadEnv for VITE_ keys, which is how CI passes them.
      if (process.env.BASE_PATH?.trim()) {
        const problems = checkProductionView({ ...env, PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL })
        if (problems.length) {
          throw new Error(`Public build refused (BASE_PATH is set): ${problems.join('; ')}. Set VITE_AGOL_VIEW_URL to the live view (ADR 0030).`)
        }
        if (isPublicBuild(false, env.VITE_AGOL_VIEW_URL)) {
          const check = checkBeaconToken(env.VITE_CF_BEACON_TOKEN)
          if (check.problems.length) throw new Error(`Public build refused: ${check.problems.join('; ')}`)
          beaconToken = check.token
        }
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html)) {
          throw new Error('vite.config: an inline <script> in index.html would break the CSP (script-src self)')
        }
        const hashes = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) =>
          createHash('sha256').update(m[1] ?? '', 'utf8').digest('base64'),
        )
        // A public build's policy names the live view it checked; a dev build keeps the default (dev) view.
        const csp = buildCsp(env, process.env.BASE_PATH?.trim() ? (env.VITE_AGOL_VIEW_URL ?? '') : publicViewUrl(), hashes, beaconToken !== null)
        return injectBeacon(html, beaconToken).replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
      },
    },
  }
}

const RELEASE_TAG = 'r2c'

export default defineConfig({
  base,
  plugins: [react(), replayMount(), goLiveGuards()],
  // No manualChunks, on purpose (VE-51, docs/research/first-load.md). A rule that put all of @arcgis/core in one
  // chunk also swallowed the library's lazy modules (3D, video, geometry engine, every layer type), so the page
  // downloaded and evaluated a 12 MB (3.3 MB gzip) file before first paint. Left to the bundler, only what MapView
  // needs at start is eager (about 1.9 MB raw, 0.5 MB gzip) and the rest stays behind dynamic imports.
  // The first paint came down from about 6 s to about 1.5 s on this laptop. Do not add the rule back.
  // VE-318: every built file carries a release tag, so a new release never reuses a file name that GitHub Pages' cache
  // may hold as a 404 from an earlier, half-deployed release (28 Nov, 7:57 pm: StageInfo chunk 404 stuck at the edge).
  // Bump RELEASE_TAG for each public release.
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${RELEASE_TAG}-[hash].js`,
        chunkFileNames: `assets/[name]-${RELEASE_TAG}-[hash].js`,
        assetFileNames: `assets/[name]-${RELEASE_TAG}-[hash][extname]`,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
