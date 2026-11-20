/** Builds the results source the page asked for (see chooseSourceKind). */
import { createAgolSource, DEFAULT_VIEW_URL } from './agolSource'
import { createReplaySource } from './replaySource'
import { chooseSourceKind, type ResultsSource } from './source'
import { FEED_MS } from './pollPlan'
import { demoClock, resolveNowParam } from './ticks'

export { FEED_MS }

/** Where the replay folder is served, under the app's base URL. The one place that says so. */
export const REPLAY_PATH = 'replay5/'

/** Replay "now" opens at 9 pm on the night, so later ticks keep arriving during a demo. */
const DEFAULT_NOW = '20221126_210000'

export function createSource(search = location.search): ResultsSource {
  const env = import.meta.env
  // URL overrides are dev-only: a production page must not be steerable into replay or a fake kill-switch state.
  const dev = env.DEV
  const kind = chooseSourceKind({ search: dev ? search : '', env: env.VITE_RESULTS_SOURCE, dev })
  const params = new URLSearchParams(dev ? search : '')
  if (kind === 'agol') return createAgolSource({ url: env.VITE_AGOL_VIEW_URL?.trim() || DEFAULT_VIEW_URL, latestUrl: env.VITE_LATEST_URL?.trim() || '' })

  // Real seconds per 5-minute feed step in the demo; ?cadence=<seconds> overrides.
  const cadenceMs = Math.max(1, Number.parseFloat(params.get('cadence') ?? '') || 15) * 1000
  let clock: ((real: number) => number) | null = null
  return createReplaySource({
    base: `${env.BASE_URL}${REPLAY_PATH}`,
    state: params.get('state'),
    message: params.get('message'),
    pollMs: Math.max(1000, cadenceMs / 3),
    clock: (ticks) => {
      clock ??= demoClock({
        startMs: resolveNowParam(ticks, params.get('now')) ?? resolveNowParam(ticks, DEFAULT_NOW) ?? 0,
        realStart: performance.now(),
        cadenceMs,
        feedMs: FEED_MS,
      })
      return clock(performance.now())
    },
  })
}
