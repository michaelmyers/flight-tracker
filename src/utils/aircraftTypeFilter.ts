export interface AircraftTypeInfo {
  type?: string;         // ICAO type designator from ADS-B (e.g., "B738", "H60")
  typecode?: string;     // Type code from OpenSky enrichment
  category?: string;     // ADS-B emitter category (e.g., "A1"-"A7", "B1"-"B7", etc.)
  class?: string;        // ICAO aircraft class from OpenSky (e.g., "L2J", "H1T")
  manufacturer?: string; // Aircraft manufacturer
}

const HELICOPTER_INDICATORS = ["helicopter", "h", "heli", "rotorcraft"];

/**
 * Check if a filter value matches helicopter aircraft
 */
function isHelicopterFilter(filter: string): boolean {
  return HELICOPTER_INDICATORS.includes(filter.toLowerCase());
}

/**
 * Check if aircraft is a helicopter based on available data
 */
function isHelicopter(aircraft: AircraftTypeInfo): boolean {
  // ADS-B category A7 is rotorcraft
  if (aircraft.category === "A7") return true;

  // ICAO class starting with H indicates helicopter
  if (aircraft.class?.toUpperCase().startsWith("H")) return true;

  // Type code starting with H often indicates helicopter
  const typeCode = aircraft.type || aircraft.typecode;
  if (typeCode?.toUpperCase().startsWith("H")) return true;

  return false;
}

/**
 * Check if aircraft matches a single filter criteria
 */
function matchesSingleFilter(aircraft: AircraftTypeInfo, filter: string): boolean {
  const filterLower = filter.toLowerCase();
  const filterUpper = filter.toUpperCase();

  // Special handling for helicopter filter
  if (isHelicopterFilter(filter)) {
    return isHelicopter(aircraft);
  }

  // Special handling for fixed-wing filter
  if (filterLower === "fixedwing" || filterLower === "fixed-wing") {
    return !isHelicopter(aircraft);
  }

  // Match against type/typecode (exact or prefix)
  const typeCode = aircraft.type || aircraft.typecode;
  if (typeCode) {
    const typeUpper = typeCode.toUpperCase();
    if (typeUpper === filterUpper || typeUpper.startsWith(filterUpper)) {
      return true;
    }
  }

  // Match against ICAO class
  if (aircraft.class) {
    const classUpper = aircraft.class.toUpperCase();
    if (classUpper === filterUpper || classUpper.startsWith(filterUpper)) {
      return true;
    }
  }

  // Match against manufacturer (case-insensitive partial match)
  if (aircraft.manufacturer) {
    if (aircraft.manufacturer.toLowerCase().includes(filterLower)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if aircraft matches the filter criteria
 *
 * @param aircraft - Aircraft type information
 * @param includeTypes - If provided, aircraft must match at least one
 * @param excludeTypes - If provided, aircraft must not match any
 * @returns true if aircraft passes the filter
 */
export function matchesTypeFilter(
  aircraft: AircraftTypeInfo,
  includeTypes?: string[],
  excludeTypes?: string[]
): boolean {
  // Check exclude list first - if aircraft matches any exclude, reject it
  if (excludeTypes && excludeTypes.length > 0) {
    for (const exclude of excludeTypes) {
      if (matchesSingleFilter(aircraft, exclude)) {
        return false;
      }
    }
  }

  // Check include list - if provided, aircraft must match at least one
  if (includeTypes && includeTypes.length > 0) {
    for (const include of includeTypes) {
      if (matchesSingleFilter(aircraft, include)) {
        return true;
      }
    }
    return false; // Didn't match any include filter
  }

  // No include filter, and didn't match any exclude filter
  return true;
}
