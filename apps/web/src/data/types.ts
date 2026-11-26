import type { DistrictHistoryRow, DistrictStatic, SeatHexAttributes } from '@vic26/schema'

/** Minimal GeoJSON (WGS 84), enough for the two static layers the shell draws. */
export type Position = [number, number]
export type Geometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] }
export interface GeoFeature<P> {
  type: 'Feature'
  properties: P
  geometry: Geometry | null
}
export interface GeoCollection<P> {
  type: 'FeatureCollection'
  features: GeoFeature<P>[]
}

/** The hex layer's static fields only: results come from history, not from the geometry file. */
export type SeatHexStatic = Pick<SeatHexAttributes, keyof DistrictStatic | 'hex_q' | 'hex_r'>

export interface Statics {
  districts: GeoCollection<DistrictStatic>
  seatHexes: GeoCollection<SeatHexStatic>
  districtById: Map<number, DistrictStatic>
}

/** One moment in the count. */
export interface Tick {
  snapshotId: string
  snapshotAt: number
  /** Statewide formal-or-not votes counted as a share of enrolment, as the status table's votes_counted_pct. */
  countedPct: number
  /** Rebuilt by the replay from 2022 booth times rather than read from a VEC file. */
  synthetic: boolean
}

/** Every tick up to now, with the 88 district rows for each (rows[i] belongs to ticks[i]). */
export interface Timeline {
  ticks: Tick[]
  rows: DistrictHistoryRow[][]
  /** Enrolment per district for this election (VE-247), never the static layer's 2022 baseline on the live view. Absent: derive from each row. */
  enrolment?: ReadonlyMap<number, number>
}
