import { describe, expect, it } from "vitest";
import { getCyclePhase } from "@/contexts/AppContext";
import { analyzePhasePatterns, generateDemoCheckIns } from "./phasePatterns";
import { betaCdf, betaQuantile, combinePatterns, normalNormal, priorMean, shortSleepEstimate, shrinkPhaseEffects, stageShortSleepPrior } from "./personalEstimate";

const phaseOf = (d: number) => getCyclePhase(d, 28);
const TODAY = new Date(2026, 9, 25);

describe("normalNormal", () => {
  it("leans on the prior with little data and on the data with lots", () => {
    const few = normalNormal(-1, 1.0, 0, 0.5);   // noisy: SE² = 1
    const many = normalNormal(-1, 0.01, 0, 0.5); // precise: SE² = 0.01
    expect(few.weight).toBeCloseTo(0.2, 5);       // (1/1)/(1/1 + 4)
    expect(few.mean).toBeCloseTo(-0.2, 5);
    expect(many.weight).toBeGreaterThan(0.95);
    expect(many.mean).toBeLessThan(-0.95);
  });
  it("posterior SD is smaller than both the prior SD and the data SE", () => {
    const p = normalNormal(0.4, 0.09, 0, 0.5);
    expect(p.sd).toBeLessThan(0.3);
    expect(p.sd).toBeLessThan(0.5);
  });
});

describe("shrinkPhaseEffects", () => {
  const log = generateDemoCheckIns({ lastPeriodDate: "2026-10-12", cycleLength: 28, today: TODAY, phaseOf });
  it("recovers the planted luteal energy dip, pulled slightly toward 0", () => {
    const e = shrinkPhaseEffects(log, phaseOf).find((s) => s.metric === "energy" && s.phase === "luteal")!;
    expect(e.credible).toBe(true);
    expect(e.mean).toBeLessThan(0);
    expect(Math.abs(e.mean)).toBeLessThan(Math.abs(e.raw)); // shrinkage
    expect(e.weight).toBeGreaterThan(0.7);
  });
  it("with only a week of data, estimates stay close to the prior", () => {
    const week = log.slice(-7);
    const s = shrinkPhaseEffects(week, phaseOf);
    s.forEach((x) => expect(x.weight).toBeLessThan(0.75));
  });
  it("uses a small positive prior only for luteal cravings", () => {
    expect(priorMean("cravings", "luteal")).toBe(0.3);
    expect(priorMean("energy", "luteal")).toBe(0);
  });
  it("reports sensitivity to τ, with a wider prior moving further toward the raw data", () => {
    const e = shrinkPhaseEffects(log, phaseOf).find((s) => s.metric === "mood" && s.phase === "luteal")!;
    const [t03, t10] = e.sensitivity;
    expect(Math.abs(t10 - e.raw)).toBeLessThan(Math.abs(t03 - e.raw));
  });
});

describe("Beta–Binomial short sleep", () => {
  it("beta quantiles invert the CDF", () => {
    const q = betaQuantile(0.9, 3, 7);
    expect(betaCdf(q, 3, 7)).toBeCloseTo(0.9, 4);
    expect(betaQuantile(0.5, 5, 5)).toBeCloseTo(0.5, 4);
  });
  it("starts at the population rate and moves toward her nights", () => {
    expect(shortSleepEstimate(0.34, []).mean).toBeCloseTo(0.34, 6);
    const e = shortSleepEstimate(0.24, Array(30).fill(6)); // 30 short nights
    expect(e.mean).toBeGreaterThan(0.75);
    expect(e.weight).toBeCloseTo(0.75, 6);
    expect(e.lo).toBeLessThan(e.mean);
    expect(e.hi).toBeGreaterThan(e.mean);
  });
});

describe("combinePatterns", () => {
  it("keeps only findings both checks agree on, and attaches the posterior", () => {
    const log = generateDemoCheckIns({ lastPeriodDate: "2026-10-12", cycleLength: 28, today: TODAY, phaseOf });
    const r = combinePatterns(analyzePhasePatterns(log, phaseOf), shrinkPhaseEffects(log, phaseOf));
    expect(r.significant.length).toBeGreaterThan(0);
    r.significant.forEach((f) => { expect(f.posterior?.credible).toBe(true); expect(f.qValue).toBeLessThan(0.1); });
  });
  it("reads NHANES short-sleep prevalence by stage", () => {
    expect(stageShortSleepPrior("breastfeeding")).toBeGreaterThan(stageShortSleepPrior("pregnant"));
  });
});
