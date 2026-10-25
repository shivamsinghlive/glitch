import { describe, expect, it } from "vitest";
import { computeNutritionGoals, mifflinStJeor, type NutritionInput } from "./nutritionPlan";

const base: NutritionInput = { name: "Maya", age: 49, weight: 72, height: 165, goal: "maintain", sex: "female" };

describe("Mifflin-St Jeor", () => {
  it("matches the published equation", () => {
    expect(mifflinStJeor({ age: 49, weight: 72, height: 165, sex: "female" })).toBe(Math.round(10 * 72 + 6.25 * 165 - 5 * 49 - 161));
    expect(mifflinStJeor({ age: 30, weight: 80, height: 180, sex: "male" })).toBe(Math.round(800 + 1125 - 150 + 5));
  });
});

describe("computeNutritionGoals updates with the user's numbers", () => {
  it("scales with weight, height and age", () => {
    const a = computeNutritionGoals(base).calorieTarget;
    expect(computeNutritionGoals({ ...base, weight: 90 }).calorieTarget).toBeGreaterThan(a);
    expect(computeNutritionGoals({ ...base, height: 150 }).calorieTarget).toBeLessThan(a);
    expect(computeNutritionGoals({ ...base, age: 65 }).calorieTarget).toBeLessThan(a);
  });

  it("moves with the goal", () => {
    const m = computeNutritionGoals(base).calorieTarget;
    expect(computeNutritionGoals({ ...base, goal: "lose_weight" }).calorieTarget).toBeLessThan(m);
    expect(computeNutritionGoals({ ...base, goal: "build_muscle" }).calorieTarget).toBeGreaterThan(m);
  });

  it("never goes below a safe floor and never cuts calories when a deficit is unsafe", () => {
    expect(computeNutritionGoals({ ...base, weight: 45, height: 150, age: 70, goal: "lose_weight" }).calorieTarget).toBeGreaterThanOrEqual(1200);
    const d = computeNutritionGoals({ ...base, goal: "lose_weight", allowCalorieDeficit: false });
    expect(Math.abs(d.basis.adjustment)).toBeLessThanOrEqual(5); // rounding only, no deficit
  });

  it("sets protein to the menopause guidance for the bone cohort and iron by life stage", () => {
    const cohort = computeNutritionGoals({ ...base, boneCohort: true });
    expect(cohort.proteinTarget / base.weight).toBeGreaterThanOrEqual(1.19);
    expect(cohort.vitDTarget).toBe(800);
    expect(computeNutritionGoals({ ...base, age: 40 }).ironTarget).toBe(18);
    expect(computeNutritionGoals({ ...base, age: 55, postmenopause: true }).ironTarget).toBe(8);
  });

  it("macros add up to the calorie target", () => {
    const g = computeNutritionGoals({ ...base, goal: "build_muscle", daysPerWeek: 4 });
    const kcal = g.proteinTarget * 4 + g.carbsTarget * 4 + g.fatsTarget * 9;
    expect(Math.abs(kcal - g.calorieTarget)).toBeLessThan(12);
  });

  it("training days raise the energy estimate", () => {
    expect(computeNutritionGoals({ ...base, daysPerWeek: 6 }).calorieTarget).toBeGreaterThan(computeNutritionGoals({ ...base, daysPerWeek: 2 }).calorieTarget);
  });
});
