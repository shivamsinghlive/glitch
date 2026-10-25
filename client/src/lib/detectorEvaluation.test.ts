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

import { evaluateSensorRobustness } from "./detectorEvaluation";
describe("sensor bias stress test", () => {
  it("a constant offset changes nothing; extra noise lowers precision", () => {
    const r = evaluateSensorRobustness();
    const ref = r[0], hi = r[1], lo = r[2], noisy = r[r.length - 1];
    expect(hi.precision).toBe(ref.precision);
    expect(lo.recall).toBe(ref.recall);
    expect(noisy.precision).toBeLessThan(ref.precision);
    expect(noisy.falseAlarmRate).toBeGreaterThan(ref.falseAlarmRate);
  });
});

import { analyzeNightSweats, analyzeOvulation, evaluateTriggers } from "./detectorEvaluation";
import { evaluatePlanner, evaluateRetrieval } from "./ragEvaluation";

describe("scorecards and error analysis", () => {
  it("night-sweat confusion matrix is consistent and explains its errors", () => {
    const r = analyzeNightSweats(30, 100, 11);
    const c = r.combined;
    expect(c.tp + c.fp + c.fn + c.tn).toBe(r.nights);
    expect(r.misses.n).toBe(c.fn);
    expect(r.falseAlarms.n).toBe(c.fp);
    expect(r.misses.tempRiseTooSmall + r.misses.sleepNotDisruptedEnough).toBeCloseTo(1, 2);
    expect(c.mcc).toBeGreaterThan(r.alwaysNo.mcc);          // beats the dumb baseline
    expect(c.falseAlarmRate).toBeLessThan(r.disruptionOnly.falseAlarmRate);
  });

  it("ovulation misses fall as the temperature rise grows", () => {
    const r = analyzeOvulation(600, 5);
    const d = r.detection;
    expect(d.tp + d.fp + d.fn + d.tn).toBe(r.cycles);
    expect(r.missByRise[0].missRate).toBeGreaterThan(r.missByRise[2].missRate);
    expect(d.mcc).toBeGreaterThan(r.alwaysDetect.mcc);
  });

  it("the corrected trigger finder cries wolf less and still finds strong triggers", () => {
    const t = evaluateTriggers(150, 60, 3);
    expect(t.falseTriggerRate.corrected).toBeLessThan(t.falseTriggerRate.naive);
    expect(t.falseTriggerRate.corrected).toBeLessThan(0.2);
    expect(t.power[2].corrected).toBeGreaterThan(0.9);
    expect(t.power[2].corrected).toBeGreaterThan(t.power[0].corrected);
  });

  it("retrieval beats random, abstains on small talk; the planner never breaks the user's choices", () => {
    const r = evaluateRetrieval();
    expect(r.hitAt3).toBeGreaterThan(r.randomBaseline.hitAt3 * 2);
    expect(r.offTopic.correctlyEmpty).toBe(r.offTopic.messages);
    const p = evaluatePlanner(400, 21);
    expect(p.equipmentViolations).toBe(0);
    expect(p.emptyDays).toBe(0);
    expect(p.boneStrengthRule.satisfied).toBe(p.boneStrengthRule.plans);
    expect(p.citedShare).toBe(1);
  });
});
