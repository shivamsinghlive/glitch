/**
 * Glitch — Bone & muscle health for peri/menopausal women.
 *
 * Bone loss speeds up around the final menstrual period, and muscle is harder to keep. All exercise
 * helps bone a little; heavier resistance and impact loading give bone the strongest signal.
 *
 * Every claim here maps to a verified PubMed entry in evidence.ts. Wellness insight, not a
 * diagnosis; screening, supplement and treatment decisions belong with a clinician.
 *
 * Evidence (evidence.ts ids):
 *  - bone-loss-around-final-period: fastest loss 1 y before → 2 y after the FMP (SWAN; ~10% spine over 10 y).
 *  - exercise-improves-bmd / liftmor-heavy-resistance-impact: small BMD gains from all exercise types;
 *    supervised heavy resistance + impact improved BMD in women with low bone mass (LIFTMOR).
 *  - calcium-vitamin-d-supplements: USPSTF finds no fracture benefit from routine low-dose
 *    supplements in community-dwelling postmenopausal women → food first, ask a clinician.
 *  - protein-intake-bone: ~1 g/kg/day for women over 50 (we show 1–1.2).
 *  - dexa-screening: all women ≥65; younger postmenopausal women at increased risk.
 */
import { evidenceFor } from "./evidence";

export interface Citation {
  /** Short label shown in the UI chip */
  label: string;
  /** Full source title for the link's accessible name */
  title: string;
  url: string;
  /** evidence.ts id the citation comes from */
  evidenceId: string;
}

function fromEvidence(evidenceId: string, label: string): Citation {
  const c = evidenceFor(evidenceId)?.citations[0];
  if (!c) throw new Error(`Unknown evidence id: ${evidenceId}`);
  return { label, title: `${c.title} (${c.journal}, ${c.year})`, url: c.url, evidenceId };
}

export const CITATIONS = {
  boneLossRate: fromEvidence("bone-loss-around-final-period", "SWAN: bone loss & final period"),
  resistanceBmd: fromEvidence("exercise-improves-bmd", "Exercise & bone density meta-analysis"),
  liftmor: fromEvidence("liftmor-heavy-resistance-impact", "LIFTMOR trial (supervised)"),
  nutrition: fromEvidence("calcium-vitamin-d-supplements", "USPSTF: vitamin D & calcium"),
  protein: fromEvidence("protein-intake-bone", "Nutrition & bone after menopause"),
  dexa: fromEvidence("dexa-screening", "USPSTF: osteoporosis screening"),
} satisfies Record<string, Citation>;

/** True for the cohort this guidance is aimed at (peri/menopausal, or 40+ women). */
export function isBoneHealthCohort(args: { age?: number; bodyKind?: string }): boolean {
  if (args.bodyKind === "peri" || args.bodyKind === "menopause") return true;
  return (args.age ?? 0) >= 40;
}

export interface BoneExercise {
  name: string;
  emoji: string;
  /** Why it helps bone/muscle, one friendly line */
  why: string;
  sets: number;
  reps: number;
  /** "resistance" loads muscle+bone via weight; "impact" is weight-bearing/jumping; "balance" prevents falls */
  kind: "resistance" | "impact" | "balance";
  /** Form Coach exercise name hint (so matchFormExercise can route it), if supported */
  formName?: string;
}

/**
 * A starter weight-bearing + resistance routine. Deliberately modest (2 short sessions/week is
 * enough to matter) so it doesn't feel like a chore. Squats/lunges map to Form Coach.
 */
export const BONE_STRENGTH_EXERCISES: BoneExercise[] = [
  { name: "Goblet squat", emoji: "🏋️", why: "Loads hips and spine — the sites that lose the most bone.", sets: 3, reps: 10, kind: "resistance", formName: "squat" },
  { name: "Reverse lunge", emoji: "🦵", why: "Builds leg strength and balance to protect against falls.", sets: 3, reps: 8, kind: "resistance", formName: "lunge" },
  { name: "Glute bridge", emoji: "🍑", why: "Strengthens hips and lower back without loading the knees.", sets: 3, reps: 12, kind: "resistance", formName: "bridge" },
  { name: "Wall push-up", emoji: "💪", why: "Loads wrists and arms — common fracture sites.", sets: 3, reps: 10, kind: "resistance", formName: "pushup" },
  { name: "Heel drops", emoji: "🦶", why: "Gentle impact that signals bone to rebuild.", sets: 2, reps: 15, kind: "impact" },
  { name: "Single-leg stand", emoji: "🧍", why: "Trains balance so everyday slips don't become fractures.", sets: 2, reps: 30, kind: "balance" },
];

export interface SupplementSuggestion {
  name: string;
  dose: string;
  emoji: string;
  reason: string;
  citationKey: keyof typeof CITATIONS;
}

/**
 * Bone/muscle supplement suggestions for the cohort. These are general guidance figures for
 * women over 50; the app always nudges the user to confirm with a clinician/pharmacist.
 */
export function suggestBoneSupplements(): SupplementSuggestion[] {
  return [
    { name: "Vitamin D3", dose: "ask your clinician", emoji: "☀️", reason: "Helps you absorb calcium. Routine low-dose supplements don't prevent fractures in most women, so ask whether your levels need checking before taking one.", citationKey: "nutrition" },
    { name: "Calcium", dose: "food first", emoji: "🥛", reason: "The main mineral in bone. Aim for calcium-rich foods; supplements add kidney-stone risk, so check with your clinician before adding one.", citationKey: "nutrition" },
    { name: "Protein", dose: "~1–1.2 g per kg body weight", emoji: "🥩", reason: "Supports muscle and bone as estrogen drops. Spread across meals.", citationKey: "protein" },
  ];
}

export interface ScreeningSuggestion {
  name: string;
  reason: string;
  citationKey: keyof typeof CITATIONS;
}

/** Screenings worth raising with a clinician, tailored to age/risk. */
export function suggestScreenings(age: number): ScreeningSuggestion[] {
  const out: ScreeningSuggestion[] = [];
  if (age >= 65) {
    out.push({ name: "DEXA bone-density scan", reason: "Recommended for all women 65+ to check for osteoporosis.", citationKey: "dexa" });
  } else if (age >= 50) {
    out.push({ name: "DEXA bone-density scan (if at risk)", reason: "Worth asking about before 65 if you have risk factors (early menopause, family history, low body weight, smoking).", citationKey: "dexa" });
  }
  return out;
}

/** One-paragraph "why this matters" explainer for the cohort. */
export const BONE_HEALTH_SUMMARY =
  "Bone loss is fastest from about a year before your final period to two years after it (roughly 2% a year at the spine), and muscle gets harder to keep. Walking, yoga and any regular exercise help a little. Heavier resistance and impact training give bone the strongest signal, so start light, build up over weeks, and get a coach or physio to check your form if you can. Two to three sessions a week is plenty.";
