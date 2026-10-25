/**
 * Glitch — menopause insights: stage, night sweats, hot-flash triggers, training and clinician points.
 */
import { useMemo } from "react";
import { useApp, bodyKind } from "@/contexts/AppContext";
import { useHealthInsights } from "./useHealthInsights";
import { generateDemoHotFlashes, generateDemoTriggerMeals } from "@/lib/whoop/demoData";
import {
  stageMenopause, warmNights, hotFlashTriggers, menopauseTraining, clinicianPoints,
  type StageResult, type WarmNight, type TriggerFinding, type MenoTraining, type HotFlash, type MrsResult,
} from "@/lib/menopause";

export interface MenopauseInsights {
  stage: StageResult;
  warm: WarmNight[];
  likelyWarm14: number;
  flashes: HotFlash[];
  demoFlashes: boolean;
  flashesToday: number;
  flashesPerDay14: number;
  /** Triggers that passed the n-of-1 test (q < 0.10 and 95% CI above 1) */
  triggers: TriggerFinding[];
  /** Tested (enough days) but no clear link yet — shown so we're honest about uncertainty */
  triggersUnclear: TriggerFinding[];
  training: MenoTraining;
  lastMrs: MrsResult | null;
  clinician: string[];
}

export function useMenopauseInsights(): MenopauseInsights | null {
  const { profile, periodLog, hotFlashLog, mrsLog, meals, mealHistory, whoop } = useApp();
  const h = useHealthInsights();

  return useMemo(() => {
    if (!profile) return null;
    const wh = profile.womensHealth;
    const today = new Date().toISOString().slice(0, 10);
    const starts = [...(wh?.lastPeriodDate ? [wh.lastPeriodDate] : []), ...periodLog.map((p) => p.startDate)];
    const stage = stageMenopause({ periodStarts: starts, age: profile.age, today });

    const warm = warmNights(h.days);
    const since14 = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10);
    const likelyWarm14 = warm.filter((w) => w.likely && w.date >= since14).length;

    // Rolling-HRV stress per day (needed for "high-stress days" trigger)
    const stressByDay = new Map<string, "low" | "moderate" | "high">();
    h.days.forEach((d, i) => {
      const prev = h.days.slice(Math.max(0, i - 14), i).map((x) => x.hrv).filter((x): x is number => x != null);
      if (d.hrv == null || prev.length < 7) return;
      const m = prev.reduce((a, b) => a + b, 0) / prev.length;
      const sd = Math.sqrt(prev.reduce((a, b) => a + (b - m) ** 2, 0) / prev.length) || 1;
      const zv = (d.hrv - m) / sd;
      stressByDay.set(d.date, zv < -1 ? "high" : zv < -0.3 ? "moderate" : "low");
    });

    // Demo hot flashes only make sense for peri/post-menopause profiles
    const kind = bodyKind(profile);
    const useDemo = whoop?.source === "demo" && hotFlashLog.length < 5 && (kind === "peri" || kind === "menopause");
    const demoMeals = useDemo ? generateDemoTriggerMeals(h.days) : [];
    const flashes = useDemo
      ? [...generateDemoHotFlashes(
          h.days,
          new Set(warm.filter((w) => w.likely).map((w) => w.date)),
          new Set(Array.from(stressByDay.entries()).filter(([, v]) => v === "high").map(([k]) => k)),
          new Set(demoMeals.map((m) => m.loggedAt.slice(0, 10))),
        ), ...hotFlashLog]
      : hotFlashLog;

    const dayList = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10));
    const tested = hotFlashTriggers(flashes, [...mealHistory, ...meals, ...demoMeals], stressByDay, warm, dayList);
    const flashes14 = flashes.filter((f) => f.at.slice(0, 10) >= since14).length;
    const lastWarm = warm[warm.length - 1];
    const lastMrs = mrsLog[mrsLog.length - 1] ?? null;

    return {
      stage, warm, likelyWarm14, flashes, demoFlashes: useDemo,
      flashesToday: flashes.filter((f) => f.at.slice(0, 10) === today).length,
      flashesPerDay14: +(flashes14 / 14).toFixed(1),
      triggers: tested.filter((t) => t.significant),
      triggersUnclear: tested.filter((t) => !t.significant),
      training: menopauseTraining({ weekday: new Date().getDay(), recovery: h.recovery?.raw ?? null, warmNightLastNight: !!lastWarm && lastWarm.likely && lastWarm.date === h.today?.date, weightKg: profile.weight }),
      lastMrs,
      clinician: clinicianPoints(stage, lastMrs, likelyWarm14),
    };
  }, [profile, periodLog, hotFlashLog, mrsLog, meals, mealHistory, whoop, h]);
}
