// Kill switch states (ADR 0009). Written only by Simon, never by ingest.
export const KILL_SWITCH_STATES = ["live", "paused", "offline"] as const;
export type KillSwitchState = (typeof KILL_SWITCH_STATES)[number];

// The app refuses to render publicly unless data_mode is "live" (CLAUDE.md hard rule 2).
export const DATA_MODES = ["live", "trial", "replay"] as const;
export type DataMode = (typeof DATA_MODES)[number];

export const DISTRICT_STATUSES = ["no_results", "counting", "pairing_changed", "withheld", "declared"] as const;
export type DistrictStatus = (typeof DISTRICT_STATUSES)[number];

export const BASELINE_SOURCES = ["SE2022", "PRAHRAN_BY_2025", "NARRACAN_SUPP_2023"] as const;
export type BaselineSource = (typeof BASELINE_SOURCES)[number];

export const BOOTH_TYPES = ["election_day", "evc", "mobile"] as const;
export type BoothType = (typeof BOOTH_TYPES)[number];

export const GEOM_SOURCES = ["vec", "geocoded", "none"] as const;
export type GeomSource = (typeof GEOM_SOURCES)[number];

export const BASE_MATCHES = ["id", "name_location", "none"] as const;
export type BaseMatch = (typeof BASE_MATCHES)[number];

/** A seat is "in doubt" when the 2CP leader is under this % (approved 2026-10-24). */
export const IN_DOUBT_TCP_PCT = 52;

/** Snapshot id is the VEC file timestamp. */
export const SNAPSHOT_ID_PATTERN = /^\d{8}_\d{6}$/;
