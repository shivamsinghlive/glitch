import { describe, expect, it } from "vitest";
import { getCyclePhase, type CycleSymptomEntry } from "@/contexts/AppContext";
import { adviceForToday, analyzePhasePatterns, daysSinceLastLog, generateDemoCheckIns } from "./phasePatterns";

const phaseOf = (d: number) => getCyclePhase(d, 28);
const TODAY = new Date(2026, 9, 25);

function flatLog(days: number): CycleSymptomEntry[] {
  // No phase effect at all: values cycle 2,3,4 independent of cycle day
  return Array.from({ length: days }, (_, i) => {
    const v = 2 + (i % 3);
    return { date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`, cycleDay: (i % 28) + 1, mood: v, energy: 5 - v + 1, stress: v, bloating: v, cramps: v, cravings: v, sleepQuality: v, workout: v, notes: "" };
  });
}

describe("analyzePhasePatterns", () => {
  it("finds the planted luteal pattern in demo data", () => {
    const log = generateDemoCheckIns({ lastPeriodDate: "2026-10-12", cycleLength: 28, today: TODAY, phaseOf });
    const r = analyzePhasePatterns(log, phaseOf);
    const lutealEnergy = r.significant.find((f) => f.phase === "luteal" && f.metric === "energy");
    expect(lutealEnergy).toBeDefined();
    expect(lutealEnergy!.diff).toBeLessThan(0);
    expect(lutealEnergy!.harder).toBe(true);
    expect(r.significant.some((f) => f.phase === "menstrual" && f.metric === "cramps" && f.diff > 0)).toBe(true);
  });

  it("flags nothing when there is no phase effect", () => {
    const r = analyzePhasePatterns(flatLog(84), phaseOf);
    expect(r.tested.length).toBeGreaterThan(0);
    expect(r.significant).toHaveLength(0);
  });

  it("does not test phases with too few days", () => {
    const r = analyzePhasePatterns(flatLog(6), phaseOf);
    expect(r.tested).toHaveLength(0);
    expect(r.needMore.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const log = generateDemoCheckIns({ lastPeriodDate: "2026-10-12", cycleLength: 28, today: TODAY, phaseOf });
    expect(analyzePhasePatterns(log, phaseOf).tested.map((t) => t.pValue)).toEqual(analyzePhasePatterns(log, phaseOf).tested.map((t) => t.pValue));
  });
});

describe("adviceForToday", () => {
  it("suggests lighter training only when her own luteal data shows it", () => {
    const log = generateDemoCheckIns({ lastPeriodDate: "2026-10-12", cycleLength: 28, today: TODAY, phaseOf });
    const r = analyzePhasePatterns(log, phaseOf);
    expect(adviceForToday("luteal", r).map((a) => a.title)).toContain("Train, just lighter");
    const flat = analyzePhasePatterns(flatLog(84), phaseOf);
    expect(adviceForToday("luteal", flat)[0].title).toBe("Train as planned");
  });
});

describe("daysSinceLastLog", () => {
  it("counts whole days and handles an empty log", () => {
    expect(daysSinceLastLog([{ date: "2026-10-19" }, { date: "2026-10-12" }], TODAY)).toBe(6);
    expect(daysSinceLastLog([], TODAY)).toBe(Infinity);
  });
});
