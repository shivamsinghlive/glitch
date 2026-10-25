import { describe, expect, it } from "vitest";
import { classMetrics, tally } from "./metrics";

describe("classMetrics", () => {
  it("matches hand-computed scores", () => {
    const m = classMetrics({ tp: 40, fp: 10, fn: 20, tn: 130 }); // 200 cases
    expect(m.accuracy).toBe(0.85);
    expect(m.precision).toBe(0.8);
    expect(m.recall).toBe(0.667);
    expect(m.specificity).toBe(0.929);
    expect(m.f1).toBe(0.727);
    expect(m.mcc).toBeCloseTo((40 * 130 - 10 * 20) / Math.sqrt(50 * 60 * 140 * 150), 3);
  });
  it("shows why accuracy misleads: always saying no scores well but has zero recall and MCC", () => {
    const m = classMetrics({ tp: 0, fp: 0, fn: 25, tn: 75 });
    expect(m.accuracy).toBe(0.75);
    expect(m.recall).toBe(0);
    expect(m.f1).toBe(0);
    expect(m.mcc).toBe(0);
  });
  it("tallies predictions", () => {
    expect(tally([{ predicted: true, actual: true }, { predicted: true, actual: false }, { predicted: false, actual: true }, { predicted: false, actual: false }])).toEqual({ tp: 1, fp: 1, fn: 1, tn: 1 });
  });
});
