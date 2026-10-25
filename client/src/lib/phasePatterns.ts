/**
 * Glitch — "your pattern, not the textbook's": n-of-1 analysis of daily check-ins by cycle phase.
 *
 * Population studies find only small, inconsistent average effects of cycle phase on performance and
 * mood, but individual women can differ a lot. So instead of telling everyone "you'll be weak in your
 * luteal phase", we test each woman's own logs: for every metric × phase, compare days in that phase
 * with all other days (two-sided permutation test on the mean difference), then Benjamini–Hochberg
 * across every comparison. A pattern is shown only if q < 0.10 AND the difference is ≥ 0.5 points on
 * the 1–5 scale, so a few odd days can't create a "finding".
 *
 * Caveats (shown in the UI): association, not cause; days are treated as exchangeable; phase is
 * estimated from the calendar unless ovulation is confirmed.
 */
import type { CyclePhase, CycleSymptomEntry } from "@/contexts/AppContext";
import { benjaminiHochberg, permutationPValue } from "./menopause";

export type PhaseMetric = "energy" | "mood" | "cravings" | "cramps" | "workout" | "sleepQuality" | "stress";

export const PHASE_METRICS: { key: PhaseMetric; label: string; higherIsBetter: boolean }[] = [
  { key: "energy", label: "Energy", higherIsBetter: true },
  { key: "mood", label: "Mood", higherIsBetter: true },
  { key: "workout", label: "Workout strength", higherIsBetter: true },
  { key: "cravings", label: "Cravings", higherIsBetter: false },
  { key: "cramps", label: "Cramps", higherIsBetter: false },
  { key: "sleepQuality", label: "Sleep", higherIsBetter: true },
  { key: "stress", label: "Stress", higherIsBetter: false },
];

export const PHASES: CyclePhase[] = ["menstrual", "follicular", "ovulation", "luteal"];
export const PHASE_LABEL: Record<CyclePhase, string> = { menstrual: "period", follicular: "follicular phase", ovulation: "ovulation window", luteal: "luteal phase" };

/** ≥4 logged days in the phase and ≥4 outside it before a phase is tested. */
export const PHASE_MIN_DAYS = 4;
export const PHASE_FDR = 0.1;
/** Smallest difference (points on the 1–5 scale) worth telling someone about. */
export const PHASE_MIN_DIFF = 0.5;
const PERMS = 1000;

export interface PhaseFinding {
  metric: PhaseMetric;
  label: string;
  phase: CyclePhase;
  phaseMean: number;
  otherMean: number;
  /** phaseMean − otherMean */
  diff: number;
  phaseDays: number;
  otherDays: number;
  pValue: number;
  qValue: number;
  significant: boolean;
  /** true when the difference is in the "harder" direction (lower energy, more cramps…) */
  harder: boolean;
}

export interface PhaseReport {
  /** Every comparison that had enough days, significant first */
  tested: PhaseFinding[];
  significant: PhaseFinding[];
  loggedDays: number;
  /** Phases that still need more logged days before they can be tested */
  needMore: { phase: CyclePhase; have: number }[];
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const valueOf = (e: CycleSymptomEntry, m: PhaseMetric): number | undefined => (e as unknown as Record<string, number | undefined>)[m];
const seedOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Two-sided permutation p: twice the smaller one-sided p, capped at 1. */
function twoSidedP(vals: number[], inPhase: boolean[], seed: number): number {
  const hi = permutationPValue(vals, inPhase, seed, PERMS);
  const lo = permutationPValue(vals.map((v) => -v), inPhase, seed, PERMS);
  return Math.min(1, 2 * Math.min(hi, lo));
}

export function analyzePhasePatterns(log: CycleSymptomEntry[], phaseOf: (cycleDay: number) => CyclePhase): PhaseReport {
  const days = log.filter((e) => e.cycleDay > 0);
  const phases = days.map((e) => phaseOf(e.cycleDay));
  const raw: Omit<PhaseFinding, "qValue" | "significant">[] = [];
  const needMore: PhaseReport["needMore"] = [];

  for (const phase of PHASES) {
    const have = phases.filter((p) => p === phase).length;
    if (have < PHASE_MIN_DAYS) needMore.push({ phase, have });
  }

  for (const m of PHASE_METRICS) {
    const rows = days.map((e, i) => ({ v: valueOf(e, m.key), p: phases[i] })).filter((r): r is { v: number; p: CyclePhase } => typeof r.v === "number" && r.v > 0);
    for (const phase of PHASES) {
      const inPhase = rows.map((r) => r.p === phase);
      const nIn = inPhase.filter(Boolean).length;
      if (nIn < PHASE_MIN_DAYS || rows.length - nIn < PHASE_MIN_DAYS) continue;
      const vals = rows.map((r) => r.v);
      const phaseMean = mean(vals.filter((_, i) => inPhase[i]));
      const otherMean = mean(vals.filter((_, i) => !inPhase[i]));
      const diff = phaseMean - otherMean;
      raw.push({
        metric: m.key, label: m.label, phase, phaseMean, otherMean, diff, phaseDays: nIn, otherDays: rows.length - nIn,
        pValue: twoSidedP(vals, inPhase, seedOf(m.key + phase)), harder: m.higherIsBetter ? diff < 0 : diff > 0,
      });
    }
  }

  const q = benjaminiHochberg(raw.map((r) => r.pValue));
  const tested: PhaseFinding[] = raw.map((r, i) => ({ ...r, qValue: q[i], significant: q[i] < PHASE_FDR && Math.abs(r.diff) >= PHASE_MIN_DIFF }));
  tested.sort((a, b) => Number(b.significant) - Number(a.significant) || Math.abs(b.diff) - Math.abs(a.diff));
  return { tested, significant: tested.filter((t) => t.significant), loggedDays: days.length, needMore };
}

/** One plain sentence for a finding, e.g. "Energy is 1.2 points lower in your luteal phase (12 days logged)". */
export function describeFinding(f: PhaseFinding): string {
  const dir = f.diff < 0 ? "lower" : "higher";
  return `${f.label} is ${Math.abs(f.diff).toFixed(1)} points ${dir} in your ${PHASE_LABEL[f.phase]} (${f.phaseDays} days logged)`;
}

export interface TodayAdvice { emoji: string; title: string; body: string; evidenceId?: string }

/**
 * What to do today, driven by HER significant findings for the current phase. With no findings we
 * don't assume the textbook pattern: we say so and keep her plan as is.
 */
export function adviceForToday(phase: CyclePhase, report: PhaseReport): TodayAdvice[] {
  const mine = report.significant.filter((f) => f.phase === phase && f.harder);
  const has = (m: PhaseMetric) => mine.some((f) => f.metric === m);
  const out: TodayAdvice[] = [];
  if (has("workout") || has("energy"))
    out.push({ emoji: "🏋️", title: "Train, just lighter", body: `Your own logs show lower ${has("workout") ? "workout strength" : "energy"} in your ${PHASE_LABEL[phase]}. Keep the session, drop a set or about 10% of the weight, and count showing up as the win.`, evidenceId: "cycle-phase-performance-small" });
  if (has("cravings"))
    out.push({ emoji: "🍫", title: "Plan for cravings, don't fight them", body: "Cravings run higher for you in this phase. Put a protein + fibre snack where you'll see it, and a planned treat is fine.", evidenceId: "luteal-energy-intake-higher" });
  if (has("mood"))
    out.push({ emoji: "💛", title: "This dip is a pattern, not a failure", body: "Your mood tends to drop in this phase. Lower the bar for today. If low mood regularly disrupts your life before your period, raise it with a clinician: PMDD affects about 3 in 100 women.", evidenceId: "premenstrual-mood-symptoms" });
  if (has("cramps"))
    out.push({ emoji: "🔥", title: "Ease the cramps", body: "Heat and gentle movement help many people. Pain that stops you doing normal things isn't something to push through; endometriosis is often missed, so tell a clinician." });
  if (has("sleepQuality"))
    out.push({ emoji: "🌙", title: "Protect sleep tonight", body: "Your sleep tends to be worse in this phase. Keep a steady bedtime and go easy on late caffeine." });
  if (!out.length)
    out.push(report.significant.length || report.loggedDays >= 28
      ? { emoji: "✅", title: "Train as planned", body: `Your logs show no clear dip in your ${PHASE_LABEL[phase]}, so there's no reason to hold back. Many women don't follow the textbook pattern.`, evidenceId: "cycle-phase-strength-no-clear-effect" }
      : { emoji: "📓", title: "Still learning your pattern", body: `Research finds only small average effects of cycle phase, and women differ. Keep checking in (${report.loggedDays} days so far) and Glitch will tell you what's true for you.`, evidenceId: "cycle-phase-performance-small" });
  return out;
}

/** Days since the most recent check-in (Infinity if none). */
export function daysSinceLastLog(log: { date: string }[], today = new Date()): number {
  if (!log.length) return Infinity;
  const last = log.reduce((a, e) => (e.date > a ? e.date : a), log[0].date);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((t - new Date(last + "T00:00:00").getTime()) / 86_400_000);
}

/** Seeded PRNG for demo data. */
function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp5 = (x: number) => Math.max(1, Math.min(5, Math.round(x)));

/**
 * Synthetic check-ins for the demo (clearly labelled as demo in the UI). One person's made-up pattern:
 * lower energy, mood and workout strength plus more cravings in the luteal phase, cramps on period days.
 * Ends `gapDays` before today so the "welcome back" flow shows.
 */
export function generateDemoCheckIns(o: { lastPeriodDate: string; cycleLength: number; days?: number; gapDays?: number; today?: Date; seed?: number; phaseOf: (cycleDay: number) => CyclePhase }): CycleSymptomEntry[] {
  const r = rng(o.seed ?? 20261025);
  const today = o.today ?? new Date();
  const start = new Date(o.lastPeriodDate + "T00:00:00").getTime();
  const out: CycleSymptomEntry[] = [];
  for (let k = (o.days ?? 84) + (o.gapDays ?? 0); k > (o.gapDays ?? 0); k--) {
    if (r() < 0.15) continue; // missed days are normal
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - k);
    const diff = Math.floor((d.getTime() - start) / 86_400_000);
    const cycleDay = (((diff % o.cycleLength) + o.cycleLength) % o.cycleLength) + 1;
    const ph = o.phaseOf(cycleDay);
    const n = () => (r() - 0.5) * 1.6;
    const lut = ph === "luteal" ? 1 : 0, men = ph === "menstrual" ? 1 : 0, fol = ph === "follicular" ? 1 : 0;
    out.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      cycleDay,
      energy: clamp5(3.4 + 0.6 * fol - 0.9 * lut - 0.6 * men + n()),
      mood: clamp5(3.5 + 0.3 * fol - 1.0 * lut + n()),
      workout: clamp5(3.4 + 0.7 * fol - 0.8 * lut - 0.4 * men + n()),
      cravings: clamp5(2.2 + 1.4 * lut + 0.8 * men + n()),
      cramps: clamp5(1.3 + 2.4 * men + n() * 0.6),
      stress: clamp5(2.6 + 0.4 * lut + n()),
      bloating: clamp5(1.6 + 1.0 * lut + 1.0 * men + n() * 0.6),
      sleepQuality: clamp5(3.4 - 0.4 * lut + n()),
      sleepHours: Math.round((7.2 - 0.5 * lut + n() * 0.9) * 2) / 2,
      notes: "",
    });
  }
  return out;
}
