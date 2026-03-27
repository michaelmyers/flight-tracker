const EARTH_RADIUS_KM = 6371;

/**
 * Calculate the great-circle distance between two points using the Haversine formula
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Check if a point is within a circular zone
 */
export function insideCircle(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
  radiusKm: number
): boolean {
  const distance = haversineDistance(lat, lon, centerLat, centerLon);
  return distance <= radiusKm;
}
