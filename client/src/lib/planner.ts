/**
 * Glitch — builds a weekly training plan from what the user chose, grounded in cited evidence.
 *
 * Inputs the user controls: goal, equipment, favourite training styles, and days per week.
 * Context the app already knows: age, life stage (peri/menopause) and cycle phase.
 *
 * How it works (no AI call, runs on the device):
 *  1. Decide the week's mix of session types from the goal and life stage (e.g. 2–3 strength days for
 *     the bone-health cohort, per the retrieved evidence).
 *  2. Fill every chosen day. Exercises are picked only if the user's equipment allows them, ranked by the
 *     user's chosen styles, and rotated so the week isn't repetitive.
 *  3. Retrieve evidence passages (BM25, see evidence.ts) and attach them to the plan and each exercise.
 *  4. Each exercise says WHY it is there: matches a choice, or was added for the goal despite the choice.
 *
 * Wellness guidance, not a prescription. Start light, build gradually, and check with a clinician if you
 * have osteoporosis, joint problems or heart disease.
 */
import type { Equipment, FitnessGoal, WorkoutStyle } from "@/contexts/AppContext";
import type { Exercise } from "./aiService";
import { retrieve, type Passage } from "./evidence";

export type Kind = "strength" | "impact" | "cardio" | "balance" | "mobility";

interface Template {
  id: string; name: string; emoji: string; kind: Kind;
  styles: WorkoutStyle[];
  /** Any one of these unlocks it; empty = bodyweight. "full_gym" unlocks everything. */
  needs: Equipment[];
  detail: string; burn: number; cues: string[]; goodCue: string;
  /** Heavier / higher impact: avoided for the first week of a cohort that needs low-impact starts */
  hard?: boolean;
  formName?: string;
}

const L: Template[] = [
  // strength
  { id: "goblet-squat", name: "Goblet squat", emoji: "🏋️", kind: "strength", styles: ["weight_training"], needs: ["dumbbells", "kettlebells"], detail: "3 × 10 reps", burn: 90, cues: ["Hold the weight at your chest", "Knees track over toes", "Drive through your heels"], goodCue: "Steady depth, chest stayed tall.", formName: "squat" },
  { id: "bodyweight-squat", name: "Bodyweight squat", emoji: "🦵", kind: "strength", styles: ["calisthenics", "pilates"], needs: [], detail: "3 × 12 reps", burn: 70, cues: ["Chest up", "Sit back and down", "Stand tall, squeeze glutes"], goodCue: "Controlled all the way down and up.", formName: "squat" },
  { id: "leg-press", name: "Leg press", emoji: "🦿", kind: "strength", styles: ["weight_training"], needs: ["full_gym"], detail: "3 × 10 reps", burn: 100, cues: ["Feet shoulder-width", "Don't lock your knees", "Press through the whole foot"], goodCue: "Smooth tempo, no knee lock." },
  { id: "reverse-lunge", name: "Reverse lunge", emoji: "🚶‍♀️", kind: "strength", styles: ["calisthenics", "weight_training"], needs: [], detail: "3 × 8 each leg", burn: 85, cues: ["Step back softly", "Front knee over ankle", "Push through the front heel"], goodCue: "Balanced and controlled.", formName: "lunge" },
  { id: "rdl", name: "Romanian deadlift", emoji: "🏋️‍♀️", kind: "strength", styles: ["weight_training"], needs: ["dumbbells", "kettlebells"], detail: "3 × 10 reps", burn: 95, cues: ["Hinge at the hips", "Back flat", "Feel it in the hamstrings"], goodCue: "Clean hinge, flat back.", hard: true },
  { id: "kb-swing", name: "Kettlebell swing", emoji: "⚙️", kind: "strength", styles: ["hiit", "weight_training"], needs: ["kettlebells"], detail: "4 × 12 reps", burn: 120, cues: ["Hips snap, arms guide", "Neutral spine", "Squeeze glutes at the top"], goodCue: "Powerful hips, quiet arms.", hard: true },
  { id: "db-press", name: "Dumbbell overhead press", emoji: "💪", kind: "strength", styles: ["weight_training"], needs: ["dumbbells"], detail: "3 × 10 reps", burn: 80, cues: ["Ribs down", "Press in a straight line", "Control the way down"], goodCue: "Strong and stacked." },
  { id: "band-row", name: "Resistance-band row", emoji: "🎗️", kind: "strength", styles: ["weight_training", "calisthenics", "pilates"], needs: ["resistance_bands"], detail: "3 × 12 reps", burn: 60, cues: ["Pull elbows back", "Squeeze shoulder blades", "Slow return"], goodCue: "Shoulders stayed down." },
  { id: "band-press", name: "Resistance-band chest press", emoji: "🎗️", kind: "strength", styles: ["weight_training", "calisthenics"], needs: ["resistance_bands"], detail: "3 × 12 reps", burn: 60, cues: ["Anchor behind you", "Press straight out", "Slow return"], goodCue: "Smooth and even on both sides." },
  { id: "lat-pulldown", name: "Lat pulldown", emoji: "🏟️", kind: "strength", styles: ["weight_training"], needs: ["full_gym"], detail: "3 × 10 reps", burn: 80, cues: ["Pull to upper chest", "Elbows down", "Don't lean back far"], goodCue: "Controlled pull." },
  { id: "pull-up", name: "Assisted pull-up", emoji: "🔩", kind: "strength", styles: ["calisthenics"], needs: ["pull_up_bar"], detail: "3 × 5 reps (use a band or lower with control)", burn: 70, cues: ["Start from a dead hang", "Chest to the bar", "Lower slowly"], goodCue: "No swinging, full range.", hard: true },
  { id: "wall-pushup", name: "Wall or incline push-up", emoji: "🧱", kind: "strength", styles: ["calisthenics", "pilates"], needs: [], detail: "3 × 10 reps", burn: 55, cues: ["Body in one line", "Elbows 45° from your body", "Chest to the surface"], goodCue: "One straight line.", formName: "pushup" },
  { id: "glute-bridge", name: "Glute bridge", emoji: "🍑", kind: "strength", styles: ["pilates", "yoga", "calisthenics"], needs: [], detail: "3 × 12 reps", burn: 50, cues: ["Feet hip-width", "Drive through heels", "Ribs down at the top"], goodCue: "Hips level and strong.", formName: "bridge" },
  // impact
  { id: "heel-drops", name: "Heel drops", emoji: "🦶", kind: "impact", styles: ["calisthenics", "yoga", "pilates"], needs: [], detail: "2 × 15 reps", burn: 30, cues: ["Rise onto your toes", "Drop onto your heels", "Stay tall"], goodCue: "Light, rhythmic drops." },
  { id: "jump-landings", name: "Jump and soft landing", emoji: "🦘", kind: "impact", styles: ["hiit", "calisthenics"], needs: [], detail: "3 × 8 reps", burn: 80, cues: ["Land softly on the balls of your feet", "Knees bend to absorb", "Reset between jumps"], goodCue: "Quiet landings.", hard: true },
  { id: "step-drive", name: "Step-up with a drive", emoji: "🪜", kind: "impact", styles: ["calisthenics", "weight_training", "hiit"], needs: [], detail: "3 × 8 each leg", burn: 85, cues: ["Whole foot on the step", "Drive the knee up", "Step down slowly"], goodCue: "Strong drive, soft step down." },
  // cardio
  { id: "brisk-walk", name: "Brisk walk (zone 2)", emoji: "🚶", kind: "cardio", styles: ["running"], needs: [], detail: "30 min, you can still talk", burn: 140, cues: ["Tall posture", "Swing arms naturally", "Conversational pace"], goodCue: "Steady and relaxed." },
  { id: "jog-intervals", name: "Easy jog intervals", emoji: "🏃", kind: "cardio", styles: ["running"], needs: [], detail: "6 × (2 min jog, 1 min walk)", burn: 200, cues: ["Light quick steps", "Relax shoulders", "Walk breaks are part of the plan"], goodCue: "Smooth rhythm.", hard: true },
  { id: "gym-cardio", name: "Bike or rower, steady", emoji: "🚴", kind: "cardio", styles: ["running", "hiit"], needs: ["full_gym"], detail: "25 min steady", burn: 180, cues: ["Set an easy resistance", "Breathe steadily", "Sit tall"], goodCue: "Even effort throughout." },
  { id: "sprint-intervals", name: "Short sprint intervals", emoji: "⚡", kind: "cardio", styles: ["hiit"], needs: [], detail: "6 × (20 s hard, 90 s easy)", burn: 190, cues: ["Warm up first", "Hard but controlled", "Full recovery between"], goodCue: "Strong efforts, easy recoveries.", hard: true },
  // balance & mobility
  { id: "single-leg-stand", name: "Single-leg stand", emoji: "🧍", kind: "balance", styles: ["yoga", "pilates"], needs: [], detail: "2 × 30 s each side", burn: 20, cues: ["Soft knee", "Eyes on a fixed point", "Hands near a wall if needed"], goodCue: "Still and steady." },
  { id: "tree-pose", name: "Tree pose and heel-toe walk", emoji: "🌳", kind: "balance", styles: ["yoga"], needs: [], detail: "3 × 30 s", burn: 25, cues: ["Press foot into leg, not knee", "Long spine", "Breathe slowly"], goodCue: "Calm and balanced." },
  { id: "sun-salutation", name: "Gentle sun salutations", emoji: "🧘", kind: "mobility", styles: ["yoga"], needs: [], detail: "5 rounds", burn: 60, cues: ["Move with your breath", "Keep knees soft", "Go only as far as comfortable"], goodCue: "Smooth flow." },
  { id: "dead-bug", name: "Dead bug", emoji: "🐞", kind: "mobility", styles: ["pilates", "calisthenics"], needs: [], detail: "3 × 8 each side", burn: 40, cues: ["Low back stays on the floor", "Opposite arm and leg", "Slow and controlled"], goodCue: "Core stayed switched on." },
  { id: "cat-cow", name: "Cat-cow and hip mobility", emoji: "🐈", kind: "mobility", styles: ["yoga", "pilates"], needs: [], detail: "10 min", burn: 30, cues: ["Round, then arch", "Breathe in the arch", "Easy, no forcing"], goodCue: "Relaxed range." },
];

export interface PlanInput {
  goal: FitnessGoal;
  equipment: Equipment[];
  styles: WorkoutStyle[];
  daysPerWeek: number;
  age: number;
  /** Peri/post-menopause (or a female profile 45+): turns on the bone-and-muscle rules */
  boneCohort: boolean;
  cyclePhase?: string;
}

export interface PlannedExercise extends Exercise {
  kind: Kind;
  why: string;
  /** Evidence passage ids that support this exercise's place in the plan */
  sources: string[];
  formName?: string;
}
export interface PlannedDay { dayOfWeek: number; focus: string; exercises: PlannedExercise[] }
export interface PlannedWeek {
  days: PlannedDay[];
  evidence: Passage[];
  notes: string[];
  counts: Record<"strength" | "impact" | "cardio" | "balance", number>;
}

const DAY_SETS: Record<number, number[]> = { 1: [2], 2: [0, 3], 3: [0, 2, 4], 4: [0, 2, 4, 5], 5: [0, 1, 3, 4, 5], 6: [0, 1, 2, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
const STYLE_LABEL: Record<WorkoutStyle, string> = { calisthenics: "calisthenics", weight_training: "weight training", yoga: "yoga", running: "running or cardio", hiit: "HIIT", pilates: "Pilates" };
const EQUIP_LABEL: Record<Equipment, string> = { none: "bodyweight", dumbbells: "dumbbells", resistance_bands: "resistance bands", pull_up_bar: "a pull-up bar", kettlebells: "kettlebells", full_gym: "full gym access" };

const available = (t: Template, eq: Equipment[]) => t.needs.length === 0 || eq.includes("full_gym") || t.needs.some((n) => eq.includes(n));

type DayType = "strength" | "cardio" | "balance" | "hiit";

/** Which kinds of session fill the chosen days, in priority order. */
export function weekMix(i: Pick<PlanInput, "goal" | "daysPerWeek" | "boneCohort" | "styles">): DayType[] {
  const n = Math.max(1, Math.min(7, i.daysPerWeek));
  let strength: number, cardio: number, balance: number, hiit = 0;
  if (i.boneCohort) { strength = Math.min(3, Math.max(2, Math.ceil(n * 0.5))); balance = n >= 4 ? 1 : 0; cardio = n - strength - balance; }
  else if (i.goal === "build_muscle") { strength = Math.min(4, Math.ceil(n * 0.65)); balance = 0; cardio = n - strength; }
  else if (i.goal === "lose_weight") { strength = Math.min(3, Math.max(2, Math.ceil(n * 0.4))); balance = 0; cardio = n - strength; hiit = i.styles.includes("hiit") && cardio > 1 ? 1 : 0; }
  else if (i.goal === "manage_diabetes") { strength = Math.min(3, Math.max(2, Math.ceil(n * 0.45))); balance = 0; cardio = n - strength; }
  else { strength = Math.min(3, Math.max(2, Math.ceil(n * 0.45))); balance = n >= 5 || i.styles.some((s) => s === "yoga" || s === "pilates") ? 1 : 0; cardio = n - strength - balance; }
  if (n === 1) { strength = 1; cardio = 0; balance = 0; hiit = 0; }
  strength = Math.min(strength, n); cardio = Math.max(0, n - strength - balance);
  hiit = Math.min(hiit, cardio); cardio -= hiit;
  // Interleave so hard sessions are not back to back
  const pool: DayType[] = [];
  const counts: Record<DayType, number> = { strength, cardio, balance, hiit };
  while (pool.length < n) {
    for (const t of ["strength", "cardio", "strength", "balance", "hiit", "cardio", "strength"] as DayType[]) {
      if (counts[t] > 0 && pool.length < n) { pool.push(t); counts[t]--; }
    }
    if (Object.values(counts).every((c) => c === 0)) break;
  }
  return pool;
}

const SLOTS: Record<DayType, { focus: string; kinds: Kind[] }> = {
  strength: { focus: "Strength", kinds: ["strength", "strength", "strength", "mobility"] },
  cardio: { focus: "Steady cardio", kinds: ["cardio", "balance", "mobility"] },
  balance: { focus: "Balance and mobility", kinds: ["balance", "mobility", "balance"] },
  hiit: { focus: "Intervals", kinds: ["cardio", "strength", "mobility"] },
};

export function planWeek(input: PlanInput): PlannedWeek {
  const eq: Equipment[] = input.equipment.length ? input.equipment : ["none"];
  const days = DAY_SETS[Math.max(1, Math.min(7, Math.round(input.daysPerWeek)))];
  const mix = weekMix(input);
  const used = new Map<string, number>();
  const hardOk = (week: number) => !input.boneCohort || week > 0; // gentle first session for the bone cohort
  const evidenceFor = (q: string, k = 2) => retrieve(q, k).map((r) => r.passage.id);
  const strengthQuery = input.boneCohort ? "bone strength resistance impact frequency postmenopause" : "strength general guideline muscle";
  const strengthSrc = evidenceFor(strengthQuery);
  const impactSrc = evidenceFor("impact bone frequency jumping");
  const cardioSrc = evidenceFor(input.goal === "manage_diabetes" ? "aerobic guideline diabetes cardio" : "cardio aerobic guideline general");
  const balanceSrc = evidenceFor("balance falls older gentle yoga pilates low-impact");

  const planned: PlannedDay[] = days.map((dayOfWeek, idx) => {
    const type = mix[idx] ?? "strength";
    const slot = SLOTS[type];
    const exercises: PlannedExercise[] = [];
    const taken = new Set<string>();
    slot.kinds.forEach((kind, s) => {
      if (type === "cardio" && s > 0 && input.daysPerWeek <= 2) return;
      let pool = L.filter((t) => t.kind === kind && available(t, eq) && !taken.has(t.id) && (!t.hard || hardOk(idx) || type === "hiit"));
      if (type === "hiit" && kind === "cardio") pool = pool.filter((t) => t.id === "sprint-intervals" || t.id === "gym-cardio" || t.styles.includes("hiit"));
      if (pool.length === 0) pool = L.filter((t) => t.kind === kind && available(t, eq) && !taken.has(t.id));
      if (pool.length === 0) return;
      const score = (t: Template) => (t.styles.some((st) => input.styles.includes(st)) ? 3 : 0) + (t.needs.length && !eq.includes("full_gym") ? 1 : 0) - (used.get(t.id) ?? 0) * 2;
      const pick = [...pool].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
      taken.add(pick.id); used.set(pick.id, (used.get(pick.id) ?? 0) + 1);
      const styleHit = pick.styles.find((st) => input.styles.includes(st));
      const eqNote = pick.needs.length ? ` using your ${pick.needs.filter((n) => eq.includes(n)).map((n) => EQUIP_LABEL[n]).join(" or ") || EQUIP_LABEL.full_gym}` : "";
      const forGoal = kind === "strength" || kind === "impact"
        ? input.boneCohort ? "for bone and muscle health" : input.goal === "build_muscle" ? "for muscle growth" : "for strength and metabolism"
        : kind === "cardio" ? (input.goal === "manage_diabetes" ? "for blood-sugar control" : "for heart health") : "for balance and recovery";
      const why = styleHit
        ? `Matches your pick of ${STYLE_LABEL[styleHit]}${eqNote}, ${forGoal}.`
        : `Added ${forGoal}, even though you picked ${input.styles.map((x) => STYLE_LABEL[x]).join(" and ") || "your favourites"}${eqNote}.`;
      const src = kind === "strength" ? strengthSrc : kind === "impact" ? impactSrc : kind === "cardio" ? cardioSrc : balanceSrc;
      exercises.push({ id: pick.id, name: pick.name, detail: pick.detail, burn: pick.burn, emoji: pick.emoji, rationale: why, why, cues: pick.cues, goodCue: pick.goodCue, kind, sources: src, formName: pick.formName });
    });
    // Bone cohort: finish strength days with a short impact block (if equipment/hardness allow)
    if (input.boneCohort && type === "strength") {
      const imp = L.filter((t) => t.kind === "impact" && available(t, eq) && (!t.hard || idx > 0)).sort((a, b) => (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) || a.id.localeCompare(b.id))[0];
      if (imp) { used.set(imp.id, (used.get(imp.id) ?? 0) + 1); exercises.push({ id: imp.id, name: imp.name, detail: imp.detail, burn: imp.burn, emoji: imp.emoji, rationale: "Short impact finisher for bone health, which resistance work alone doesn't provide.", why: "Short impact finisher for bone health, which resistance work alone doesn't provide.", cues: imp.cues, goodCue: imp.goodCue, kind: "impact", sources: impactSrc, formName: imp.formName }); }
    }
    return { dayOfWeek, focus: slot.focus, exercises };
  });

  const counts = { strength: 0, impact: 0, cardio: 0, balance: 0 };
  for (const d of planned) {
    if (d.exercises.some((e) => e.kind === "strength")) counts.strength++;
    if (d.exercises.some((e) => e.kind === "impact")) counts.impact++;
    if (d.exercises.some((e) => e.kind === "cardio")) counts.cardio++;
    if (d.exercises.some((e) => e.kind === "balance")) counts.balance++;
  }

  const query = [input.goal.replace("_", " "), input.boneCohort ? "bone menopause postmenopause strength impact frequency" : "general guideline", input.styles.join(" "), counts.balance ? "balance" : ""].join(" ");
  // Evidence shown with the plan: everything an exercise cites, ordered by relevance to this user, topped up to 3
  const cited = new Set(planned.flatMap((d) => d.exercises.flatMap((e) => e.sources)));
  const ranked = retrieve(query, 20).map((r) => r.passage);
  const evidence: Passage[] = [...ranked.filter((p) => cited.has(p.id)), ...ranked.filter((p) => !cited.has(p.id)).slice(0, Math.max(0, 3 - cited.size))].slice(0, 6);

  const notes: string[] = [];
  const styleStr = input.styles.map((s) => STYLE_LABEL[s]).join(", ") || "your favourites";
  notes.push(`Built for ${days.length} day${days.length > 1 ? "s" : ""} a week with ${eq.map((e) => EQUIP_LABEL[e]).join(", ")}; favouring ${styleStr}.`);
  if (input.boneCohort) notes.push(`Bone and muscle focus: ${counts.strength} strength day${counts.strength === 1 ? "" : "s"} and ${counts.impact} with impact work. Evidence suggests 2–3 strength sessions a week plus impact.`);
  const forced = input.styles.length > 0 && !input.styles.some((s) => s === "weight_training" || s === "calisthenics") && counts.strength > 0;
  if (forced) notes.push(`You picked ${styleStr}. We still added strength days because they matter most for ${input.boneCohort ? "bone and muscle" : "your goal"}.`);
  if (input.cyclePhase === "menstrual") notes.push("You're on your period: keep intensity gentle if you feel low on energy.");
  return { days: planned, evidence, notes, counts };
}

/** The first planned day, as a flat list (used for the "today" suggestions and the AI fallback). */
export function planDay(input: PlanInput): PlannedExercise[] {
  return planWeek({ ...input, daysPerWeek: Math.max(1, input.daysPerWeek) }).days[0]?.exercises ?? [];
}
