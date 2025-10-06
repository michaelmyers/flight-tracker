import { describe, it, expect } from "vitest";
import { checkAltitudeRequirements, getAltitudeDebugMessage } from "../altitudeFilter";

describe("checkAltitudeRequirements", () => {
  describe("when aircraft has no altitude data", () => {
    it("should allow aircraft with undefined altitude", () => {
      expect(checkAltitudeRequirements(undefined, 0, 5000)).toBe(true);
      expect(checkAltitudeRequirements(undefined, 1000, 3000)).toBe(true);
      expect(checkAltitudeRequirements(undefined, null, null)).toBe(true);
    });
  });

  describe("when zone has no altitude limits", () => {
    it("should allow any aircraft altitude", () => {
      expect(checkAltitudeRequirements(0, null, null)).toBe(true);
      expect(checkAltitudeRequirements(1000, null, null)).toBe(true);
      expect(checkAltitudeRequirements(50000, null, null)).toBe(true);
    });
  });

  describe("when zone has only maximum altitude", () => {
    const maxAltitude = 2500;

    it("should allow aircraft below max altitude", () => {
      expect(checkAltitudeRequirements(0, null, maxAltitude)).toBe(true);
      expect(checkAltitudeRequirements(1000, null, maxAltitude)).toBe(true);
      expect(checkAltitudeRequirements(2499, null, maxAltitude)).toBe(true);
    });

    it("should allow aircraft at exactly max altitude", () => {
      expect(checkAltitudeRequirements(2500, null, maxAltitude)).toBe(true);
    });

    it("should reject aircraft above max altitude", () => {
      expect(checkAltitudeRequirements(2501, null, maxAltitude)).toBe(false);
      expect(checkAltitudeRequirements(3000, null, maxAltitude)).toBe(false);
      expect(checkAltitudeRequirements(50000, null, maxAltitude)).toBe(false);
    });
  });

  describe("when zone has only minimum altitude", () => {
    const minAltitude = 1000;

    it("should reject aircraft below min altitude", () => {
      expect(checkAltitudeRequirements(0, minAltitude, null)).toBe(false);
      expect(checkAltitudeRequirements(500, minAltitude, null)).toBe(false);
      expect(checkAltitudeRequirements(999, minAltitude, null)).toBe(false);
    });

    it("should allow aircraft at exactly min altitude", () => {
      expect(checkAltitudeRequirements(1000, minAltitude, null)).toBe(true);
    });

    it("should allow aircraft above min altitude", () => {
      expect(checkAltitudeRequirements(1001, minAltitude, null)).toBe(true);
      expect(checkAltitudeRequirements(5000, minAltitude, null)).toBe(true);
      expect(checkAltitudeRequirements(50000, minAltitude, null)).toBe(true);
    });
  });

  describe("when zone has both min and max altitude", () => {
    const minAltitude = 1000;
    const maxAltitude = 5000;

    it("should reject aircraft below min altitude", () => {
      expect(checkAltitudeRequirements(0, minAltitude, maxAltitude)).toBe(false);
      expect(checkAltitudeRequirements(999, minAltitude, maxAltitude)).toBe(false);
    });

    it("should allow aircraft within altitude range", () => {
      expect(checkAltitudeRequirements(1000, minAltitude, maxAltitude)).toBe(true);
      expect(checkAltitudeRequirements(3000, minAltitude, maxAltitude)).toBe(true);
      expect(checkAltitudeRequirements(5000, minAltitude, maxAltitude)).toBe(true);
    });

    it("should reject aircraft above max altitude", () => {
      expect(checkAltitudeRequirements(5001, minAltitude, maxAltitude)).toBe(false);
      expect(checkAltitudeRequirements(10000, minAltitude, maxAltitude)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle zero altitude correctly", () => {
      expect(checkAltitudeRequirements(0, null, 1000)).toBe(true);
      expect(checkAltitudeRequirements(0, 1, 1000)).toBe(false);
      expect(checkAltitudeRequirements(0, 0, 1000)).toBe(true);
    });

    it("should handle negative altitudes (below sea level)", () => {
      expect(checkAltitudeRequirements(-100, -200, 1000)).toBe(true);
      expect(checkAltitudeRequirements(-100, 0, 1000)).toBe(false);
    });
  });
});

describe("getAltitudeDebugMessage", () => {
  const aircraftHex = "abc123";
  const zoneId = 4;

  it("should return message for undefined altitude", () => {
    const msg = getAltitudeDebugMessage(aircraftHex, undefined, 0, 5000, zoneId);
    expect(msg).toBe(`[ZONE 4 DEBUG] Aircraft abc123 has no altitude data`);
  });

  it("should return rejection message when below min altitude", () => {
    const msg = getAltitudeDebugMessage(aircraftHex, 500, 1000, 5000, zoneId);
    expect(msg).toBe(`[ZONE 4 DEBUG] Aircraft abc123 REJECTED - below min altitude (500ft < 1000ft)`);
  });

  it("should return rejection message when above max altitude", () => {
    const msg = getAltitudeDebugMessage(aircraftHex, 6000, 1000, 5000, zoneId);
    expect(msg).toBe(`[ZONE 4 DEBUG] Aircraft abc123 REJECTED - above max altitude (6000ft > 5000ft)`);
  });

  it("should return null when altitude is within limits", () => {
    expect(getAltitudeDebugMessage(aircraftHex, 3000, 1000, 5000, zoneId)).toBeNull();
    expect(getAltitudeDebugMessage(aircraftHex, 1000, 1000, 5000, zoneId)).toBeNull();
    expect(getAltitudeDebugMessage(aircraftHex, 5000, 1000, 5000, zoneId)).toBeNull();
  });

  it("should handle null min/max correctly", () => {
    expect(getAltitudeDebugMessage(aircraftHex, 3000, null, null, zoneId)).toBeNull();
    expect(getAltitudeDebugMessage(aircraftHex, 3000, null, 2000, zoneId))
      .toBe(`[ZONE 4 DEBUG] Aircraft abc123 REJECTED - above max altitude (3000ft > 2000ft)`);
    expect(getAltitudeDebugMessage(aircraftHex, 500, 1000, null, zoneId))
      .toBe(`[ZONE 4 DEBUG] Aircraft abc123 REJECTED - below min altitude (500ft < 1000ft)`);
  });
});