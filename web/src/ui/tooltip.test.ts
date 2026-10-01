import { describe, expect, it } from "vitest";
import { tooltipPosition } from "./tooltip";

const area = { width: 1000, height: 700 };
const tip = { width: 200, height: 80 };

describe("tooltipPosition", () => {
  it("goes below-right of the cursor when there is room", () => {
    expect(tooltipPosition({ x: 100, y: 100 }, tip, area)).toEqual({ x: 114, y: 114 });
  });
  it("flips to the left near the right edge and above near the bottom edge", () => {
    expect(tooltipPosition({ x: 950, y: 680 }, tip, area)).toEqual({ x: 950 - 14 - 200, y: 680 - 14 - 80 });
  });
  it("always stays inside the area", () => {
    for (const cursor of [{ x: 0, y: 0 }, { x: 999, y: 699 }, { x: 150, y: 690 }, { x: 990, y: 40 }]) {
      const { x, y } = tooltipPosition(cursor, tip, area);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + tip.width).toBeLessThanOrEqual(area.width);
      expect(y + tip.height).toBeLessThanOrEqual(area.height);
    }
  });
  it("keeps to the area's top-left when the tooltip is larger than the room on either side", () => {
    expect(tooltipPosition({ x: 100, y: 50 }, { width: 950, height: 80 }, area).x).toBe(4);
  });
});
