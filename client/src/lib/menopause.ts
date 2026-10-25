/**
 * Glitch — Menopause intelligence
 *
 * - Staging from period history using STRAW+10 (Harlow et al., 2012): early transition = persistent
 *   ≥7-day difference between consecutive cycle lengths; late transition = ≥60 days without a period;
 *   postmenopause = 12 months after the final period; early postmenopause lasts ~5–8 years (we use 6).
 *   Early menopause < 45, premature (POI) < 40. Evidence: evidence.ts "straw10-staging".
 * - Menopause Rating Scale (MRS; Heinemann et al.) — 11 symptoms scored 0–4 with somatic,
 *   psychological and urogenital subscales.
 * - "Warm nights" from WHOOP: WHOOP's API gives one skin-temperature value per night, so we can't see
 *   individual hot flashes — but a night well above the user's own baseline *plus* extra wake-ups or
 *   low sleep efficiency is a *possible* night-sweat night. This heuristic is NOT validated against
 *   sternal skin conductance (evidence.ts "wearable-hot-flash-detection"), so the UI calls it an
 *   estimate. Daytime flashes come from one-tap logging.
 * - Trigger analysis (n-of-1): per-trigger Poisson rate ratio + 95% CI and a seeded permutation test,
 *   Benjamini–Hochberg FDR across triggers. Association in the user's own logs, not proof of cause.
 * - Training guidance built on menopause exercise evidence (e.g. the LIFTMOR trial: *supervised* heavy
 *   resistance + impact training improved bone density in postmenopausal women with low bone mass;
 *   meta-analyses show smaller gains from all exercise types). See evidence.ts.
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
    // STRAW+10: early postmenopause (+1a/+1b ≈ 2 y, +1c ≈ 3–6 y) lasts ~5–8 years after the FMP.
    // We use 6 years as an approximate cut-off (evidence.ts "straw10-staging").
    const late = daysSince >= 365 * 6;
    const stage: MenoStage = late ? "late_postmenopause" : "early_postmenopause";
    return {
      stage, label: STAGE_LABEL[stage], monthsSinceLastPeriod: monthsSince, ageAtFinalPeriod: ageAtLast, timing: timing(ageAtLast),
      explanation: `It's been ${monthsSince} months since your last period (12+ months means menopause has been reached). ${late ? "For many women symptoms ease by now, while heart and bone health become the focus." : "Hot flushes are most likely in the first couple of years after the final period, and sleep changes are common too."}`,
    };
  }
  if (daysSince >= 60) {
    return {
      stage: "late_transition", label: STAGE_LABEL.late_transition, monthsSinceLastPeriod: monthsSince,
      explanation: `${daysSince} days since your last period. A gap of 60+ days marks the late menopause transition. Hot flushes are common now and are most likely in the first couple of years after your final period.`,
    };
  }
  // Cycle-length variability needs at least 3 starts
  if (starts.length >= 3) {
    const lengths = starts.slice(1).map((s, i) => Math.round((toMs(s) - toMs(starts[i])) / DAY));
    const diffs = lengths.slice(1).map((l, i) => Math.abs(l - lengths[i]));
    const bigDiffs = diffs.filter((d) => d >= 7).length;
    // STRAW+10 requires the 7+ day difference to recur within 10 cycles and does not use age.
    // Product choice: with only a few logged cycles we accept a single 7+ day shift at age ≥ 40, so
    // this is an approximation and the user text says so.
    if (bigDiffs >= 2 || (bigDiffs >= 1 && opts.age >= 40)) {
      return {
        stage: "early_transition", label: STAGE_LABEL.early_transition,
        explanation: `Your cycle lengths are shifting by 7+ days (${lengths.join(", ")} days). When this keeps recurring it marks the early menopause transition; with only a few cycles logged this is an estimate.`,
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
  // Total-score bands verified against Heinemann et al. 2004 (PMID 15345062, Table 6):
  // 0–4 no/little, 5–8 mild, 9–16 moderate, 17+ severe.
  const severity = total <= 4 ? "none" : total <= 8 ? "mild" : total <= 16 ? "moderate" : "severe";
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
export function warmNights(days: DailyPhysiology[]): WarmNight[] {
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
    out.push({ date: d.date, tempDelta: delta, likely: delta >= 0.35 && disrupted });
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
  ratio: number;            // Poisson rate ratio (with / without)
  days: number;             // trigger days observed
  withoutDays: number;
  ciLow: number;            // 95% CI of the rate ratio
  ciHigh: number;
  pValue: number;           // one-sided permutation test (more flashes on trigger days)
  qValue: number;           // Benjamini–Hochberg adjusted across the triggers tested
  significant: boolean;     // qValue < TRIGGER_FDR && ciLow > 1
}

const TRIGGER_LABEL: Record<TriggerKey, string> = {
  alcohol: "Alcohol", caffeine: "Caffeine", spicy: "Spicy food", late_meal: "Eating after 8 pm", high_stress: "High-stress days", warm_night: "After a warm night",
};

/** ≥5 days in each group: below that a single odd day dominates the mean and the CI is meaningless. */
export const TRIGGER_MIN_DAYS = 5;
/** False-discovery rate: at most ~1 in 10 flagged triggers expected to be noise. */
export const TRIGGER_FDR = 0.1;
const PERMUTATIONS = 2000;

/** Seeded PRNG (mulberry32), so permutation p-values are stable across renders and in tests. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * One-sided permutation test: shuffle which days carry the trigger label and count how often the
 * shuffled trigger-day total is ≥ the observed one. With group sizes fixed that's equivalent to the
 * difference in means. (1 + hits) / (1 + B) so p is never exactly 0.
 */
export function permutationPValue(counts: number[], isTrigger: boolean[], seed: number, b = PERMUTATIONS): number {
  const k = isTrigger.filter(Boolean).length;
  const obs = counts.reduce((s, c, i) => s + (isTrigger[i] ? c : 0), 0);
  const xs = counts.slice();
  const rand = mulberry32(seed);
  let hits = 0;
  for (let r = 0; r < b; r++) {
    // partial Fisher–Yates: first k slots are a uniform random trigger-day set
    let s = 0;
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rand() * (xs.length - i));
      [xs[i], xs[j]] = [xs[j], xs[i]];
      s += xs[i];
    }
    if (s >= obs - 1e-9) hits++;
  }
  return (1 + hits) / (1 + b);
}

/** Benjamini–Hochberg step-up q-values, returned in input order. */
export function benjaminiHochberg(ps: number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(m);
  let min = 1;
  for (let r = m - 1; r >= 0; r--) {
    min = Math.min(min, (order[r][0] * m) / (r + 1));
    q[order[r][1]] = min;
  }
  return q;
}

/**
 * n-of-1 trigger analysis on the user's own days. Per trigger: Poisson rate ratio of daily flash counts
 * (with vs without) with a Wald 95% CI on log-RR (0.5 added to both totals if either is zero), plus a
 * one-sided permutation p-value; then Benjamini–Hochberg across the triggers that had enough days.
 * A trigger is `significant` only if q < 0.10 AND the CI excludes 1. Returns every tested trigger,
 * significant first, so the UI can be honest about "tested, no clear link yet".
 * Caveats: association not causation; days are treated as exchangeable (ignores day-to-day carry-over).
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

  const counts = dayList.map((d) => flashCount.get(d) ?? 0);
  const labels = {} as Record<TriggerKey, boolean[]>;
  (Object.keys(has) as TriggerKey[]).forEach((k) => { labels[k] = dayList.map(has[k]); });
  return analyzeTriggerCounts(counts, labels);
}

/** Rate ratio, Wald 95% CI on log-RR (0.5 continuity correction) and permutation p for one trigger. */
function testTrigger(counts: number[], lab: boolean[], seed: number, perms = PERMUTATIONS) {
  const nW = lab.filter(Boolean).length, nWo = lab.length - nW;
  let a = 0, b = 0;
  counts.forEach((c, i) => { if (lab[i]) a += c; else b += c; });
  const w = a / nW, wo = b / nWo;
  const p = a + b > 1 ? permutationPValue(counts, lab, seed, perms) : 1;
  if (a === 0 || b === 0) { a += 0.5; b += 0.5; } // continuity correction
  const rr = (a / nW) / (b / nWo);
  const se = Math.sqrt(1 / a + 1 / b);
  return { nW, nWo, w, wo, rr, ciLow: rr * Math.exp(-1.96 * se), ciHigh: rr * Math.exp(1.96 * se), p };
}

/** Core of hotFlashTriggers on daily counts + per-trigger day labels (also used by scripts/trigger_power_table.ts). */
export function analyzeTriggerCounts(counts: number[], labels: Partial<Record<TriggerKey, boolean[]>>, perms = PERMUTATIONS): TriggerFinding[] {
  const tested: Omit<TriggerFinding, "qValue" | "significant">[] = [];
  (Object.keys(labels) as TriggerKey[]).forEach((k) => {
    const lab = labels[k]!;
    const nW = lab.filter(Boolean).length;
    if (nW < TRIGGER_MIN_DAYS || lab.length - nW < TRIGGER_MIN_DAYS) return;
    const t = testTrigger(counts, lab, seedOf(k), perms);
    tested.push({
      trigger: k, label: TRIGGER_LABEL[k], withAvg: +t.w.toFixed(1), withoutAvg: +t.wo.toFixed(1),
      ratio: t.rr, days: t.nW, withoutDays: t.nWo, ciLow: t.ciLow, ciHigh: t.ciHigh, pValue: t.p,
    });
  });
  const q = benjaminiHochberg(tested.map((t) => t.pValue));
  return tested
    .map((t, i) => ({
      ...t, significant: q[i] < TRIGGER_FDR && t.ciLow > 1,
      ratio: +t.ratio.toFixed(1), ciLow: +t.ciLow.toFixed(2), ciHigh: +t.ciHigh.toFixed(2), pValue: +t.pValue.toFixed(4), qValue: +q[i].toFixed(4),
    }))
    .sort((x, y) => Number(y.significant) - Number(x.significant) || y.ratio - x.ratio);
}

// ── Trigger power (how much logging is enough?) ──────────────
/** Poisson draw (Knuth; fine for the ≤ ~30/day rates we simulate). */
export function poissonDraw(lambda: number, rand: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = rand();
  while (p > L) { k++; p *= rand(); }
  return k;
}

export interface PowerOpts {
  baseRate: number;         // flashes/day on non-trigger days
  rateRatio: number;        // true effect of the trigger
  triggerShare: number;     // fraction of days with the trigger (e.g. 0.3)
  days: number;
  sims?: number;            // default 200
  perms?: number;           // permutations per sim, default 200
  tests?: number;           // triggers tested alongside (BH approximation), default 6
  seed?: number;
}

/**
 * Simulated power of the trigger test: Poisson daily counts, a fixed round(share·days) trigger days,
 * detected when permutation p < 0.10/tests AND CI lower bound > 1. BH is approximated by its threshold
 * for the smallest p among `tests` triggers (= Bonferroni): exact when the other triggers are null and
 * otherwise conservative, since BH is never stricter than that. tests = 1 gives the single-test power.
 * 200 sims × 200 permutations → ±~3.5% Monte-Carlo error. Seeded; deterministic.
 */
export function triggerPower(o: PowerOpts): number {
  const sims = o.sims ?? 200, perms = o.perms ?? 200, alpha = TRIGGER_FDR / (o.tests ?? 6);
  const k = Math.round(o.triggerShare * o.days);
  if (k < TRIGGER_MIN_DAYS || o.days - k < TRIGGER_MIN_DAYS) return 0;
  const rand = mulberry32(o.seed ?? 20261024);
  const lab = Array.from({ length: o.days }, (_, i) => i < k);
  let hits = 0;
  for (let s = 0; s < sims; s++) {
    const counts = lab.map((t) => poissonDraw(o.baseRate * (t ? o.rateRatio : 1), rand));
    const r = testTrigger(counts, lab, (rand() * 4294967296) >>> 0, perms);
    if (r.p < alpha && r.ciLow > 1) hits++;
  }
  return hits / sims;
}

const daysCache = new Map<string, number | null>();
/**
 * Smallest number of logged days (14–180) at which triggerPower ≥ target, or null if never.
 * Binary search (power rises with days, up to Monte-Carlo noise); memoized per parameter set.
 */
export function daysNeeded(o: { baseRate: number; rateRatio: number; triggerShare: number; target?: number }): number | null {
  const target = o.target ?? 0.8;
  const key = `${o.baseRate}|${o.rateRatio}|${o.triggerShare}|${target}`;
  if (daysCache.has(key)) return daysCache.get(key)!;
  const ok = (d: number) => triggerPower({ ...o, days: d }) >= target;
  let lo = 14, hi = 180, ans: number | null = null;
  if (ok(lo)) ans = lo;
  else if (ok(hi)) {
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ok(mid)) hi = mid; else lo = mid; }
    ans = hi;
  }
  daysCache.set(key, ans);
  return ans;
}

/** "2.1× more flashes (95% CI 1.4–3.0)" — one formatter for every place a trigger is shown. */
export function triggerEffect(t: TriggerFinding): string {
  const f = (x: number) => (x < 1.1 && x > 0.9 ? x.toFixed(2) : x.toFixed(1));
  return `${t.ratio}× more flashes (95% CI ${f(t.ciLow)}–${f(t.ciHigh)})`;
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
  "Heavy strength": { focus: "Heavy strength", emoji: "🏋️", session: ["Squat or goblet squat 5×5", "Deadlift or hip hinge 5×5", "Overhead or push press 5×5", "Start light and learn the lifts with a coach or physio; build up over weeks until the last rep is hard"], why: "Heavier, well-coached lifting gives bone a stronger signal than lighter exercise. In the LIFTMOR trial, supervised heavy lifting plus impact work improved bone density in postmenopausal women with low bone mass." },
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
    adjusted = "Last night looks like a possible night-sweat night, so heavy work moves to tomorrow. Easy cardio today keeps you moving without digging a hole.";
  } else if (heavy && opts.recovery != null && opts.recovery < 34) {
    today = SESSIONS["Rest & mobility"];
    adjusted = `Recovery is ${opts.recovery}%. Swap intensity for mobility today; lift when your body is ready.`;
  }
  // ~1–1.2 g/kg/day: European guidance for women over 50 cites ≥1 g/kg (evidence.ts "protein-intake-bone").
  const protein = Math.round(opts.weightKg * 1.0);
  return {
    today, adjusted, week: WEEK,
    nutrition: [
      `Protein: about ${protein}–${Math.round(opts.weightKg * 1.2)} g/day, spread across meals (muscle gets harder to keep after menopause)`,
      "Calcium-rich foods + vitamin D for bone",
      "Fibre and fewer ultra-processed carbs: insulin sensitivity drops after menopause",
      "Some women notice alcohol, caffeine or spicy food sets off hot flushes; the research is mixed, so your own logs will tell",
    ],
  };
}

// ── Clinician talking points ─────────────────────────────────
export function clinicianPoints(stage: StageResult, mrs: MrsResult | null, likelyWarmNights14: number): string[] {
  const pts: string[] = [];
  if (stage.timing === "premature") pts.push("Your last period was before 40. Premature menopause (POI) should be assessed by a doctor; treatment can protect your heart and bones.");
  else if (stage.timing === "early") pts.push("Your last period was before 45 (early menopause). Ask your doctor about heart and bone protection, including whether hormone therapy is right for you.");
  if (mrs && (mrs.severity === "moderate" || mrs.severity === "severe")) pts.push(`Your symptom score is ${mrs.severity} (MRS ${mrs.total}/44). Effective treatments exist, hormonal and non-hormonal; it's worth a conversation.`);
  if (likelyWarmNights14 >= 5) pts.push(`${likelyWarmNights14} possible night-sweat nights in the last two weeks (estimated from skin temperature and broken sleep; not a validated measure). Bring this to your appointment.`);
  if (stage.stage === "early_postmenopause" || stage.stage === "late_postmenopause") pts.push("Ask about a bone-density scan and a lipid/blood-sugar check; both risks rise after menopause.");
  pts.push("Any bleeding after 12 months without a period should always be checked.");
  return pts;
}
