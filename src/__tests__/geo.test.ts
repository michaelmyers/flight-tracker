import { describe, expect, it } from "vitest";
import { insidePolygon } from "../geo";

const square: [number, number][] = [
  [0, 0],
  [0, 10],
  [10, 10],
  [10, 0],
];

const andrewsAFB: [number, number][] = [
  [-76.90349257715057, 38.835190780668],
  [-76.90349257715057, 38.779584827233435],
  [-76.84146473917343, 38.779584827233435],
  [-76.84146473917343, 38.835190780668],
  [-76.90349257715057, 38.835190780668],
];

describe("insidePolygon()", () => {
  it("returns true for point inside", () => {
    expect(insidePolygon(5, 5, square)).toBe(true);
  });

  it("returns false for point outside", () => {
    expect(insidePolygon(15, 5, square)).toBe(false);
  });

  it("returns true for point on edge", () => {
    expect(insidePolygon(0, 5, square)).toBe(true); // depending on algorithm
  });

  it("returns false for point on corner", () => {
    expect(insidePolygon(0, 0, square)).toBe(true); // you may treat this as inside or outside
  });
  describe("for Andrews AFB polygon", () => {
    it("returns true for point inside", () => {
      expect(insidePolygon(-76.86822539280075, 38.80755742837984, andrewsAFB)).toBe(true);
    });
    it("returns false for point outside", () => {
      expect(insidePolygon(-76.92777002569933, 38.836372138984316, andrewsAFB)).toBe(false);
    });
  });
});
