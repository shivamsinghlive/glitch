import { describe, it, expect } from "vitest";
import { evaluateNightSweats, evaluateOvulation, simulateCycle } from "./detectorEvaluation";

describe("detector evaluation on simulated ground truth", () => {
  it("is deterministic for a seed", () => {
    expect(evaluateNightSweats(10, 60, 3)).toEqual(evaluateNightSweats(10, 60, 3));
    expect(simulateCycle(9).ovulationDay).toBe(simulateCycle(9).ovulationDay);
  });

  it("night-sweat detector beats chance and keeps false alarms low", () => {
    const r = evaluateNightSweats(40, 120, 11);
    expect(r.operating.precision).toBeGreaterThan(r.prevalence * 2);
    expect(r.operating.falseAlarmRate).toBeLessThan(r.disruptionOnly.falseAlarmRate);
  });

  it("lowering the temperature threshold raises recall", () => {
    const r = evaluateNightSweats(40, 120, 11);
    const lo = r.sweep.find((s) => s.threshold === 0.2)!, hi = r.sweep.find((s) => s.threshold === 0.5)!;
    expect(lo.recall).toBeGreaterThan(hi.recall);
  });

  it("ovulation detector finds most ovulations and rejects most anovulatory cycles", () => {
    const r = evaluateOvulation(300, 5);
    expect(r.sensitivity).toBeGreaterThan(0.75);
    expect(r.specificity).toBeGreaterThan(0.8);
    expect(r.within2Days).toBeGreaterThan(0.8);
  });
});
