/**
 * Check if an aircraft meets the altitude requirements for a zone
 * @param aircraftAltitude The current altitude of the aircraft in feet
 * @param minAltitude The minimum altitude for the zone (null for no minimum)
 * @param maxAltitude The maximum altitude for the zone (null for no maximum)
 * @returns true if aircraft meets altitude requirements, false otherwise
 */
export function checkAltitudeRequirements(
  aircraftAltitude: number | undefined,
  minAltitude: number | null,
  maxAltitude: number | null
): boolean {
  // If aircraft altitude is undefined, we can't check requirements
  if (aircraftAltitude === undefined) {
    return true; // Allow aircraft with no altitude data
  }

  // Check minimum altitude
  if (minAltitude !== null && aircraftAltitude < minAltitude) {
    return false;
  }

  // Check maximum altitude
  if (maxAltitude !== null && aircraftAltitude > maxAltitude) {
    return false;
  }

  return true;
}

/**
 * Get debug message for altitude filtering
 */
export function getAltitudeDebugMessage(
  aircraftHex: string,
  aircraftAltitude: number | undefined,
  minAltitude: number | null,
  maxAltitude: number | null,
  zoneId: number | string
): string | null {
  if (aircraftAltitude === undefined) {
    return `[ZONE ${zoneId} DEBUG] Aircraft ${aircraftHex} has no altitude data`;
  }

  if (minAltitude !== null && aircraftAltitude < minAltitude) {
    return `[ZONE ${zoneId} DEBUG] Aircraft ${aircraftHex} REJECTED - below min altitude (${aircraftAltitude}ft < ${minAltitude}ft)`;
  }

  if (maxAltitude !== null && aircraftAltitude > maxAltitude) {
    return `[ZONE ${zoneId} DEBUG] Aircraft ${aircraftHex} REJECTED - above max altitude (${aircraftAltitude}ft > ${maxAltitude}ft)`;
  }

  return null;
}