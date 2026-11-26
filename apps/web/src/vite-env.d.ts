/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "replay" or "agol"; `?source=` overrides. Defaults: replay in dev, agol in a build. */
  readonly VITE_RESULTS_SOURCE?: string
  /** Public view FeatureServer URL. Dev builds default to the dev view vic26election_view (ADR 0004); a public build (BASE_PATH set) must set it to vic26election_live_view (ADR 0030). */
  readonly VITE_AGOL_VIEW_URL?: string
  /** Static latest.json pointer URL (ADR 0016, VE-55). Empty: poll the AGOL status row alone. */
  readonly VITE_LATEST_URL?: string
  /** VE-200: an outside forecast site (https). Empty hides the Polling model card in the Explore sheet. */
  readonly VITE_FORECAST_URL?: string
  /** VE-254: the words after "Replay:" on the marker and in the "i" sheet (dev server only; empty means the default "2022, not live"). */
  readonly VITE_REPLAY_LABEL?: string
}
