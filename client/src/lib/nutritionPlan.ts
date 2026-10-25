/**
 * Glitch — daily nutrition targets computed from the user's own numbers.
 *
 * Deterministic and testable: Mifflin-St Jeor energy needs, adjusted for the user's goal and life stage, with
 * protein, fibre, iron and vitamin D set from guidance (see evidence.ts). No AI call is needed, so targets
 * update instantly and correctly whenever weight, height, age, goal or training days change.
 * The AI (when the user allows it) may only reword the explanation, never change the numbers.
 *
 * Wellness estimates, not medical advice. People with diabetes, kidney disease or an eating disorder should set
 * targets with their clinician.
 */
import type { NutritionGoals } from "./aiService";

export interface NutritionInput {
  name: string;
  age: number;
  weight: number; // kg
  height: number; // cm
  goal: "lose_weight" | "maintain" | "build_muscle" | "manage_diabetes" | string;
  sex?: "female" | "male" | "prefer_not_to_say";
  /** Training days per week, if known (adjusts the activity factor) */
  daysPerWeek?: number;
  /** Peri/post-menopause or 40+ female: raises protein and vitamin D to the menopause guidance */
  boneCohort?: boolean;
  /** Post-menopause: iron need drops */
  postmenopause?: boolean;
  /** Life stages (pregnancy, postpartum…) where a calorie deficit is unsafe */
  allowCalorieDeficit?: boolean;
}

export interface NutritionBasis { bmr: number; tdee: number; activity: number; proteinPerKg: number; adjustment: number; sources: string[] }

export function mifflinStJeor(i: Pick<NutritionInput, "age" | "weight" | "height" | "sex">): number {
  const base = 10 * i.weight + 6.25 * i.height - 5 * i.age;
  return Math.round(base + (i.sex === "male" ? 5 : i.sex === "female" ? -161 : -78));
}

const round = (x: number, to: number) => Math.round(x / to) * to;

export function computeNutritionGoals(i: NutritionInput): NutritionGoals & { basis: NutritionBasis } {
  const weight = i.weight > 0 ? i.weight : 70, height = i.height > 0 ? i.height : 165, age = i.age > 0 ? i.age : 40;
  const bmr = mifflinStJeor({ age, weight, height, sex: i.sex });
  const activity = i.daysPerWeek != null ? +(1.375 + 0.0375 * Math.min(7, Math.max(0, i.daysPerWeek))).toFixed(3) : 1.55;
  const tdee = Math.round(bmr * activity);
  const noDeficit = i.allowCalorieDeficit === false;
  const floor = i.sex === "male" ? 1500 : 1200;

  let adjustment = 0;
  if (i.goal === "lose_weight" && !noDeficit) adjustment = -500;
  else if (i.goal === "build_muscle") adjustment = 300;
  else if (i.goal === "manage_diabetes") adjustment = -150;
  const calorieTarget = Math.max(round(tdee + adjustment, 10), noDeficit ? tdee : floor);
  adjustment = calorieTarget - tdee;

  const cohort = !!i.boneCohort;
  let perKg = i.goal === "build_muscle" ? (cohort ? 1.6 : 1.8) : i.goal === "lose_weight" ? 1.4 : cohort ? 1.2 : 1.0;
  if (cohort) perKg = Math.max(perKg, 1.2);
  let proteinTarget = Math.round(weight * perKg);
  proteinTarget = Math.min(proteinTarget, Math.round((calorieTarget * 0.35) / 4)); // never above 35% of calories

  const fatShare = i.goal === "manage_diabetes" ? 0.35 : 0.3;
  const fatsTarget = Math.round((calorieTarget * fatShare) / 9);
  const carbsTarget = Math.max(0, Math.round((calorieTarget - proteinTarget * 4 - fatsTarget * 9) / 4));
  const fiberTarget = Math.max(25, Math.round((calorieTarget / 1000) * 14)) + (i.goal === "manage_diabetes" ? 5 : 0);

  const sources = cohort ? ["esceo", "protein-exercise"] : ["protein-exercise"];
  const goalText: Record<string, string> = { lose_weight: "a gentle deficit", maintain: "maintenance", build_muscle: "a small surplus", manage_diabetes: "a slight deficit with more fibre and lower carbs" };
  const rationale = `${i.name}, ${calorieTarget} kcal is your estimated maintenance (${tdee}) ${adjustment === 0 ? "as is" : `${adjustment > 0 ? "plus" : "minus"} ${Math.abs(adjustment)}`} for ${noDeficit && i.goal === "lose_weight" ? "maintenance, since a deficit isn't advised at your life stage" : goalText[i.goal] ?? "your goal"}. Protein is ${proteinTarget} g (${(proteinTarget / weight).toFixed(1)} g per kg)${cohort ? ", set to the menopause guidance of at least 1.0–1.2 g per kg to protect muscle" : ""}.`;

  return {
    calorieTarget, proteinTarget, carbsTarget, fatsTarget, fiberTarget,
    omega3Target: 2,
    vitDTarget: cohort ? 800 : 600,
    vitB12Target: 2.4,
    ironTarget: i.postmenopause || age >= 51 ? 8 : 18,
    stepGoal: 8000,
    rationale,
    basis: { bmr, tdee, activity, proteinPerKg: +(proteinTarget / weight).toFixed(2), adjustment, sources },
  };
}
