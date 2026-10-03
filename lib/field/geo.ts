/**
 * City centroids and great-circle distance.
 *
 * Why the coordinates live here rather than in `lib/locations/saudi-cities.ts`:
 * that module is the *catalogue* (names, whether we serve a city, marketing
 * copy) and is imported by client components on the public site. Geography is a
 * separate concern with a separate reason to change — a city centre moves when
 * the field team says it moves, and that should not touch the marketing list.
 *
 * These are city-centre approximations, not address geocodes. They exist to
 * answer "which city is nearer" on the claim feed and to place a marker when an
 * order has no per-order coordinates of its own. Every surface that uses them
 * says so rather than implying street-level precision.
 */

export type Coordinates = { latitude: number; longitude: number }

/**
 * The five supported Eastern Province cities, in the order the coverage list
 * uses. Values are the approximate centre of each built-up area.
 */
export const CITY_COORDINATES: Record<string, Coordinates> = {
  الدمام: { latitude: 26.4207, longitude: 50.0888 },
  الخبر: { latitude: 26.2172, longitude: 50.1971 },
  الجبيل: { latitude: 27.0046, longitude: 49.6460 },
  القطيف: { latitude: 26.5196, longitude: 50.0115 },
  الأحساء: { latitude: 25.3833, longitude: 49.5872 },
}

/** Reverse lookup: the nearest supported city to a point, with its distance. */
export function nearestCity(latitude: number, longitude: number): { city: string; distanceMeters: number } | null {
  let best: { city: string; distanceMeters: number } | null = null
  for (const [city, point] of Object.entries(CITY_COORDINATES)) {
    const metres = distanceMeters(latitude, longitude, point.latitude, point.longitude)
    if (!best || metres < best.distanceMeters) best = { city, distanceMeters: metres }
  }
  return best
}

/** Mean Earth radius, in metres, as used by the haversine formula. */
const EARTH_RADIUS_M = 6_371_000

/**
 * Haversine distance between two WGS-84 points, in metres.
 *
 * The haversine form (rather than the spherical law of cosines) is used because
 * it stays numerically stable at the small separations this app cares about —
 * two petrol stations a few hundred metres apart would lose precision under the
 * cosine form on a 32-bit intermediate.
 */
export function distanceMeters(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const deltaLat = toRadians(toLatitude - fromLatitude)
  const deltaLng = toRadians(toLongitude - fromLongitude)
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(fromLatitude)) * Math.cos(toRadians(toLatitude)) * Math.sin(deltaLng / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Arabic distance formatting: metres under a kilometre, one decimal above. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} م`
  return `${(metres / 1000).toFixed(1)} كم`
}
