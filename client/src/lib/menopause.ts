/**
 * Glitch — Menopause intelligence
 *
 * - Staging from period history using STRAW+10 (Harlow et al., 2012): early transition = persistent
 *   ≥7-day difference between consecutive cycle lengths; late transition = ≥60 days without a period;
 *   postmenopause = 12 months after the final period. Early menopause < 45, premature (POI) < 40.
 * - Menopause Rating Scale (MRS; Heinemann et al.) — 11 symptoms scored 0–4 with somatic,
 *   psychological and urogenital subscales.
 * - "Warm nights" from WHOOP: WHOOP's API gives one skin-temperature value per night, so we can't see
 *   individual hot flashes — but a night well above the user's own baseline *plus* extra wake-ups or
 *   low sleep efficiency is a likely night-sweat night. Daytime flashes come from one-tap logging.
 * - Trigger analysis: hot flashes on days with alcohol, caffeine, spicy food, late meals or high stress.
 * - Training guidance built on menopause exercise evidence (e.g. the LIFTMOR trial: supervised heavy
 *   resistance + impact training improved bone density in postmenopausal women with low bone mass).
 *
 * Wellness insight only. Hormone therapy and other treatment decisions belong with a clinician.
 */
import type { DailyPhysiology } from "./whoop/types";

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

// ── Staging ──────────────────────────────────────────────────
export type MenoStage = "reproductive" | "early_transition" | "late_transition" | "early_postmenopause" | "late_postmenopause" | "unknown";

export interface StageResult {
  stage: MenoStage;
  label: string;
  explanation: string;
  /** Age at the final menstrual period, when known */
  ageAtFinalPeriod?: number;
  timing?: "premature" | "early" | "typical";
  monthsSinceLastPeriod?: number;
}

export const STAGE_LABEL: Record<MenoStage, string> = {
  reproductive: "Regular cycles",
  early_transition: "Early perimenopause",
  late_transition: "Late perimenopause",
  early_postmenopause: "Early post-menopause",
  late_postmenopause: "Post-menopause",
  unknown: "Not enough data yet",
};

export function stageMenopause(opts: { periodStarts: string[]; age: number; today: string; birthYearHint?: number }): StageResult {
  const starts = Array.from(new Set(opts.periodStarts)).sort();
  if (!starts.length) return { stage: "unknown", label: STAGE_LABEL.unknown, explanation: "Log your last period (even roughly) so we can place you on the menopause timeline." };

  const last = starts[starts.length - 1];
  const daysSince = Math.round((toMs(opts.today) - toMs(last)) / DAY);
  const monthsSince = Math.floor(daysSince / 30.44);
  const ageAtLast = Math.round((opts.age - daysSince / 365.25) * 10) / 10;
  const timing = (a: number): StageResult["timing"] => (a < 40 ? "premature" : a < 45 ? "early" : "typical");

  if (daysSince >= 365) {
    const late = daysSince >= 365 * 3; // STRAW+10 early postmenopause spans the first few years after FMP
    const stage: MenoStage = late ? "late_postmenopause" : "early_postmenopause";
    return {
      stage, label: STAGE_LABEL[stage], monthsSinceLastPeriod: monthsSince, ageAtFinalPeriod: ageAtLast, timing: timing(ageAtLast),
      explanation: `It's been ${monthsSince} months since your last period (12+ months means menopause has been reached). ${late ? "Symptoms often ease now, while heart and bone health become the focus." : "Hot flushes and sleep changes are still common in the first years."}`,
    };
  }
  if (daysSince >= 60) {
    return {
      stage: "late_transition", label: STAGE_LABEL.late_transition, monthsSinceLastPeriod: monthsSince,
      explanation: `${daysSince} days since your last period. A gap of 60+ days marks the late menopause transition, the time when hot flushes are usually most frequent.`,
    };
  }
  // Cycle-length variability needs at least 3 starts
  if (starts.length >= 3) {
    const lengths = starts.slice(1).map((s, i) => Math.round((toMs(s) - toMs(starts[i])) / DAY));
    const diffs = lengths.slice(1).map((l, i) => Math.abs(l - lengths[i]));
    const bigDiffs = diffs.filter((d) => d >= 7).length;
    if (bigDiffs >= 2 || (bigDiffs >= 1 && opts.age >= 40)) {
      return {
        stage: "early_transition", label: STAGE_LABEL.early_transition,
        explanation: `Your cycle lengths are shifting by 7+ days (${lengths.join(", ")} days). Persistent variability like this marks the early menopause transition.`,
      };
    }
    return { stage: "reproductive", label: STAGE_LABEL.reproductive, explanation: `Your cycles are fairly consistent (${lengths.join(", ")} days).` };
  }
  return { stage: opts.age >= 40 ? "unknown" : "reproductive", label: opts.age >= 40 ? STAGE_LABEL.unknown : STAGE_LABEL.reproductive, explanation: "Log a few more period starts to see if your cycles are changing." };
}

// ── Menopause Rating Scale ───────────────────────────────────
export const MRS_ITEMS = [
  { id: "hot_flushes", text: "Hot flushes, sweating", sub: "somatic" },
  { id: "heart", text: "Heart discomfort (racing, skipping, tightness)", sub: "somatic" },
  { id: "sleep", text: "Sleep problems", sub: "somatic" },
  { id: "depressive", text: "Low or depressive mood", sub: "psychological" },
  { id: "irritability", text: "Irritability", sub: "psychological" },
  { id: "anxiety", text: "Anxiety", sub: "psychological" },
  { id: "exhaustion", text: "Physical & mental exhaustion, brain fog", sub: "psychological" },
  { id: "sexual", text: "Sexual problems (desire, activity, satisfaction)", sub: "urogenital" },
  { id: "bladder", text: "Bladder problems", sub: "urogenital" },
  { id: "dryness", text: "Vaginal dryness", sub: "urogenital" },
  { id: "joints", text: "Joint & muscle aches", sub: "somatic" },
] as const;
export const MRS_OPTIONS = ["None", "Mild", "Moderate", "Severe", "Very severe"];

export interface MrsResult {
  date: string;
  total: number;            // 0–44
  somatic: number;          // 0–16
  psychological: number;    // 0–16
  urogenital: number;       // 0–12
  severity: "none" | "mild" | "moderate" | "severe";
  top: string[];            // highest-scoring symptoms
}

export function scoreMrs(answers: Record<string, number>, date: string): MrsResult {
  const sub = (k: string) => MRS_ITEMS.filter((i) => i.sub === k).reduce((a, i) => a + (answers[i.id] ?? 0), 0);
  const somatic = sub("somatic"), psychological = sub("psychological"), urogenital = sub("urogenital");
  const total = somatic + psychological + urogenital;
  // Published total-score bands: 0–4 none/little, 5–8 mild, 9–15 moderate, 16+ severe
  const severity = total <= 4 ? "none" : total <= 8 ? "mild" : total <= 15 ? "moderate" : "severe";
  const top = [...MRS_ITEMS].filter((i) => (answers[i.id] ?? 0) >= 2).sort((a, b) => (answers[b.id] ?? 0) - (answers[a.id] ?? 0)).slice(0, 3).map((i) => i.text);
  return { date, total, somatic, psychological, urogenital, severity, top };
}

// ── Warm nights (likely night sweats) ────────────────────────
export interface WarmNight {
  date: string;
  tempDelta: number;        // °C above the user's rolling baseline
  likely: boolean;          // warm AND disrupted
}

/** Each night's skin-temp delta vs the previous 14-night median; "likely" when ≥ +0.35 °C with disruption. */
export function warmNights(days: DailyPhysiology[], opts: { tempThreshold?: number } = {}): WarmNight[] {
  const tempThreshold = opts.tempThreshold ?? 0.35;
  const out: WarmNight[] = [];
  days.forEach((d, i) => {
    if (d.skinTemp == null || i < 7) return;
    const prev = days.slice(Math.max(0, i - 14), i).map((x) => x.skinTemp).filter((x): x is number => x != null).sort((a, b) => a - b);
    if (prev.length < 5) return;
    const median = prev[Math.floor(prev.length / 2)];
    const delta = +(d.skinTemp - median).toFixed(2);
    const priorDist = days.slice(Math.max(0, i - 14), i).map((x) => x.disturbances).filter((x): x is number => x != null);
    const disrupted = (d.disturbances != null && priorDist.length >= 5 && d.disturbances >= mean(priorDist) + 3)
      || (d.sleepEfficiency != null && d.sleepEfficiency < 82)
      || (d.sleepPerformance != null && d.sleepPerformance < 68);
    out.push({ date: d.date, tempDelta: delta, likely: delta >= tempThreshold && disrupted });
  });
  return out;
}

// ── Hot-flash log + triggers ─────────────────────────────────
export interface HotFlash {
  id: string;
  at: string;               // ISO timestamp
  intensity: 1 | 2 | 3;     // mild / moderate / severe
  night?: boolean;
}

export type TriggerKey = "alcohol" | "caffeine" | "spicy" | "late_meal" | "high_stress" | "warm_night";

const TRIGGER_WORDS: Record<"alcohol" | "caffeine" | "spicy", RegExp> = {
  alcohol: /\b(wine|beer|cocktail|prosecco|champagne|vodka|gin|whisk(e)?y|rum|tequila|margarita|sangria|cider|alcohol)\b/i,
  caffeine: /\b(coffee|espresso|latte|cappuccino|americano|cold brew|energy drink|matcha|black tea|cola|mocha)\b/i,
  spicy: /\b(spicy|chili|chilli|curry|jalape(n|ñ)o|sriracha|hot sauce|vindaloo|szechuan|sichuan|buffalo|harissa|kimchi)\b/i,
};

export interface TriggerFinding {
  trigger: TriggerKey;
  label: string;
  withAvg: number;          // flashes/day on trigger days
  withoutAvg: number;
  ratio: number;
  days: number;             // trigger days observed
  /** One-sided permutation-test p-value for "more flashes on trigger days" */
  pValue: number;
  /** Benjamini–Hochberg adjusted p-value across every trigger tested */
  qValue: number;
}

const TRIGGER_LABEL: Record<TriggerKey, string> = {
  alcohol: "Alcohol", caffeine: "Caffeine", spicy: "Spicy food", late_meal: "Eating after 8 pm", high_stress: "High-stress days", warm_night: "After a warm night",
};

/** One-sided permutation test: how often does shuffling day labels give a mean difference at least this big? */
export function permutationP(withVals: number[], withoutVals: number[], perms = 2000, seed = 17): number {
  const all = [...withVals, ...withoutVals];
  const n = withVals.length;
  const observed = mean(withVals) - mean(withoutVals);
  let s = seed >>> 0;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  let extreme = 0;
  const pool = all.slice();
  for (let p = 0; p < perms; p++) {
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    if (mean(pool.slice(0, n)) - mean(pool.slice(n)) >= observed - 1e-12) extreme++;
  }
  return (extreme + 1) / (perms + 1);
}

/** Benjamini–Hochberg false-discovery-rate adjustment. Returns q-values in the input order. */
export function benjaminiHochberg(ps: number[]): number[] {
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(ps.length);
  let prev = 1;
  for (let k = order.length - 1; k >= 0; k--) {
    prev = Math.min(prev, (order[k][0] * order.length) / (k + 1));
    q[order[k][1]] = prev;
  }
  return q;
}

/**
 * Compare hot-flash frequency on days with vs without each trigger. Needs ≥3 trigger days and
 * ≥3 non-trigger days. A trigger is reported only if the difference is ≥1.5× AND survives a
 * permutation test with Benjamini–Hochberg correction across all six candidates (q ≤ 0.10),
 * so a lucky streak of three bad days is not mistaken for a pattern.
 */
export function hotFlashTriggers(
  flashes: HotFlash[],
  meals: { name: string; loggedAt?: string }[],
  stressByDay: Map<string, "low" | "moderate" | "high">,
  warm: WarmNight[],
  dayList: string[],
): TriggerFinding[] {
  const flashCount = new Map<string, number>();
  for (const f of flashes) flashCount.set(f.at.slice(0, 10), (flashCount.get(f.at.slice(0, 10)) ?? 0) + 1);
  const mealsByDay = new Map<string, { name: string; hour: number }[]>();
  for (const m of meals) {
    if (!m.loggedAt) continue;
    const d = m.loggedAt.slice(0, 10);
    mealsByDay.set(d, [...(mealsByDay.get(d) ?? []), { name: m.name, hour: new Date(m.loggedAt).getHours() }]);
  }
  const warmSet = new Set(warm.filter((w) => w.likely).map((w) => w.date));

  const has: Record<TriggerKey, (d: string) => boolean> = {
    alcohol: (d) => (mealsByDay.get(d) ?? []).some((m) => TRIGGER_WORDS.alcohol.test(m.name)),
    caffeine: (d) => (mealsByDay.get(d) ?? []).some((m) => TRIGGER_WORDS.caffeine.test(m.name)),
    spicy: (d) => (mealsByDay.get(d) ?? []).some((m) => TRIGGER_WORDS.spicy.test(m.name)),
    late_meal: (d) => (mealsByDay.get(d) ?? []).some((m) => m.hour >= 20),
    high_stress: (d) => stressByDay.get(d) === "high",
    warm_night: (d) => warmSet.has(d),
  };

  const tested: { k: TriggerKey; w: number; wo: number; ratio: number; days: number; p: number }[] = [];
  (Object.keys(has) as TriggerKey[]).forEach((k) => {
    const withD = dayList.filter(has[k]);
    const withoutD = dayList.filter((d) => !has[k](d));
    if (withD.length < 3 || withoutD.length < 3) return;
    const wv = withD.map((d) => flashCount.get(d) ?? 0), wov = withoutD.map((d) => flashCount.get(d) ?? 0);
    const w = mean(wv), wo = mean(wov);
    const ratio = wo > 0 ? w / wo : w > 0 ? 9 : 1;
    tested.push({ k, w, wo, ratio, days: withD.length, p: permutationP(wv, wov) });
  });
  const q = benjaminiHochberg(tested.map((t) => t.p));
  const findings: TriggerFinding[] = [];
  tested.forEach((t, i) => {
    if (t.ratio >= 1.5 && t.w - t.wo >= 0.5 && q[i] <= 0.1)
      findings.push({ trigger: t.k, label: TRIGGER_LABEL[t.k], withAvg: +t.w.toFixed(1), withoutAvg: +t.wo.toFixed(1), ratio: +t.ratio.toFixed(1), days: t.days, pValue: +t.p.toFixed(3), qValue: +q[i].toFixed(3) });
  });
  return findings.sort((a, b) => b.ratio - a.ratio);
}

// ── Training ─────────────────────────────────────────────────
export interface TrainingDay {
  focus: string;
  emoji: string;
  session: string[];
  why: string;
}

export interface MenoTraining {
  today: TrainingDay;
  adjusted: string | null;  // why today's plan was changed
  week: { day: string; focus: string; emoji: string }[];
  nutrition: string[];
}

const WEEK: { day: string; focus: string; emoji: string }[] = [
  { day: "Mon", focus: "Heavy strength", emoji: "🏋️" },
  { day: "Tue", focus: "Zone 2 cardio", emoji: "🚶‍♀️" },
  { day: "Wed", focus: "Impact + power", emoji: "🦘" },
  { day: "Thu", focus: "Heavy strength", emoji: "🏋️" },
  { day: "Fri", focus: "Sprint intervals", emoji: "⚡" },
  { day: "Sat", focus: "Zone 2 + balance", emoji: "🧘" },
  { day: "Sun", focus: "Rest & mobility", emoji: "🌿" },
];

const SESSIONS: Record<string, TrainingDay> = {
  "Heavy strength": { focus: "Heavy strength", emoji: "🏋️", session: ["Squat or goblet squat 5×5", "Deadlift or hip hinge 5×5", "Overhead or push press 5×5", "Heavy enough that the last rep is hard; build up gradually, ideally with a coach"], why: "Heavy lifting is the strongest exercise signal for bone and muscle after menopause; in the LIFTMOR trial it improved bone density in postmenopausal women with low bone mass." },
  "Zone 2 cardio": { focus: "Zone 2 cardio", emoji: "🚶‍♀️", session: ["30–45 min brisk walk, cycle or swim", "Conversational pace (WHOOP zone 2)"], why: "Heart-disease risk rises after menopause; steady aerobic work lowers resting heart rate and blood pressure and improves insulin sensitivity." },
  "Impact + power": { focus: "Impact + power", emoji: "🦘", session: ["Jump-landings or skipping 3×10", "Step-ups with a drive 3×8 each leg", "Medicine-ball throws or fast push-ups 3×8"], why: "Short impacts load the hip and spine, which bones need to stay strong. Start small if you're new or have pelvic-floor concerns." },
  "Sprint intervals": { focus: "Sprint intervals", emoji: "⚡", session: ["Warm up 5 min", "6 × 20–30 s hard (bike, hill or rower), 90 s easy", "Cool down 5 min"], why: "Brief sprints improve VO₂max and blood-sugar control in less time than long cardio, which matters as metabolism shifts after menopause." },
  "Zone 2 + balance": { focus: "Zone 2 + balance", emoji: "🧘", session: ["30 min easy cardio", "Single-leg balance 3×30 s each side", "Heel-to-toe walk, step-overs"], why: "Balance training reduces fall risk, which matters as bone density declines." },
  "Rest & mobility": { focus: "Rest & mobility", emoji: "🌿", session: ["10–20 min mobility or yoga", "Easy walk outside"], why: "Recovery is where adaptation happens, and good sleep is precious in menopause." },
};

/** Weekly menopause plan with today's session adjusted for recovery and night sweats. */
export function menopauseTraining(opts: { weekday: number; recovery: number | null; warmNightLastNight: boolean; weightKg: number }): MenoTraining {
  const planned = WEEK[(opts.weekday + 6) % 7]; // JS Sunday=0 → our Monday-first week
  let today = SESSIONS[planned.focus];
  let adjusted: string | null = null;
  const heavy = planned.focus === "Heavy strength" || planned.focus === "Sprint intervals" || planned.focus === "Impact + power";
  if (heavy && opts.warmNightLastNight) {
    today = SESSIONS["Zone 2 cardio"];
    adjusted = "Last night looks like a night-sweat night, so heavy work moves to tomorrow. Easy cardio today keeps you moving without digging a hole.";
  } else if (heavy && opts.recovery != null && opts.recovery < 34) {
    today = SESSIONS["Rest & mobility"];
    adjusted = `Recovery is ${opts.recovery}%. Swap intensity for mobility today; lift when your body is ready.`;
  }
  const protein = Math.round(opts.weightKg * 1.2);
  return {
    today, adjusted, week: WEEK,
    nutrition: [
      `Protein: about ${protein}–${Math.round(opts.weightKg * 1.6)} g/day, spread across meals (muscle gets harder to keep after menopause)`,
      "Calcium-rich foods + vitamin D for bone",
      "Fibre and fewer ultra-processed carbs: insulin sensitivity drops after menopause",
      "Alcohol, caffeine and spicy food are common hot-flush triggers; Glitch checks your own pattern",
    ],
  };
}

// ── Clinician talking points ─────────────────────────────────
export function clinicianPoints(stage: StageResult, mrs: MrsResult | null, likelyWarmNights14: number): string[] {
  const pts: string[] = [];
  if (stage.timing === "premature") pts.push("Your last period was before 40. Premature menopause (POI) should be assessed by a doctor; treatment can protect your heart and bones.");
  else if (stage.timing === "early") pts.push("Your last period was before 45 (early menopause). Ask your doctor about heart and bone protection, including whether hormone therapy is right for you.");
  if (mrs && (mrs.severity === "moderate" || mrs.severity === "severe")) pts.push(`Your symptom score is ${mrs.severity} (MRS ${mrs.total}/44). Effective treatments exist, hormonal and non-hormonal; it's worth a conversation.`);
  if (likelyWarmNights14 >= 5) pts.push(`${likelyWarmNights14} likely night-sweat nights in the last two weeks. Bring this data to your appointment.`);
  if (stage.stage === "early_postmenopause" || stage.stage === "late_postmenopause") pts.push("Ask about a bone-density scan and a lipid/blood-sugar check; both risks rise after menopause.");
  pts.push("Any bleeding after 12 months without a period should always be checked.");
  return pts;
}
