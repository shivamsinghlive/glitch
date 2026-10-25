/**
 * Glitch — menopause signals, risk flags and research context.
 *
 * - Sleep fragmentation from WHOOP (wake-ups, minutes awake, efficiency) vs the user's own baseline.
 * - Blood pressure categories per the AHA/ACC high blood pressure guideline (2025 edition, which
 *   replaced 2017 and kept the normal / elevated / stage 1 / stage 2 categories). BP is logged by
 *   voice/cuff; WHOOP's API doesn't expose it. Evidence: evidence.ts "bp-categories-acc-aha".
 *   NOTE: the 2025 full text isn't in PMC, so the thresholds weren't machine-checked against it.
 * - Mental-health check combining HRV trend, mood (voice check-ins), sleep and BP. Lower HRV is
 *   associated with depression at the *group* level (small effect, evidence.ts "hrv-lower-in-depression");
 *   an individual HRV dip has many causes, so it is only ever one soft signal here.
 * - Ethnicity context from SWAN (Avis et al., JAMA Intern Med 2015): median total duration of
 *   frequent hot flashes/night sweats by group. Shown as optional, consented *group* context — never
 *   used to score an individual.
 * - Risk flags → in-app alerts and (opt-in) notifications.
 */
import type { DailyPhysiology } from "./whoop/types";
import type { StageResult, WarmNight, HotFlash } from "./menopause";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const DAY = 86_400_000;

// ── Sleep fragmentation ──────────────────────────────────────
export interface FragNight { date: string; wakeUps: number | null; awakeMin: number | null; efficiency: number | null; score: number | null }

/** 0–100, higher = more broken sleep. Blends wake-ups, minutes awake and efficiency vs the user's 30-night baseline. */
export function sleepFragmentation(days: DailyPhysiology[]): FragNight[] {
  return days.map((d, i) => {
    const base = days.slice(Math.max(0, i - 30), i);
    const bw = mean(base.map((x) => x.disturbances).filter((x): x is number => x != null));
    const ba = mean(base.map((x) => x.awakeMinutes).filter((x): x is number => x != null));
    let score: number | null = null;
    if (d.disturbances != null && d.sleepEfficiency != null) {
      const wake = Number.isFinite(bw) ? (d.disturbances - bw) / Math.max(3, bw * 0.4) : 0;
      const awake = d.awakeMinutes != null && Number.isFinite(ba) ? (d.awakeMinutes - ba) / Math.max(10, ba * 0.5) : 0;
      const eff = (90 - d.sleepEfficiency) / 10;
      score = Math.round(Math.max(0, Math.min(100, 35 + 18 * wake + 12 * awake + 15 * eff)));
    }
    return { date: d.date, wakeUps: d.disturbances ?? null, awakeMin: d.awakeMinutes ?? null, efficiency: d.sleepEfficiency ?? null, score };
  });
}

// ── Blood pressure ───────────────────────────────────────────
export interface BpReading { at: string; systolic: number; diastolic: number; pulse?: number }
export type BpCategory = "normal" | "elevated" | "stage1" | "stage2" | "crisis";

export function bpCategory(sys: number, dia: number): BpCategory {
  if (sys > 180 || dia > 120) return "crisis";
  if (sys >= 140 || dia >= 90) return "stage2";
  if (sys >= 130 || dia >= 80) return "stage1";
  if (sys >= 120) return "elevated";
  return "normal";
}
export const BP_LABEL: Record<BpCategory, string> = { normal: "Normal", elevated: "Elevated", stage1: "High (stage 1)", stage2: "High (stage 2)", crisis: "Very high" };

// ── Ethnicity context (SWAN) ─────────────────────────────────
export type Ethnicity =
  | "black" | "hispanic" | "white" | "chinese" | "japanese" | "south_asian" | "other_asian"
  | "mena" | "indigenous" | "pacific_islander" | "multiracial" | "other";

export const ETHNICITY_OPTIONS: { id: Ethnicity; label: string }[] = [
  { id: "black", label: "Black / African American" }, { id: "hispanic", label: "Hispanic / Latina" },
  { id: "white", label: "White" }, { id: "chinese", label: "Chinese" }, { id: "japanese", label: "Japanese" },
  { id: "south_asian", label: "South Asian" }, { id: "other_asian", label: "Other Asian" },
  { id: "mena", label: "Middle Eastern / North African" }, { id: "indigenous", label: "Native American / Indigenous" },
  { id: "pacific_islander", label: "Pacific Islander" }, { id: "multiracial", label: "Multiracial" }, { id: "other", label: "Other" },
];

/** SWAN median total duration (years) of frequent vasomotor symptoms. */
export const SWAN_VMS_YEARS: { group: string; key?: Ethnicity; years: number }[] = [
  { group: "African American", key: "black", years: 10.1 },
  { group: "Hispanic", key: "hispanic", years: 8.9 },
  { group: "White", key: "white", years: 6.5 },
  { group: "Chinese", key: "chinese", years: 5.4 },
  { group: "Japanese", key: "japanese", years: 4.8 },
];
export const SWAN_OVERALL_YEARS = 7.4;

export function ethnicityContext(e: Ethnicity | undefined): string | null {
  const row = SWAN_VMS_YEARS.find((r) => r.key === e);
  if (row) {
    const longer = row.years > SWAN_OVERALL_YEARS;
    return `In the SWAN study, ${row.group} women with frequent hot flashes had them for a median of ${row.years} years (overall: ${SWAN_OVERALL_YEARS}). ${longer ? "Longer-lasting symptoms are common, and they're real and treatable. You deserve to be taken seriously by your clinician." : "Every woman is different; your own data matters more than the average."}`;
  }
  if (e) return `SWAN studied five groups, so we don't have duration data specific to you. Overall, frequent hot flashes lasted a median of ${SWAN_OVERALL_YEARS} years; your own tracking is the best guide.`;
  return null;
}

// ── Mental-health check ──────────────────────────────────────
export interface MindCheck {
  level: "ok" | "watch" | "reach_out";
  hrvChangePct: number | null;
  avgMood7: number | null;
  reasons: string[];
}

export function mentalHealthCheck(days: DailyPhysiology[], moods: { at: string; mood: number }[], bp: BpReading[], now = new Date()): MindCheck {
  const hrv = days.map((d) => d.hrv).filter((x): x is number => x != null);
  const recent = hrv.slice(-7), prior = hrv.slice(-35, -7);
  const hrvChangePct = recent.length >= 4 && prior.length >= 10 ? Math.round(((mean(recent) - mean(prior)) / mean(prior)) * 100) : null;
  const m7 = moods.filter((m) => now.getTime() - Date.parse(m.at) < 7 * DAY).map((m) => m.mood);
  const avgMood7 = m7.length >= 2 ? +mean(m7).toFixed(1) : null;
  const sleep7 = mean(days.slice(-7).map((d) => d.sleepPerformance).filter((x): x is number => x != null));
  const lastBp = bp[bp.length - 1];

  const reasons: string[] = [];
  if (hrvChangePct != null && hrvChangePct <= -12) reasons.push(`HRV is ${Math.abs(hrvChangePct)}% below your usual, which can happen with stress, poor sleep or illness`);
  if (avgMood7 != null && avgMood7 <= 2.5) reasons.push(`mood has averaged ${avgMood7}/5 this week`);
  if (Number.isFinite(sleep7) && sleep7 < 70) reasons.push(`sleep has averaged ${Math.round(sleep7)}%`);
  if (lastBp && ["stage1", "stage2", "crisis"].includes(bpCategory(lastBp.systolic, lastBp.diastolic))) reasons.push(`blood pressure is running high (${lastBp.systolic}/${lastBp.diastolic})`);

  const strong = (avgMood7 != null && avgMood7 <= 2) || reasons.length >= 3;
  return { level: strong ? "reach_out" : reasons.length ? "watch" : "ok", hrvChangePct, avgMood7, reasons };
}

// ── Alerts ───────────────────────────────────────────────────
export interface MenoAlert {
  id: string;            // stable per condition + day, so notifications aren't repeated
  level: "info" | "watch" | "urgent";
  icon: string;
  title: string;
  detail: string;
  /** evidence.ts id backing the alert's claim, for a "source" link */
  evidenceId?: string;
}

export function menopauseAlerts(i: {
  stage: StageResult;
  warm: WarmNight[];
  frag: FragNight[];
  flashes: HotFlash[];
  bp: BpReading[];
  mind: MindCheck;
  now?: Date;
}): MenoAlert[] {
  const now = i.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const out: MenoAlert[] = [];
  const last7 = (d: string) => now.getTime() - Date.parse(`${d}T12:00:00Z`) < 7 * DAY;

  // Blood pressure (AHA/ACC 2025 categories)
  const bp = i.bp.slice(-3);
  const last = bp[bp.length - 1];
  if (last) {
    const cat = bpCategory(last.systolic, last.diastolic);
    if (cat === "crisis") out.push({ id: `bp-crisis-${last.at}`, level: "urgent", icon: "🚨", title: `Very high blood pressure: ${last.systolic}/${last.diastolic}`, detail: "Rest 5 minutes and re-measure. If it's still above 180/120, or you have chest pain, shortness of breath, vision changes or weakness, call 911." });
    else if (bp.length >= 2 && bp.every((r) => ["stage1", "stage2"].includes(bpCategory(r.systolic, r.diastolic))))
      out.push({ id: `bp-high-${today}`, level: "watch", icon: "🩺", title: "Blood pressure has been high on repeat readings", detail: `Last ${bp.length}: ${bp.map((r) => `${r.systolic}/${r.diastolic}`).join(", ")}. Heart risk rises after menopause and blood pressure often climbs too (not for everyone), so book a check with your doctor.`, evidenceId: "bp-rises-after-menopause" });
  }

  // Night sweats
  const warm7 = i.warm.filter((w) => w.likely && last7(w.date)).length;
  // "Possible" night sweats: an unvalidated estimate (evidence.ts "wearable-hot-flash-detection").
  // Comfort tips are optional; NAMS 2023 doesn't rate cooling or trigger avoidance as proven treatment.
  if (warm7 >= 3) out.push({ id: `sweats-${today}`, level: "watch", icon: "🌙", title: `Possible night sweats ${warm7} of the last 7 nights`, detail: "Estimated from skin temperature and broken sleep (not a validated measure). Optional comfort ideas: a cooler room, layered bedding, and noticing whether evening drinks make a difference for you. If night sweats are wrecking your sleep, proven options include hormone therapy, CBT and non-hormonal medicines, so talk to your doctor.", evidenceId: "hormone-therapy-most-effective-vms" });

  // Sleep fragmentation
  const frag7 = i.frag.filter((f) => f.score != null && last7(f.date));
  const broken = frag7.filter((f) => f.score! >= 60).length;
  if (broken >= 4) out.push({ id: `frag-${today}`, level: "watch", icon: "😴", title: `Broken sleep ${broken} of 7 nights`, detail: "Frequent wake-ups add up. Glitch will keep tracking whether night sweats, alcohol or late meals are behind it." });

  // Hot flash frequency
  const fl7 = i.flashes.filter((f) => last7(f.at.slice(0, 10))).length;
  if (fl7 / 7 >= 7) out.push({ id: `flash-${today}`, level: "watch", icon: "🔥", title: `About ${Math.round(fl7 / 7)} hot flashes a day this week`, detail: "That's frequent enough that treatment could make a real difference. Bring this week's chart to your doctor." });

  // Staging
  if (i.stage.timing === "premature") out.push({ id: "stage-poi", level: "urgent", icon: "⚠️", title: "Periods stopped before 40", detail: "Please see a doctor about premature menopause (POI). Treatment protects your heart and bones." });
  else if (i.stage.timing === "early") out.push({ id: "stage-early", level: "watch", icon: "📋", title: "Early menopause (before 45)", detail: "Ask your doctor about bone and heart protection, including whether hormone therapy suits you." });
  if (i.stage.stage === "late_transition") out.push({ id: "stage-late", level: "info", icon: "🌗", title: "Late perimenopause", detail: "60+ days since your last period. Hot flashes are common now and most likely in the first couple of years after your final period. If you bleed again after 12 months without a period, see a doctor.", evidenceId: "straw10-staging" });

  // Mental health
  if (i.mind.level === "reach_out") out.push({ id: `mind-${today}`, level: "urgent", icon: "💙", title: "Your body and mood both need care", detail: `${i.mind.reasons.join("; ")}. Please talk to someone: your doctor, or call/text 988 any time.`, evidenceId: "depression-risk-perimenopause" });
  else if (i.mind.level === "watch" && i.mind.reasons.length >= 2) out.push({ id: `mind-${today}`, level: "watch", icon: "💙", title: "Mental health check-in", detail: `${i.mind.reasons.join("; ")}. Be gentle with yourself this week; a short walk and an early night help.` });

  const rank = { urgent: 0, watch: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
