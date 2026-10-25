import { describe, expect, it } from "vitest";
import { hotflashRisk, MODEL_CARD } from "./hotflashRisk";

describe("hot-flash risk model", () => {
  it("rates prior symptoms + BMI≥30 + smoking above the study baseline", () => {
    const r = hotflashRisk({ age: 44, smoker: true, bmi: 32, priorSymptoms: true });
    expect(r.relative).toBe("higher");
    expect(r.probability).toBeGreaterThan(r.prevalence);
    expect(r.usedLabs).toBe(false);
  });
  it("rates no risk factors below baseline", () => {
    expect(hotflashRisk({ age: 38, smoker: false, bmi: 23, priorSymptoms: false }).relative).toBe("lower");
  });
  it("uses the lab model when FSH and estradiol are provided, and higher FSH raises risk", () => {
    const lo = hotflashRisk({ age: 45, smoker: false, bmi: 25, priorSymptoms: false, fsh: 4, estradiol: 60 });
    const hi = hotflashRisk({ age: 45, smoker: false, bmi: 25, priorSymptoms: false, fsh: 30, estradiol: 60 });
    expect(lo.usedLabs).toBe(true);
    expect(hi.probability).toBeGreaterThan(lo.probability);
  });
  it("flags ages outside the training range and documents the model", () => {
    expect(hotflashRisk({ age: 55, smoker: false, bmi: 24, priorSymptoms: true }).outOfRange).toBe(true);
    expect(MODEL_CARD.excluded).toContain("race");
    expect(MODEL_CARD.aucBase).toBeGreaterThan(0.6);
  });
});

import { whatIfChanges } from "./hotflashRisk";
import { describe as d2, it as it2, expect as ex2 } from "vitest";
d2("whatIfChanges", () => {
  it2("lowers risk when a modifiable factor is removed, and is empty if none apply", () => {
    const w = whatIfChanges({ age: 46, smoker: true, bmi: 32, priorSymptoms: true });
    ex2(w.length).toBe(2);
    w.forEach((x) => ex2(x.to).toBeLessThan(x.from));
    ex2(whatIfChanges({ age: 46, smoker: false, bmi: 24, priorSymptoms: true })).toEqual([]);
  });
});
