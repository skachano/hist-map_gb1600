import { describe, expect, it } from "vitest";
import { clampYear, YEAR_MAX, YEAR_MIN } from "./config";

describe("clampYear", () => {
  it("keeps years inside 1600–1632", () => {
    expect(clampYear(1615)).toBe(1615);
    expect(clampYear(1550)).toBe(YEAR_MIN);
    expect(clampYear(1700)).toBe(YEAR_MAX);
    expect(clampYear(1612.6)).toBe(1613);
  });
});
