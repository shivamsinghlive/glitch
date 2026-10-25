/**
 * Glitch — Bone & muscle health for peri/menopausal women.
 *
 * Estrogen decline around menopause accelerates BOTH bone loss and muscle loss (sarcopenia).
 * Many women don't realise that gentle movement like yoga alone doesn't load bone enough —
 * resistance + impact training is what preserves bone mineral density and muscle.
 *
 * Everything here is evidence-based with citations. Wellness insight, not a diagnosis;
 * screening and treatment decisions belong with a clinician.
 *
 * Sources (see CITATIONS below):
 *  - Bone loss ~2%/yr around the final period; ~10% around menopause + the following decade.
 *  - Resistance training 2–3x/week at moderate–high intensity + impact ≥3x/week is optimal for BMD.
 *  - Protein ~1.0–1.5 g/kg/day, calcium ≥1000 mg/day, vitamin D 800 IU/day for women over 50.
 *  - DEXA (bone density) screening: all women ≥65; earlier if at increased risk.
 */

export interface Citation {
  /** Short label shown in the UI chip */
  label: string;
  /** Full source title for the link's accessible name */
  title: string;
  url: string;
}

export const CITATIONS: Record<string, Citation> = {
  boneLossRate: {
    label: "AAOS: bone loss in menopause",
    title: "Musculoskeletal Syndrome of Menopause — OrthoInfo (AAOS)",
    url: "https://www.orthoinfo.org/diseases--conditions/musculoskeletal-syndrome-of-menopause-msm/",
  },
  stopEm: {
    label: "STOP-EM trial",
    title: "Strength Training for Osteoporosis Prevention during Early Menopause (STOP-EM)",
    url: "https://pubmed.ncbi.nlm.nih.gov/39909519/",
  },
  resistanceBmd: {
    label: "Exercise & bone density review",
    title: "Menopause hormone therapy, exercise and bone mineral density — scoping review (Frontiers, 2025)",
    url: "https://www.frontiersin.org/journals/reproductive-health/articles/10.3389/frph.2025.1542746/full",
  },
  sarcopenia: {
    label: "Stanford: strength training 50+",
    title: "Strength Training for Women 50+ — Stanford Lifestyle Medicine",
    url: "https://lifestylemedicine.stanford.edu/strength-training-for-women-50/",
  },
  nutrition: {
    label: "Nutrition & bone health guidance",
    title: "Nutrition and bone health in women after the menopause (PubMed)",
    url: "https://pubmed.ncbi.nlm.nih.gov/25482487/",
  },
  protein: {
    label: "Protein & muscle in menopause",
    title: "Muscle and Bone Health in Postmenopausal Women: protein & vitamin D with exercise (Nutrients, 2018)",
    url: "https://www.mdpi.com/2072-6643/10/8/1103/htm",
  },
  dexa: {
    label: "USPSTF: osteoporosis screening",
    title: "Osteoporosis to Prevent Fractures: Screening — U.S. Preventive Services Task Force",
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/osteoporosis-screening",
  },
};

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
    { name: "Vitamin D3", dose: "800 IU daily", emoji: "☀️", reason: "Helps you absorb calcium; most people over 50 run low.", citationKey: "nutrition" },
    { name: "Calcium", dose: "1000 mg daily (food first)", emoji: "🥛", reason: "The main mineral in bone. Aim for food sources, supplement the gap.", citationKey: "nutrition" },
    { name: "Protein", dose: "at least 1.0–1.2 g per kg body weight", emoji: "🥩", reason: "Protects muscle as estrogen drops, especially with strength training. Spread across meals.", citationKey: "protein" },
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
  "Around menopause, falling estrogen speeds up bone loss (about 2% a year near your final period) and muscle loss at the same time. Yoga and walking are great, but they don't load bone enough on their own — a little resistance and impact training two to three times a week is what keeps bones and muscle strong. You don't need to train every day.";
