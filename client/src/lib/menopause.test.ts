import { describe, expect, it } from "vitest";
import type { DailyPhysiology } from "./whoop/types";
import { stageMenopause, scoreMrs, warmNights, hotFlashTriggers, benjaminiHochberg, permutationPValue, triggerEffect, triggerPower, daysNeeded, analyzeTriggerCounts, menopauseTraining, clinicianPoints } from "./menopause";

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

describe("hot-flash triggers (n-of-1)", () => {
  const days30 = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10));
  // Deterministic noisy daily counts (LCG), so tests don't depend on Math.random
  const noisy = (seed: number) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; };
  const flashesFrom = (days: string[], n: (d: string, i: number) => number) =>
    days.flatMap((d, i) => Array.from({ length: n(d, i) }, (_, k) => ({ id: `${d}-${k}`, at: `${d}T1${k % 10}:00:00`, intensity: 2 as const })));

  it("finds alcohol as a personal trigger, with a CI above 1", () => {
    const days = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const wineDays = days.filter((_, i) => i % 3 === 0);
    const meals = wineDays.map((d) => ({ name: "Glass of red wine", loggedAt: `${d}T19:00:00` }));
    const flashes = days.flatMap((d) => Array.from({ length: wineDays.includes(d) ? 4 : 1 }, (_, k) => ({ id: `${d}-${k}`, at: `${d}T21:0${k}:00`, intensity: 2 as const })));
    const f = hotFlashTriggers(flashes, meals, new Map(), [], days);
    expect(f[0].trigger).toBe("alcohol");
    expect(f[0].significant).toBe(true);
    expect(f[0].ratio).toBeGreaterThan(3);
    expect(f[0].ciLow).toBeGreaterThan(1);
    expect(f[0].qValue).toBeLessThan(0.1);
    expect(f[0].days).toBe(5);
    expect(f[0].withoutDays).toBe(9);
    expect(triggerEffect(f[0])).toMatch(/× more flashes \(95% CI \d/);
  });

  it("does not flag a trigger unrelated to flashes (no false positive)", () => {
    const r = noisy(7);
    const coffeeDays = days30.filter((_, i) => i % 2 === 0);
    const meals = coffeeDays.map((d) => ({ name: "Latte", loggedAt: `${d}T08:00:00` }));
    const flashes = flashesFrom(days30, () => Math.floor(r() * 4)); // 0–3/day, independent of coffee
    const f = hotFlashTriggers(flashes, meals, new Map(), [], days30);
    const caf = f.find((t) => t.trigger === "caffeine")!;
    expect(caf).toBeDefined();
    expect(caf.significant).toBe(false);
    expect(f.filter((t) => t.significant)).toEqual([]);
  });

  it("finds a real trigger among noisy days and leaves the null one unflagged", () => {
    const r = noisy(11);
    const wine = new Set(days30.filter((_, i) => i % 4 === 1));
    const coffee = days30.filter((_, i) => i % 3 === 0);
    const meals = [...[...wine].map((d) => ({ name: "Glass of wine", loggedAt: `${d}T19:00:00` })), ...coffee.map((d) => ({ name: "Espresso", loggedAt: `${d}T08:00:00` }))];
    const flashes = flashesFrom(days30, (d) => Math.floor(r() * 3) + (wine.has(d) ? 3 : 0));
    const f = hotFlashTriggers(flashes, meals, new Map(), [], days30);
    expect(f.filter((t) => t.significant).map((t) => t.trigger)).toEqual(["alcohol"]);
    expect(f.find((t) => t.trigger === "caffeine")!.significant).toBe(false);
  });

  it("skips triggers with fewer than 5 days in either group", () => {
    const meals = days30.slice(0, 4).map((d) => ({ name: "Red wine", loggedAt: `${d}T19:00:00` }));
    const flashes = flashesFrom(days30, (_, i) => (i < 4 ? 6 : 1));
    expect(hotFlashTriggers(flashes, meals, new Map(), [], days30).find((t) => t.trigger === "alcohol")).toBeUndefined();
    // and the other direction: trigger on all but 4 days
    const meals2 = days30.slice(4).map((d) => ({ name: "Red wine", loggedAt: `${d}T19:00:00` }));
    expect(hotFlashTriggers(flashes, meals2, new Map(), [], days30).find((t) => t.trigger === "alcohol")).toBeUndefined();
  });

  it("is deterministic (seeded permutations)", () => {
    const r = noisy(3);
    const stress = new Map(days30.filter((_, i) => i % 5 === 0).map((d) => [d, "high" as const]));
    const flashes = flashesFrom(days30, (d) => Math.floor(r() * 3) + (stress.has(d) ? 1 : 0));
    const a = hotFlashTriggers(flashes, [], stress, [], days30);
    const b = hotFlashTriggers(flashes, [], stress, [], days30);
    expect(a).toEqual(b);
    expect(permutationPValue([1, 2, 3, 4, 5, 6], [true, false, true, false, true, false], 42)).toBe(permutationPValue([1, 2, 3, 4, 5, 6], [true, false, true, false, true, false], 42));
  });

  it("permutation p is ~1 when trigger days have the fewest flashes and small when they have the most", () => {
    const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5];
    expect(permutationPValue(counts, counts.map((_, i) => i < 5), 1)).toBeGreaterThan(0.95);
    expect(permutationPValue(counts, counts.map((_, i) => i >= 10), 1)).toBeLessThan(0.01); // exact p = 1/C(15,5)
  });
});

describe("Benjamini–Hochberg", () => {
  it("matches hand-computed q-values and keeps input order", () => {
    // sorted p: .01 .02 .03 .04 .20 .50, m=6 → .06 .06 .06 .06 .24 .50
    const q = benjaminiHochberg([0.5, 0.01, 0.04, 0.2, 0.02, 0.03]);
    expect(q.map((x) => +x.toFixed(4))).toEqual([0.5, 0.06, 0.06, 0.24, 0.06, 0.06]);
  });
  it("a p of 0.04 alone survives, but not among six tests with nothing else going on", () => {
    expect(benjaminiHochberg([0.04])[0]).toBeCloseTo(0.04);
    expect(benjaminiHochberg([0.04, 0.6, 0.7, 0.8, 0.9, 0.95])[0]).toBeCloseTo(0.24);
  });
  it("q-values are monotone in p and capped at 1", () => {
    const q = benjaminiHochberg([0.9, 0.95, 1]);
    expect(q.every((x) => x <= 1)).toBe(true);
    expect(q[0]).toBeLessThanOrEqual(q[1]);
  });
});

describe("trigger power analysis", () => {
  const base = { baseRate: 3, rateRatio: 1.5, triggerShare: 0.3 };
  it("more days → more power; bigger effect → more power", () => {
    const p = [30, 60, 90].map((days) => triggerPower({ ...base, days }));
    expect(p[0]).toBeLessThan(p[1]);
    expect(p[1]).toBeLessThan(p[2]);
    expect(triggerPower({ ...base, rateRatio: 2, days: 30 })).toBeGreaterThan(p[0]);
    expect(triggerPower({ ...base, baseRate: 6, days: 30 })).toBeGreaterThan(p[0]);
  });
  it("RR = 1 → power is a small false-positive rate, at or below alpha", () => {
    const p = triggerPower({ ...base, rateRatio: 1, days: 60, sims: 500, tests: 1 });
    expect(p).toBeLessThanOrEqual(0.1);
  });
  it("0 when either group would have under 5 days", () => {
    expect(triggerPower({ ...base, days: 14, triggerShare: 0.2 })).toBe(0);
  });
  it("is deterministic and daysNeeded is monotone in effect size", () => {
    expect(triggerPower({ ...base, days: 40 })).toBe(triggerPower({ ...base, days: 40 }));
    const d15 = daysNeeded(base), d2 = daysNeeded({ ...base, rateRatio: 2 });
    expect(d2).not.toBeNull();
    expect(d15 === null || d15 > d2!).toBe(true);
    expect(daysNeeded(base)).toBe(d15); // memoized
    expect(daysNeeded({ ...base, baseRate: 0.5, rateRatio: 1.1 })).toBeNull();
  });
  it("analyzeTriggerCounts matches hotFlashTriggers' contract", () => {
    const counts = [5, 1, 1, 5, 1, 1, 5, 1, 1, 5, 1, 1, 5, 1, 1];
    const r = analyzeTriggerCounts(counts, { alcohol: counts.map((c) => c === 5) });
    expect(r[0].significant).toBe(true);
    expect(r[0].withoutDays).toBe(10);
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
    expect(t.nutrition[0]).toMatch(/70–84 g/);
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
