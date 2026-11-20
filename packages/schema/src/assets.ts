/**
 * Static app assets (ADR 0025): reference data fixed before the night, shipped as JSON with the app rather than as an
 * AGOL layer. Not part of SCHEMA_VERSION, which covers the AGOL layers only.
 */

/** One state seat in the One Nation lens's file (VE-101): federal votes placed into the seat, plus extra Census measures. */
export interface OneNationSeat {
  district_id: number;
  /** One Nation's share of formal federal House first preferences at polling places in the seat, per cent. Null where it did not stand or the votes were too few to place. */
  on_2022_pct: number | null;
  on_2025_pct: number | null;
  /** Too few votes to trust that year's share (VE-101a `low_votes`). */
  on_2022_low: boolean;
  on_2025_low: boolean;
  /** One Nation stood in only some of the federal divisions overlapping the seat that year. */
  on_2022_partial: boolean;
  on_2025_partial: boolean;
  /** ABS Census 2021, apportioned by Mesh Block (ADR 0013). Per cent unless named otherwise. */
  pct_year12: number | null;
  pct_trades_labour: number | null;
  pct_trade_cert: number | null;
  pct_unemployed: number | null;
  pct_own_home: number | null;
  pct_detached_house: number | null;
  people_per_km2: number | null;
}

/** The parties the "Where is each party strongest?" toggle offers (FB-162). COA is LIB plus NAT. */
export type ShareParty = 'ALP' | 'COA' | 'LIB' | 'NAT' | 'GRN' | 'ONP' | 'IND' | 'OTH';

/** One state seat's 2025 federal House first-preference shares by party, placed by polling place (VE-101d, ADR 0025). */
export interface PartySharesSeat {
  district_id: number;
  /** Per cent of formal first preferences placed in the seat; 0 where the party did not stand. */
  share_2025: Record<ShareParty, number>;
  /** Fraction of the seat's placed votes cast where the party stood (0 to 1); a share under 1 is only partly comparable. */
  stood_2025: Partial<Record<ShareParty, number>>;
  /** Too few votes placed to trust the shares. */
  low_votes: boolean;
}

/** One district's 2022 state first preferences by party bucket (VE-130, ADR 0028), per cent of formal first preferences. */
export interface FirstPrefs2022Seat {
  district_id: number;
  /** Shares for every bucket that stood; buckets that did not stand are absent. Sums to 100 within rounding. */
  fp_2022_pct: Partial<Record<import('./parties').PartyBucket, number>>;
  fp_2022_formal: number;
}

export interface FirstPrefs2022Asset {
  /** Plain source line for the "i". */
  source: string;
  districts: FirstPrefs2022Seat[];
}

/** SEIFA 2021 distribution per district (VE-133, ADR 0025): share of residents by Victorian SA1 quintile, Mesh Block weighted. */
export interface SeifaSeat {
  district_id: number;
  /** Per cent of residents living in SA1s in Victoria's most disadvantaged fifth (IRSD quintile 1). */
  pct_irsd_q1: number;
  /** Per cent of residents living in SA1s in Victoria's most advantaged fifth (IRSAD quintile 5). */
  pct_irsad_q5: number;
}

export interface SeifaAsset {
  /** Plain source line for the "i". */
  source: string;
  districts: SeifaSeat[];
}

export interface OneNationAsset {
  /** 2025 federal shares for every party (FB-163); optional so an older file still loads while the lens falls back. */
  party_shares?: PartySharesSeat[];
  /** Plain source line for the lens's "i". */
  source: string;
  districts: OneNationSeat[];
}
