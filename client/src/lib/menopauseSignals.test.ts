import { describe, expect, it } from "vitest";
import type { DailyPhysiology } from "./whoop/types";
import { sleepFragmentation, bpCategory, ethnicityContext, mentalHealthCheck, menopauseAlerts } from "./menopauseSignals";

const night = (i: number, o: Partial<DailyPhysiology> = {}): DailyPhysiology => ({
  date: new Date(Date.UTC(2026, 9, 1) + i * 86_400_000).toISOString().slice(0, 10),
  recovery: 60, restingHr: 60, hrv: 45, skinTemp: 33.5, spo2: null, respRate: null, sleepPerformance: 85, sleepHours: 7, strain: 8, kilojoule: null,
  disturbances: 8, sleepEfficiency: 90, awakeMinutes: 25, ...o,
});

describe("sleep fragmentation", () => {
  it("scores a broken night higher than a normal one", () => {
    const days = [...Array.from({ length: 20 }, (_, i) => night(i)), night(20, { disturbances: 20, awakeMinutes: 80, sleepEfficiency: 74 })];
    const f = sleepFragmentation(days);
    expect(f[20].score!).toBeGreaterThan(70);
    expect(f[10].score!).toBeLessThan(45);
  });
});

describe("blood pressure (AHA/ACC 2025 categories)", () => {
  it("categorises readings", () => {
    expect(bpCategory(115, 75)).toBe("normal");
    expect(bpCategory(125, 78)).toBe("elevated");
    expect(bpCategory(132, 84)).toBe("stage1");
    expect(bpCategory(145, 92)).toBe("stage2");
    expect(bpCategory(185, 100)).toBe("crisis");
  });
});

describe("ethnicity context (SWAN)", () => {
  it("gives group medians as context", () => {
    expect(ethnicityContext("black")).toMatch(/10\.1 years/);
    expect(ethnicityContext("japanese")).toMatch(/4\.8 years/);
    expect(ethnicityContext("south_asian")).toMatch(/don't have duration data/);
    expect(ethnicityContext(undefined)).toBeNull();
  });
});

describe("mental health check + alerts", () => {
  const now = new Date("2026-10-24T12:00:00Z");
  const days = Array.from({ length: 35 }, (_, i) => night(i - 11, { hrv: i >= 28 ? 34 : 46, sleepPerformance: i >= 28 ? 64 : 85 }));
  const moods = [1, 2, 2].map((m, i) => ({ at: new Date(now.getTime() - i * 86_400_000).toISOString(), mood: m }));
  const bp = [{ at: "2026-10-22T08:00:00Z", systolic: 136, diastolic: 86 }, { at: "2026-10-23T08:00:00Z", systolic: 138, diastolic: 88 }];

  it("asks the user to reach out when HRV, mood, sleep and BP all slip", () => {
    const m = mentalHealthCheck(days, moods, bp, now);
    expect(m.level).toBe("reach_out");
    expect(m.hrvChangePct!).toBeLessThan(-12);
  });

  it("raises BP, mental-health and early-menopause alerts, urgent first", () => {
    const mind = mentalHealthCheck(days, moods, bp, now);
    const alerts = menopauseAlerts({ stage: { stage: "early_postmenopause", label: "", explanation: "", timing: "early" }, warm: [], frag: [], flashes: [], bp, mind, now });
    expect(alerts[0].level).toBe("urgent");
    expect(alerts.map((a) => a.icon)).toEqual(expect.arrayContaining(["🩺", "📋", "💙"]));
  });

  it("flags a hypertensive crisis as urgent with 911 guidance", () => {
    const a = menopauseAlerts({ stage: { stage: "unknown", label: "", explanation: "" }, warm: [], frag: [], flashes: [], bp: [{ at: "x", systolic: 190, diastolic: 110 }], mind: { level: "ok", hrvChangePct: null, avgMood7: null, reasons: [] }, now });
    expect(a[0].detail).toMatch(/911/);
  });
});
