import { describe, it, expect } from "vitest";
import { matchesTypeFilter, AircraftTypeInfo } from "../aircraftTypeFilter";

describe("matchesTypeFilter", () => {
  describe("no filters", () => {
    it("returns true when no filters specified", () => {
      const aircraft: AircraftTypeInfo = { type: "B738" };
      expect(matchesTypeFilter(aircraft)).toBe(true);
    });

    it("returns true with empty arrays", () => {
      const aircraft: AircraftTypeInfo = { type: "B738" };
      expect(matchesTypeFilter(aircraft, [], [])).toBe(true);
    });
  });

  describe("helicopter filtering", () => {
    it("matches helicopter by category A7", () => {
      const aircraft: AircraftTypeInfo = { category: "A7" };
      expect(matchesTypeFilter(aircraft, ["helicopter"])).toBe(true);
    });

    it("matches helicopter by class starting with H", () => {
      const aircraft: AircraftTypeInfo = { class: "H1T" };
      expect(matchesTypeFilter(aircraft, ["H"])).toBe(true);
    });

    it("matches helicopter by type starting with H", () => {
      const aircraft: AircraftTypeInfo = { type: "H60" };
      expect(matchesTypeFilter(aircraft, ["helicopter"])).toBe(true);
    });

    it("rejects non-helicopter when filtering for helicopters", () => {
      const aircraft: AircraftTypeInfo = { type: "B738", category: "A3" };
      expect(matchesTypeFilter(aircraft, ["helicopter"])).toBe(false);
    });
  });

  describe("type code filtering", () => {
    it("matches exact type code", () => {
      const aircraft: AircraftTypeInfo = { type: "B738" };
      expect(matchesTypeFilter(aircraft, ["B738"])).toBe(true);
    });

    it("matches type code prefix", () => {
      const aircraft: AircraftTypeInfo = { type: "B738" };
      expect(matchesTypeFilter(aircraft, ["B7"])).toBe(true);
    });

    it("rejects non-matching type code", () => {
      const aircraft: AircraftTypeInfo = { type: "A320" };
      expect(matchesTypeFilter(aircraft, ["B7"])).toBe(false);
    });
  });

  describe("manufacturer filtering", () => {
    it("matches manufacturer case-insensitively", () => {
      const aircraft: AircraftTypeInfo = { manufacturer: "Boeing" };
      expect(matchesTypeFilter(aircraft, ["boeing"])).toBe(true);
    });

    it("matches partial manufacturer name", () => {
      const aircraft: AircraftTypeInfo = { manufacturer: "Airbus Industrie" };
      expect(matchesTypeFilter(aircraft, ["airbus"])).toBe(true);
    });
  });

  describe("exclude filtering", () => {
    it("excludes matching type", () => {
      const aircraft: AircraftTypeInfo = { type: "C17" };
      expect(matchesTypeFilter(aircraft, undefined, ["C17"])).toBe(false);
    });

    it("allows non-matching type", () => {
      const aircraft: AircraftTypeInfo = { type: "B738" };
      expect(matchesTypeFilter(aircraft, undefined, ["C17"])).toBe(true);
    });

    it("excludes helicopter when specified", () => {
      const aircraft: AircraftTypeInfo = { type: "H60", category: "A7" };
      expect(matchesTypeFilter(aircraft, undefined, ["helicopter"])).toBe(false);
    });
  });

  describe("combined include and exclude", () => {
    it("requires match in include AND not in exclude", () => {
      const aircraft: AircraftTypeInfo = { type: "B738", manufacturer: "Boeing" };
      // Include Boeing, exclude B738 - should fail exclude
      expect(matchesTypeFilter(aircraft, ["Boeing"], ["B738"])).toBe(false);
    });

    it("passes when matching include and not matching exclude", () => {
      const aircraft: AircraftTypeInfo = { type: "B737", manufacturer: "Boeing" };
      // Include Boeing, exclude B738 - should pass
      expect(matchesTypeFilter(aircraft, ["Boeing"], ["B738"])).toBe(true);
    });
  });

  describe("fixedwing filter", () => {
    it("matches non-helicopter as fixedwing", () => {
      const aircraft: AircraftTypeInfo = { type: "B738", category: "A3" };
      expect(matchesTypeFilter(aircraft, ["fixedwing"])).toBe(true);
    });

    it("rejects helicopter when filtering for fixedwing", () => {
      const aircraft: AircraftTypeInfo = { type: "H60", category: "A7" };
      expect(matchesTypeFilter(aircraft, ["fixedwing"])).toBe(false);
    });
  });
});
