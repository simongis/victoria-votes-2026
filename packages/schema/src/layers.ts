// Layer and field definitions (schema v0.1, approved 2026-10-24). See ../SCHEMA.md for the why.
// Changing anything here needs a new ADR (ADR 0003).
import { PARTY_BUCKETS, type PartyBucket } from "./parties";
import type {
  BaseMatch,
  BaselineSource,
  BoothType,
  DataMode,
  DistrictStatus,
  GeomSource,
  KillSwitchState,
} from "./status";

export const SCHEMA_VERSION = "0.4.0"; // 0.2.0 district_demographics (ADR 0012); 0.3.0 district_change (ADR 0014); 0.4.0 field names (ADR 0021)

export type FieldType = "int" | "double" | "string" | "bool" | "date";
export interface FieldDef {
  name: string;
  type: FieldType;
  nullable: boolean;
}
export type GeometryType = "polygon" | "point" | "none";
export interface LayerDef {
  id: number;
  name: string;
  geometry: GeometryType;
  keyField: string;
  fields: readonly FieldDef[];
}

const f = (name: string, type: FieldType, nullable = true): FieldDef => ({ name, type, nullable });
const perBucket = (prefix: string, type: FieldType, suffix = ""): FieldDef[] =>
  PARTY_BUCKETS.map((p) => f(`${prefix}${p}${suffix}`, type));

// ---- Attribute types (what ingest writes and the app reads) ----

type Buckets<Prefix extends string, Suffix extends string, T> = {
  [P in PartyBucket as `${Prefix}${P}${Suffix}`]: T | null;
};
export type FpVotes = Buckets<"fp_", "", number>;
export type FpSwing = Buckets<"fpswing_", "", number>;
export type BaseFpPct = Buckets<"base_fp_", "_pct", number>;
export type Seats = Buckets<"seats_", "", number>;

export interface SnapshotStamp {
  snapshot_id: string | null;
  updated_at: number | null; // epoch ms
}

export interface DistrictStatic {
  district_id: number;
  contest_id: number;
  district_name: string;
  short_name: string;
  region_name: string;
  enrolment: number | null;
  base_source: BaselineSource;
  base_winner_party: PartyBucket | null;
  base_tcp_party_a: PartyBucket | null;
  base_tcp_party_b: PartyBucket | null;
  base_tcp_pct_a: number | null;
  base_margin: number | null;
  base_classic: boolean | null;
}

export interface DistrictResult extends FpVotes, FpSwing, SnapshotStamp {
  fp_formal: number | null;
  fp_informal: number | null;
  fp_total: number | null;
  fp_booths_returned: number | null;
  fp_booths_expected: number | null;
  pct_counted: number | null;
  pct_booths: number | null;
  lead_party: PartyBucket | null;
  lead_fp_pct: number | null;
  tcp_party_a: PartyBucket | null;
  tcp_party_b: PartyBucket | null;
  tcp_pct_a: number | null;
  tcp_booths_returned: number | null;
  tcp_booths_expected: number | null;
  tcp_withheld: boolean | null;
  pairing_changed: boolean | null;
  tcp_swing_to_a: number | null;
  changed_hands: boolean | null;
  status: DistrictStatus;
  declared: boolean | null;
  elected_party: PartyBucket | null;
}

export type DistrictAttributes = DistrictStatic & DistrictResult;
export type SeatHexAttributes = DistrictAttributes & { hex_q: number; hex_r: number };

export interface BoothAttributes extends FpVotes, FpSwing, BaseFpPct, SnapshotStamp {
  booth_id: number;
  booth_name: string;
  district_id: number;
  booth_type: BoothType;
  geom_source: GeomSource;
  base_booth_id: number | null;
  base_match: BaseMatch;
  base_tcp_party_a: PartyBucket | null;
  base_tcp_party_b: PartyBucket | null;
  base_tcp_pct_a: number | null;
  fp_formal: number | null;
  fp_total: number | null;
  lead_party: PartyBucket | null;
  lead_fp_pct: number | null;
  tcp_party_a: PartyBucket | null;
  tcp_party_b: PartyBucket | null;
  tcp_pct_a: number | null;
  tcp_swing_to_a: number | null;
  reported: boolean;
  first_reported_at: number | null;
}

export interface BoothHexAttributes extends FpVotes, FpSwing, SnapshotStamp {
  hex_id: string;
  district_ids: string; // comma list: a hex can straddle districts
  booths_total: number;
  booths_reported: number;
  fp_total: number | null;
  lead_party: PartyBucket | null;
  lead_fp_pct: number | null;
}

export interface CandidateAttributes extends SnapshotStamp {
  candidate_id: number;
  district_id: number;
  candidate_name: string;
  ballot_position: number;
  affiliation_id: number | null;
  affiliation_name: string | null;
  party: PartyBucket;
  independent: boolean;
  fp_votes: number | null;
  fp_pct: number | null;
  tcp_votes: number | null;
  tcp_pct: number | null;
  elected: boolean | null;
}

export interface DistrictHistoryRow extends FpVotes {
  snapshot_id: string;
  snapshot_at: number;
  district_id: number;
  pct_counted: number | null;
  pct_booths: number | null;
  fp_total: number | null;
  lead_party: PartyBucket | null;
  tcp_party_a: PartyBucket | null;
  tcp_party_b: PartyBucket | null;
  tcp_pct_a: number | null;
  tcp_withheld: boolean | null;
  changed_hands: boolean | null;
  status: DistrictStatus;
  // ADR 0034: the VEC's Elected flag names a declared winner; the 2CP leader can be on the wrong pair.
  elected_party: PartyBucket | null;
  // ADR 0034: votes counted after preferences, so ADR 0033's half-counted rule can be applied per tick.
  tcp_total: number | null;
}

export interface BoothHistoryRow extends FpVotes {
  snapshot_id: string;
  snapshot_at: number;
  booth_id: number;
  district_id: number;
  fp_total: number | null;
  tcp_party_a: PartyBucket | null;
  tcp_pct_a: number | null;
}

export interface StatusAttributes extends Seats {
  state: KillSwitchState; // Simon only
  message: string | null; // Simon only
  snapshot_id: string | null;
  snapshot_at: number | null;
  ingested_at: number | null;
  seats_declared: number | null;
  seats_in_doubt: number | null;
  votes_counted_pct: number | null;
  feed_phase: string | null;
  data_mode: DataMode;
}

/** Static Census 2021 profile per district (ADR 0012). Medians and SEIFA are population-weighted SA1 means. */
export interface DistrictDemographicsAttributes {
  district_id: number;
  pop_total: number;
  pct_age_18_34: number | null;
  pct_age_65_plus: number | null;
  median_age: number | null;
  pct_born_overseas: number | null;
  pct_lote: number | null;
  pct_no_religion: number | null;
  median_hh_income_wk: number | null;
  pct_renting: number | null;
  pct_bachelor_plus: number | null;
  pct_professionals: number | null;
  pct_no_vehicle: number | null;
  seifa_irsad: number | null;
  seifa_irsad_rank: number | null; // 1 = most advantaged of the 88
  sa1_count: number;
  data_source: string;
}

/** "Since the last election" change measures per district (ADR 0014). Modelled from ABS SA2/SA1 data and the 2025 grid. */
export interface DistrictChangeAttributes {
  district_id: number;
  pop_2021: number | null;
  pop_2025: number | null;
  pop_change_abs: number | null;
  pop_change_pct: number | null;
  nat_increase: number | null;
  net_internal: number | null;
  net_overseas: number | null;
  net_overseas_share: number | null;
  median_age_2025: number | null;
  pct_65plus_2025: number | null;
  approvals_5y: number | null;
  approvals_per_1000: number | null;
  house_price_2024_approx: number | null;
  unit_price_2024_approx: number | null;
  rent_median_2021_approx: number | null;
  income_median_2223_approx: number | null;
  income_earners_change_pct: number | null;
  jobs_change_pct: number | null;
  biz_net_2425: number | null;
  biz_net_pct: number | null;
  proj_2032: number | null;
  proj_change_pct: number | null;
  pct_rent_stress: number | null;
  pct_arrived_5y: number | null;
  pct_mortgage_stress: number | null;
  grid_pop_2025: number | null;
  grid_vs_mb_gap_pct: number | null;
  split_share_pct: number | null;
  coverage_pct: number | null;
  modelled: boolean;
  method: string;
  vintages: string; // JSON: field -> reference date
  erp_series: string; // JSON array, ERP 2001..2025 for sparklines
  proj_series: string; // JSON array, projections 2022..2032
}

/** Fields in StatusAttributes that ingest must never write. */
export const STATUS_OPERATOR_FIELDS = ["state", "message"] as const;

// ---- Field lists (used to create the AGOL service and to check writes) ----

// On districts, seat hexes and candidates the stamp is the current snapshot (the app checks candidates' stamps). On booths
// and booth hexes it is the snapshot that last changed the row: unchanged rows are not rewritten (ADR 0031).
const stamp = [f("snapshot_id", "string"), f("updated_at", "date")];

const districtStaticFields = [
  f("district_id", "int", false),
  f("contest_id", "int", false),
  f("district_name", "string", false),
  f("short_name", "string", false),
  f("region_name", "string", false),
  f("enrolment", "int"),
  f("base_source", "string", false),
  f("base_winner_party", "string"),
  f("base_tcp_party_a", "string"),
  f("base_tcp_party_b", "string"),
  f("base_tcp_pct_a", "double"),
  f("base_margin", "double"),
  f("base_classic", "bool"),
];

export const DISTRICT_RESULT_FIELDS: readonly FieldDef[] = [
  ...perBucket("fp_", "int"),
  f("fp_formal", "int"),
  f("fp_informal", "int"),
  f("fp_total", "int"),
  f("fp_booths_returned", "int"),
  f("fp_booths_expected", "int"),
  f("pct_counted", "double"),
  f("pct_booths", "double"),
  f("lead_party", "string"),
  f("lead_fp_pct", "double"),
  f("tcp_party_a", "string"),
  f("tcp_party_b", "string"),
  f("tcp_pct_a", "double"),
  f("tcp_booths_returned", "int"),
  f("tcp_booths_expected", "int"),
  f("tcp_withheld", "bool"),
  f("pairing_changed", "bool"),
  f("tcp_swing_to_a", "double"),
  ...perBucket("fpswing_", "double"),
  f("changed_hands", "bool"),
  f("status", "string", false),
  f("declared", "bool"),
  f("elected_party", "string"),
  ...stamp,
];

export const LAYERS = {
  districts: {
    id: 0,
    name: "districts",
    geometry: "polygon",
    keyField: "district_id",
    fields: [...districtStaticFields, ...DISTRICT_RESULT_FIELDS],
  },
  seat_hexes: {
    id: 1,
    name: "seat_hexes",
    geometry: "polygon",
    keyField: "district_id",
    fields: [...districtStaticFields, f("hex_q", "int", false), f("hex_r", "int", false), ...DISTRICT_RESULT_FIELDS],
  },
  booths: {
    id: 2,
    name: "booths",
    geometry: "point",
    keyField: "booth_id",
    fields: [
      f("booth_id", "int", false),
      f("booth_name", "string", false),
      f("district_id", "int", false),
      f("booth_type", "string", false),
      f("geom_source", "string", false),
      f("base_booth_id", "int"),
      f("base_match", "string", false),
      ...perBucket("base_fp_", "double", "_pct"),
      f("base_tcp_party_a", "string"),
      f("base_tcp_party_b", "string"),
      f("base_tcp_pct_a", "double"),
      ...perBucket("fp_", "int"),
      f("fp_formal", "int"),
      f("fp_total", "int"),
      f("lead_party", "string"),
      f("lead_fp_pct", "double"),
      f("tcp_party_a", "string"),
      f("tcp_party_b", "string"),
      f("tcp_pct_a", "double"),
      f("tcp_swing_to_a", "double"),
      ...perBucket("fpswing_", "double"),
      f("reported", "bool", false),
      f("first_reported_at", "date"),
      ...stamp,
    ],
  },
  booth_hexes: {
    id: 3,
    name: "booth_hexes",
    geometry: "polygon",
    keyField: "hex_id",
    fields: [
      f("hex_id", "string", false),
      f("district_ids", "string", false),
      f("booths_total", "int", false),
      f("booths_reported", "int", false),
      ...perBucket("fp_", "int"),
      f("fp_total", "int"),
      f("lead_party", "string"),
      f("lead_fp_pct", "double"),
      ...perBucket("fpswing_", "double"),
      ...stamp,
    ],
  },
  candidates: {
    id: 4,
    name: "candidates",
    geometry: "none",
    keyField: "candidate_id",
    fields: [
      f("candidate_id", "int", false),
      f("district_id", "int", false),
      f("candidate_name", "string", false),
      f("ballot_position", "int", false),
      f("affiliation_id", "int"),
      f("affiliation_name", "string"),
      f("party", "string", false),
      f("independent", "bool", false),
      f("fp_votes", "int"),
      f("fp_pct", "double"),
      f("tcp_votes", "int"),
      f("tcp_pct", "double"),
      f("elected", "bool"),
      ...stamp,
    ],
  },
  district_history: {
    id: 5,
    name: "district_history",
    geometry: "none",
    keyField: "district_id", // with snapshot_id; append-only
    fields: [
      f("snapshot_id", "string", false),
      f("snapshot_at", "date", false),
      f("district_id", "int", false),
      f("pct_counted", "double"),
      f("pct_booths", "double"),
      ...perBucket("fp_", "int"),
      f("fp_total", "int"),
      f("lead_party", "string"),
      f("tcp_party_a", "string"),
      f("tcp_party_b", "string"),
      f("tcp_pct_a", "double"),
      f("tcp_withheld", "bool"),
      f("changed_hands", "bool"),
      f("status", "string", false),
      f("elected_party", "string"), // ADR 0034
      f("tcp_total", "int"), // ADR 0034
    ],
  },
  booth_history: {
    id: 6,
    name: "booth_history",
    geometry: "none",
    keyField: "booth_id", // with snapshot_id; append-only, only changed booths
    fields: [
      f("snapshot_id", "string", false),
      f("snapshot_at", "date", false),
      f("booth_id", "int", false),
      f("district_id", "int", false),
      ...perBucket("fp_", "int"),
      f("fp_total", "int"),
      f("tcp_party_a", "string"),
      f("tcp_pct_a", "double"),
    ],
  },
  status: {
    id: 7,
    name: "status",
    geometry: "none",
    keyField: "snapshot_id", // exactly one row
    fields: [
      f("state", "string", false),
      f("message", "string"),
      f("snapshot_id", "string"),
      f("snapshot_at", "date"),
      f("ingested_at", "date"),
      ...perBucket("seats_", "int"),
      f("seats_declared", "int"),
      f("seats_in_doubt", "int"),
      f("votes_counted_pct", "double"),
      f("feed_phase", "string"),
      f("data_mode", "string", false),
    ],
  },
  district_demographics: {
    id: 8,
    name: "district_demographics",
    geometry: "none",
    keyField: "district_id",
    fields: [
      f("district_id", "int", false),
      f("pop_total", "int", false),
      f("pct_age_18_34", "double"),
      f("pct_age_65_plus", "double"),
      f("median_age", "double"),
      f("pct_born_overseas", "double"),
      f("pct_lote", "double"),
      f("pct_no_religion", "double"),
      f("median_hh_income_wk", "double"),
      f("pct_renting", "double"),
      f("pct_bachelor_plus", "double"),
      f("pct_professionals", "double"),
      f("pct_no_vehicle", "double"),
      f("seifa_irsad", "double"),
      f("seifa_irsad_rank", "int"),
      f("sa1_count", "int", false),
      f("data_source", "string", false),
    ],
  },
  district_change: {
    id: 9,
    name: "district_change",
    geometry: "none",
    keyField: "district_id",
    fields: [
      f("district_id", "int", false),
      f("pop_2021", "double"),
      f("pop_2025", "double"),
      f("pop_change_abs", "double"),
      f("pop_change_pct", "double"),
      f("nat_increase", "double"),
      f("net_internal", "double"),
      f("net_overseas", "double"),
      f("net_overseas_share", "double"),
      f("median_age_2025", "double"),
      f("pct_65plus_2025", "double"),
      f("approvals_5y", "double"),
      f("approvals_per_1000", "double"),
      f("house_price_2024_approx", "double"),
      f("unit_price_2024_approx", "double"),
      f("rent_median_2021_approx", "double"),
      f("income_median_2223_approx", "double"),
      f("income_earners_change_pct", "double"),
      f("jobs_change_pct", "double"),
      f("biz_net_2425", "double"),
      f("biz_net_pct", "double"),
      f("proj_2032", "double"),
      f("proj_change_pct", "double"),
      f("pct_rent_stress", "double"),
      f("pct_arrived_5y", "double"),
      f("pct_mortgage_stress", "double"),
      f("grid_pop_2025", "double"),
      f("grid_vs_mb_gap_pct", "double"),
      f("split_share_pct", "double"),
      f("coverage_pct", "double"),
      f("modelled", "bool", false),
      f("method", "string", false),
      f("vintages", "string", false),
      f("erp_series", "string", false),
      f("proj_series", "string", false),
    ],
  },
} as const satisfies Record<string, LayerDef>;

export type LayerName = keyof typeof LAYERS;
