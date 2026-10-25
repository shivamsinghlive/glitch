import { describe, it, expect } from "vitest";
import { percentileOf, populationContext, bandFor } from "./populationContext";

describe("populationContext (NHANES)", () => {
  it("interpolates percentiles and clamps", () => {
    const t = { "5": 100, "50": 120, "95": 160 };
    expect(percentileOf(120, t)).toBe(50);
    expect(percentileOf(90, t)).toBe(5);
    expect(percentileOf(200, t)).toBe(95);
    expect(percentileOf(110, t)).toBeGreaterThan(5);
    expect(percentileOf(110, t)).toBeLessThan(50);
  });
  it("picks the right age band and orders BP percentiles", () => {
    expect(bandFor(52)!.ageMin).toBe(45);
    const lo = populationContext({ age: 52, systolic: 105 })!, hi = populationContext({ age: 52, systolic: 150 })!;
    expect(hi.systolicPercentile!).toBeGreaterThan(lo.systolicPercentile!);
  });
});
