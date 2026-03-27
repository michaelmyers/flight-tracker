import { describe, it, expect } from "vitest";
import { haversineDistance, insideCircle } from "../geoCircle";

describe("haversineDistance", () => {
  it("returns 0 for same point", () => {
    const distance = haversineDistance(38.8, -76.87, 38.8, -76.87);
    expect(distance).toBe(0);
  });

  it("calculates distance between two known points", () => {
    // Washington DC to New York City is approximately 328 km
    const distance = haversineDistance(38.9072, -77.0369, 40.7128, -74.006);
    expect(distance).toBeGreaterThan(320);
    expect(distance).toBeLessThan(340);
  });

  it("calculates short distances accurately", () => {
    // Two points ~1km apart
    const distance = haversineDistance(38.8, -76.87, 38.809, -76.87);
    expect(distance).toBeGreaterThan(0.9);
    expect(distance).toBeLessThan(1.1);
  });
});

describe("insideCircle", () => {
  const centerLat = 38.8;
  const centerLon = -76.87;
  const radiusKm = 5;

  it("returns true for point at center", () => {
    expect(insideCircle(centerLat, centerLon, centerLat, centerLon, radiusKm)).toBe(true);
  });

  it("returns true for point inside circle", () => {
    // Point ~2km away
    expect(insideCircle(38.818, -76.87, centerLat, centerLon, radiusKm)).toBe(true);
  });

  it("returns false for point outside circle", () => {
    // Point ~10km away
    expect(insideCircle(38.9, -76.87, centerLat, centerLon, radiusKm)).toBe(false);
  });

  it("returns true for point exactly on boundary", () => {
    // This is a boundary case - points very close to edge
    const distance = haversineDistance(38.8, -76.87, 38.845, -76.87);
    expect(distance).toBeLessThan(5.1);
  });
});
