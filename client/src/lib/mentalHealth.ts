/**
 * Glitch — Mind & mood analytics
 * - PHQ-2 / GAD-2 brief screeners (Kroenke et al., 2003 / 2007). A score ≥ 3 is a positive screen:
 *   a prompt to talk to a professional, never a diagnosis. PHQ-2 ≥ 3 is verified (83% sens / 92% spec,
 *   PMID 14583691). The GAD-2 ≥ 3 cut-point is conventional, but the 2007 abstract (PMID 17339617)
 *   reports only AUC 0.80–0.91 and no full text was available to verify it, so the user copy stays
 *   at "suggests… a fuller check" and never states a result.
 * - Links between self-reported mood and WHOOP physiology (sleep, HRV).
 * - Recurring premenstrual mood dips across cycles (a pattern worth raising with a clinician; PMDD
 *   is diagnosed by professionals, not apps).
 * - A burnout-risk flag when HRV is trending down alongside poor sleep and low mood.
 */
import type { DailyPhysiology } from "./whoop/types";
import type { CycleWindow } from "./healthMetrics";

// ── Screeners ────────────────────────────────────────────────
export const SCREENER_ITEMS = [
  { id: "phq1", scale: "phq2", text: "Little interest or pleasure in doing things" },
  { id: "phq2", scale: "phq2", text: "Feeling down, depressed or hopeless" },
  { id: "gad1", scale: "gad2", text: "Feeling nervous, anxious or on edge" },
  { id: "gad2", scale: "gad2", text: "Not being able to stop or control worrying" },
] as const;

export const SCREENER_OPTIONS = ["Not at all", "Several days", "More than half the days", "Nearly every day"];

export interface ScreenerResult {
  date: string;           // YYYY-MM-DD
  phq2: number;           // 0–6
  gad2: number;           // 0–6
}

export function scoreScreener(answers: Record<string, number>, date: string): ScreenerResult {
  const sum = (scale: string) => SCREENER_ITEMS.filter((i) => i.scale === scale).reduce((a, i) => a + (answers[i.id] ?? 0), 0);
  return { date, phq2: sum("phq2"), gad2: sum("gad2") };
}

export function interpretScreener(r: ScreenerResult): { positive: boolean; message: string } {
  const dep = r.phq2 >= 3, anx = r.gad2 >= 3;
  if (dep && anx) return { positive: true, message: "Your answers suggest low mood and anxiety have been weighing on you. A doctor, therapist or counsellor can do a fuller check, and talking to one really can help." };
  if (dep) return { positive: true, message: "Your answers suggest low mood has been weighing on you. A doctor or therapist can do a fuller check (like the PHQ-9) and help you find support." };
  if (anx) return { positive: true, message: "Your answers suggest anxiety has been high lately. A doctor or therapist can do a fuller check (like the GAD-7) and help you find support." };
  return { positive: false, message: "No warning signs in this quick check. Keep checking in. It helps you notice changes early." };
}

// ── Mood series ──────────────────────────────────────────────
/** Average mood (1–5) per day from any set of dated entries. */
export function moodByDay(entries: { date: string; mood: number }[]): Map<string, number> {
  const acc = new Map<string, { s: number; n: number }>();
  for (const e of entries) {
    const a = acc.get(e.date) ?? { s: 0, n: 0 };
    acc.set(e.date, { s: a.s + e.mood, n: a.n + 1 });
  }
  const out = new Map<string, number>();
  acc.forEach((v, k) => out.set(k, v.s / v.n));
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

// ── Mood ↔ body links ────────────────────────────────────────
export interface MoodLink {
  id: "sleep" | "hrv";
  message: string;
  diff: number;           // mood points (positive = mood better in the "good" condition)
}

/**
 * Compare mood on days after poor vs good sleep, and on low- vs normal-HRV days.
 * Needs at least 3 days in each group so a single bad day can't create a "pattern".
 */
export function moodBodyLinks(days: DailyPhysiology[], moods: Map<string, number>): MoodLink[] {
  const rows = days.filter((d) => moods.has(d.date));
  const links: MoodLink[] = [];

  const poor = rows.filter((d) => d.sleepPerformance != null && d.sleepPerformance < 70).map((d) => moods.get(d.date)!);
  const good = rows.filter((d) => d.sleepPerformance != null && d.sleepPerformance >= 80).map((d) => moods.get(d.date)!);
  if (poor.length >= 3 && good.length >= 3) {
    const diff = +(mean(good) - mean(poor)).toFixed(1);
    if (diff >= 0.4) links.push({ id: "sleep", diff, message: `Your mood averages ${diff} points lower after nights under 70% sleep performance.` });
  }

  const hrvs = rows.map((d) => d.hrv).filter((x): x is number => x != null);
  if (hrvs.length >= 10) {
    const m = mean(hrvs);
    const s = Math.sqrt(mean(hrvs.map((x) => (x - m) ** 2)));
    const low = rows.filter((d) => d.hrv != null && d.hrv < m - 0.8 * s).map((d) => moods.get(d.date)!);
    const rest = rows.filter((d) => d.hrv != null && d.hrv >= m - 0.8 * s).map((d) => moods.get(d.date)!);
    if (low.length >= 3 && rest.length >= 3) {
      const diff = +(mean(rest) - mean(low)).toFixed(1);
      if (diff >= 0.4) links.push({ id: "hrv", diff, message: `On days your HRV is well below normal, your mood is ${diff} points lower. Low HRV can reflect stress, poor sleep or illness, so it's a pattern worth noticing, not a diagnosis.` });
    }
  }
  return links;
}

// ── Premenstrual mood pattern ────────────────────────────────
export interface PremenstrualPattern {
  cyclesAnalysed: number;
  cyclesWithDip: number;
  avgDip: number;         // mood points, follicular − late luteal
  recurring: boolean;
}

/**
 * For each complete cycle, compare mood in the 7 days before the next period with mood in days 6–12
 * (mid-follicular). A dip of ≥ 1 point in at least 2 cycles is flagged as recurring.
 */
export function premenstrualMoodPattern(windows: CycleWindow[], moods: Map<string, number>): PremenstrualPattern | null {
  const DAY = 86_400_000;
  const toDay = (s: string) => Date.parse(`${s}T00:00:00Z`);
  let analysed = 0, withDip = 0;
  const dips: number[] = [];
  for (const w of windows.filter((x) => x.complete)) {
    const start = toDay(w.start), end = toDay(w.end);
    const pick = (fromMs: number, toMs: number) => {
      const out: number[] = [];
      for (let t = fromMs; t <= toMs; t += DAY) {
        const m = moods.get(new Date(t).toISOString().slice(0, 10));
        if (m != null) out.push(m);
      }
      return out;
    };
    const follicular = pick(start + 5 * DAY, start + 11 * DAY);
    const lateLuteal = pick(end - 6 * DAY, end);
    if (follicular.length < 3 || lateLuteal.length < 3) continue;
    analysed++;
    const dip = mean(follicular) - mean(lateLuteal);
    dips.push(dip);
    if (dip >= 1) withDip++;
  }
  if (!analysed) return null;
  return { cyclesAnalysed: analysed, cyclesWithDip: withDip, avgDip: +mean(dips).toFixed(1), recurring: withDip >= 2 };
}

// ── Burnout risk ─────────────────────────────────────────────
export interface BurnoutRisk {
  flagged: boolean;
  hrvChangePct: number | null;
  avgSleep: number | null;
  avgMood: number | null;
}

export function burnoutRisk(days: DailyPhysiology[], moods: Map<string, number>): BurnoutRisk {
  const hrv = days.map((d) => d.hrv).filter((x): x is number => x != null);
  const recent = hrv.slice(-14), prior = hrv.slice(-28, -14);
  const hrvChangePct = recent.length >= 10 && prior.length >= 10 ? Math.round(((mean(recent) - mean(prior)) / mean(prior)) * 100) : null;
  const sleeps = days.slice(-7).map((d) => d.sleepPerformance).filter((x): x is number => x != null);
  const avgSleep = sleeps.length ? Math.round(mean(sleeps)) : null;
  const lastWeekMoods = days.slice(-7).map((d) => moods.get(d.date)).filter((x): x is number => x != null);
  const avgMood = lastWeekMoods.length >= 3 ? +mean(lastWeekMoods).toFixed(1) : null;
  const flagged = hrvChangePct != null && hrvChangePct <= -10 && avgSleep != null && avgSleep < 72 && avgMood != null && avgMood <= 2.5;
  return { flagged, hrvChangePct, avgSleep, avgMood };
}

// ── Support resources ────────────────────────────────────────
export const SUPPORT_RESOURCES = [
  { label: "988 Suicide & Crisis Lifeline", detail: "Call or text 988 (US, 24/7)", href: "tel:988" },
  { label: "Crisis Text Line", detail: "Text HOME to 741741", href: "sms:741741?body=HOME" },
  { label: "Massachusetts Behavioral Health Help Line", detail: "Call or text 833-773-2445 · free, 24/7, any insurance", href: "tel:18337732445" },
];
