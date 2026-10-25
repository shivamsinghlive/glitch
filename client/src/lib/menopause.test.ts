import { describe, expect, it } from "vitest";
import type { DailyPhysiology } from "./whoop/types";
import { stageMenopause, scoreMrs, warmNights, hotFlashTriggers, menopauseTraining, clinicianPoints } from "./menopause";

describe("STRAW+10 staging", () => {
  it("detects early transition from ≥7-day cycle-length swings", () => {
    const r = stageMenopause({ periodStarts: ["2026-06-01", "2026-06-27", "2026-08-05", "2026-08-29", "2026-10-10"], age: 46, today: "2026-10-24" });
    expect(r.stage).toBe("early_transition");
  });
  it("detects late transition after 60+ days without a period", () => {
    expect(stageMenopause({ periodStarts: ["2026-07-01"], age: 50, today: "2026-10-24" }).stage).toBe("late_transition");
  });
  it("flags premature menopause when the final period was before 40", () => {
    const r = stageMenopause({ periodStarts: ["2024-03-01"], age: 40, today: "2026-10-24" });
    expect(r.stage).toBe("early_postmenopause");
    expect(r.timing).toBe("premature");
    expect(clinicianPoints(r, null, 0)[0]).toMatch(/POI/);
  });
  it("flags early menopause (40–45)", () => {
    expect(stageMenopause({ periodStarts: ["2023-01-01"], age: 46, today: "2026-10-24" }).timing).toBe("early");
  });
  it("calls consistent cycles reproductive", () => {
    expect(stageMenopause({ periodStarts: ["2026-07-01", "2026-07-29", "2026-08-26", "2026-09-23"], age: 35, today: "2026-10-01" }).stage).toBe("reproductive");
  });
});

describe("Menopause Rating Scale", () => {
  it("scores subscales and severity bands", () => {
    const r = scoreMrs({ hot_flushes: 3, sleep: 3, heart: 1, joints: 2, depressive: 1, irritability: 2, anxiety: 1, exhaustion: 2, sexual: 1, bladder: 0, dryness: 1 }, "2026-10-24");
    expect(r.somatic).toBe(9);
    expect(r.psychological).toBe(6);
    expect(r.urogenital).toBe(2);
    expect(r.total).toBe(17);
    expect(r.severity).toBe("severe");
    expect(r.top[0]).toMatch(/Hot flushes|Sleep/);
  });
});

function nights(n: number, warmIdx: number[]): DailyPhysiology[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`, recovery: 60, restingHr: 60, hrv: 45, spo2: null, respRate: null, strain: 8, kilojoule: null, sleepHours: 7,
    skinTemp: 33.5 + (i % 3) * 0.03 + (warmIdx.includes(i) ? 0.6 : 0),
    sleepPerformance: warmIdx.includes(i) ? 60 : 85, disturbances: warmIdx.includes(i) ? 18 : 8, sleepEfficiency: warmIdx.includes(i) ? 78 : 90,
  }));
}

describe("warm nights", () => {
  it("flags warm, disrupted nights as likely night sweats", () => {
    const w = warmNights(nights(28, [12, 20]));
    expect(w.filter((x) => x.likely).map((x) => x.date)).toEqual(["2026-10-13", "2026-10-21"]);
  });
  it("doesn't flag normal nights", () => {
    expect(warmNights(nights(28, [])).some((x) => x.likely)).toBe(false);
  });
});

describe("hot-flash triggers", () => {
  it("finds alcohol as a personal trigger", () => {
    const days = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const wineDays = days.filter((_, i) => i % 3 === 0);
    const meals = wineDays.map((d) => ({ name: "Glass of red wine", loggedAt: `${d}T19:00:00` }));
    const flashes = days.flatMap((d) => Array.from({ length: wineDays.includes(d) ? 4 : 1 }, (_, k) => ({ id: `${d}-${k}`, at: `${d}T21:0${k}:00`, intensity: 2 as const })));
    const f = hotFlashTriggers(flashes, meals, new Map(), [], days);
    expect(f[0].trigger).toBe("alcohol");
    expect(f[0].ratio).toBeGreaterThan(3);
  });
});

describe("training", () => {
  it("moves heavy work after a night-sweat night", () => {
    const t = menopauseTraining({ weekday: 1, recovery: 70, warmNightLastNight: true, weightKg: 70 });
    expect(t.today.focus).toBe("Zone 2 cardio");
    expect(t.adjusted).toMatch(/night-sweat/);
  });
  it("keeps heavy strength on a good Monday", () => {
    const t = menopauseTraining({ weekday: 1, recovery: 70, warmNightLastNight: false, weightKg: 70 });
    expect(t.today.focus).toBe("Heavy strength");
    expect(t.nutrition[0]).toMatch(/84–112 g/);
  });
});

import { permutationP, benjaminiHochberg } from "./menopause";
describe("trigger statistics", () => {
  it("permutation p is small for a clear difference and large for none", () => {
    expect(permutationP([4, 5, 4, 6, 5], [1, 0, 1, 2, 1, 0, 1])).toBeLessThan(0.02);
    expect(permutationP([1, 2, 1, 2], [1, 2, 1, 2, 1, 2])).toBeGreaterThan(0.3);
  });
  it("Benjamini–Hochberg keeps order and never shrinks below the raw p", () => {
    const q = benjaminiHochberg([0.01, 0.04, 0.5]);
    expect(q[0]).toBeLessThanOrEqual(q[1]);
    expect(q[2]).toBeCloseTo(0.5, 5);
    q.forEach((v, i) => expect(v).toBeGreaterThanOrEqual([0.01, 0.04, 0.5][i] - 1e-12));
  });
});
