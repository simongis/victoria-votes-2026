/**
 * VicGrid GDA2020 (EPSG 7899): Lambert conic conformal, two standard parallels, on GRS 1980.
 * Parameters from epsg.io/7899 (CONFIRMED): false origin -37, 145; standard parallels -36 and -38; 2,500,000 E and
 * 2,500,000 N at the false origin. Forward only (Snyder, Map Projections: A Working Manual, eqs 14-15 to 15-9).
 * Hand-written so the app and the geometry build script share one function and no projection library is needed.
 */
const A = 6378137
const F = 1 / 298.257222101
const E2 = 2 * F - F * F
const E = Math.sqrt(E2)
const RAD = Math.PI / 180
const LAT0 = -37 * RAD
const LON0 = 145
const LAT1 = -36 * RAD
const LAT2 = -38 * RAD
const FE = 2500000
const FN = 2500000

const m = (phi: number): number => Math.cos(phi) / Math.sqrt(1 - E2 * Math.sin(phi) ** 2)
const t = (phi: number): number => {
  const s = E * Math.sin(phi)
  return Math.tan(Math.PI / 4 - phi / 2) / ((1 - s) / (1 + s)) ** (E / 2)
}
const N = (Math.log(m(LAT1)) - Math.log(m(LAT2))) / (Math.log(t(LAT1)) - Math.log(t(LAT2)))
const BIG_F = m(LAT1) / (N * t(LAT1) ** N)
const RHO0 = A * BIG_F * t(LAT0) ** N

/** Longitude and latitude in degrees (GDA2020, treated as WGS 84 to well under a metre) to VicGrid metres [easting, northing]. */
export function vicgrid(lon: number, lat: number): [number, number] {
  const rho = A * BIG_F * t(lat * RAD) ** N
  const theta = N * (lon - LON0) * RAD
  return [FE + rho * Math.sin(theta), FN + RHO0 - rho * Math.cos(theta)]
}
