/**
 * Glitch — evaluation of the night-sweat and ovulation detectors against SIMULATED ground truth.
 *
 * No public dataset pairs wearable nights with confirmed night sweats, and the one that pairs wearable
 * temperature with hormone-confirmed ovulation (mcPHASES) is restricted. So we simulate nights and
 * cycles where the truth is known, add overlapping noise and confounders (alcohol/illness nights that
 * are warm but not sweats; cycles with no ovulation), and measure how often each detector is right.
 *
 * This is a stress test of the method, not clinical validation. The simulator is deliberately separate
 * from the demo-data generator, so the detectors are not graded on data built to be easy for them.
 */
import type { DailyPhysiology } from "./whoop/types";
import { warmNights } from "./menopause";
import { detectOvulation, type CycleWindow, type OvulationParams } from "./healthMetrics";

export function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const normal = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  return { next, normal };
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const blank = (date: string): DailyPhysiology => ({
  date, recovery: null, restingHr: null, hrv: null, skinTemp: null, spo2: null, respRate: null,
  sleepPerformance: null, sleepHours: null, strain: null, kilojoule: null,
});

export interface Prf { precision: number; recall: number; f1: number; falseAlarmRate: number }

function prf(tp: number, fp: number, fn: number, tn: number): Prf {
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    precision: +precision.toFixed(3), recall: +recall.toFixed(3),
    f1: precision + recall ? +((2 * precision * recall) / (precision + recall)).toFixed(3) : 0,
    falseAlarmRate: fp + tn ? +(fp / (fp + tn)).toFixed(3) : 0,
  };
}

// ── Night sweats ─────────────────────────────────────────────
export interface SimNights { days: DailyPhysiology[]; truth: boolean[] }

/** `people` simulated women, `nights` each. ~25% of nights are true sweats; ~10% are warm-but-not-sweat confounders. */
export function simulateNights(people: number, nights: number, seed: number): SimNights {
  const r = rng(seed);
  const days: DailyPhysiology[] = [];
  const truth: boolean[] = [];
  for (let p = 0; p < people; p++) {
    const base = 33 + r.normal() * 0.6;
    const baseEff = 88 + r.normal() * 3;
    const baseDist = 8 + r.next() * 6;
    const start = Date.UTC(2026, 0, 1);
    for (let n = 0; n < nights; n++) {
      const sweat = r.next() < 0.25;
      const confounder = !sweat && r.next() < 0.13;      // alcohol, illness, hot room
      const poorSleepOnly = !sweat && !confounder && r.next() < 0.12; // stress, noise, caffeine
      const d = blank(iso(start + (p * 1000 + n) * DAY));
      d.skinTemp = base + r.normal() * 0.18 + (sweat ? 0.5 + r.normal() * 0.22 : 0) + (confounder ? 0.45 + r.normal() * 0.2 : 0);
      d.sleepEfficiency = baseEff + r.normal() * 3.5 - (sweat ? 8 + r.normal() * 4 : 0) - (poorSleepOnly ? 9 + r.normal() * 3 : 0);
      d.disturbances = Math.max(0, baseDist + r.normal() * 2 + (sweat ? 4 + r.normal() * 2 : 0) + (poorSleepOnly ? 4 : 0));
      d.sleepPerformance = 85 + r.normal() * 6 - (sweat ? 12 : 0) - (poorSleepOnly ? 12 : 0);
      days.push(d);
      truth.push(sweat);
    }
  }
  return { days, truth };
}

export interface NightSweatEval {
  nights: number; prevalence: number;
  operating: Prf & { threshold: number };
  tempOnly: Prf; disruptionOnly: Prf;
  sweep: { threshold: number; precision: number; recall: number; falseAlarmRate: number }[];
}

export function evaluateNightSweats(people = 60, nights = 120, seed = 11, threshold = 0.35): NightSweatEval {
  const { days, truth } = simulateNights(people, nights, seed);
  const confusion = (flag: (d: DailyPhysiology, i: number) => boolean | undefined) => {
    let tp = 0, fp = 0, fn = 0, tn = 0, total = 0, pos = 0;
    days.forEach((d, i) => {
      const f = flag(d, i);
      if (f === undefined) return; // not scored (warm-up nights without a baseline)
      total++; if (truth[i]) pos++;
      if (f && truth[i]) tp++; else if (f) fp++; else if (truth[i]) fn++; else tn++;
    });
    return { tp, fp, fn, tn, total, pos };
  };
  const run = (t: number) => {
    const out = new Map<string, boolean>();
    for (let p = 0; p < people; p++) {
      const slice = days.slice(p * nights, (p + 1) * nights);
      for (const w of warmNights(slice, { tempThreshold: t })) out.set(w.date, w.likely);
    }
    return confusion((d) => out.get(d.date));
  };
  const at = run(threshold);
  const sweep = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6].map((t) => {
    const c = run(t); const m = prf(c.tp, c.fp, c.fn, c.tn);
    return { threshold: t, precision: m.precision, recall: m.recall, falseAlarmRate: m.falseAlarmRate };
  });
  // Single-signal baselines on the same scored nights (rolling median temp delta only, or disruption only)
  const scoredDates = new Map<string, number>();
  for (let p = 0; p < people; p++) for (const w of warmNights(days.slice(p * nights, (p + 1) * nights), { tempThreshold: -99 })) scoredDates.set(w.date, w.tempDelta);
  const tempOnly = confusion((d) => (scoredDates.has(d.date) ? scoredDates.get(d.date)! >= threshold : undefined));
  const disr = confusion((d) => (scoredDates.has(d.date) ? (d.sleepEfficiency ?? 100) < 82 || (d.sleepPerformance ?? 100) < 68 : undefined));
  return {
    nights: at.total, prevalence: +(at.pos / at.total).toFixed(3),
    operating: { threshold, ...prf(at.tp, at.fp, at.fn, at.tn) },
    tempOnly: prf(tempOnly.tp, tempOnly.fp, tempOnly.fn, tempOnly.tn),
    disruptionOnly: prf(disr.tp, disr.fp, disr.fn, disr.tn),
    sweep,
  };
}

// ── Ovulation ────────────────────────────────────────────────
export interface SimCycle { days: DailyPhysiology[]; win: CycleWindow; ovulationDay: number | null }

/** Biphasic cycles with known ovulation day, plus ~15% anovulatory cycles (no rise). Noisy skin temperature. */
export function simulateCycle(seed: number, noise = 0.13): SimCycle {
  const r = rng(seed);
  const length = 24 + Math.floor(r.next() * 12);
  const anov = r.next() < 0.15;
  const ov = Math.max(10, Math.min(length - 9, length - 14 + Math.round(r.normal() * 1.8)));
  const rise = 0.2 + r.next() * 0.35;
  const base = 33.4 + r.normal() * 0.3;
  const start = Date.UTC(2026, 0, 1) + Math.floor(r.next() * 1000) * DAY;
  const days: DailyPhysiology[] = [];
  for (let d = 1; d <= length; d++) {
    const x = blank(iso(start + (d - 1) * DAY));
    const luteal = !anov && d > ov;
    const ramp = luteal ? Math.min(1, (d - ov) / 2) : 0; // rise takes ~2 days to settle
    const miss = r.next() < 0.06; // device not worn
    x.skinTemp = miss ? null : base + (luteal ? rise * ramp : 0) + r.normal() * noise;
    x.restingHr = 60 + (luteal ? 2 : 0) + r.normal() * 1.5;
    days.push(x);
  }
  return { days, win: { start: iso(start), end: iso(start + (length - 1) * DAY), complete: true }, ovulationDay: anov ? null : ov };
}

export interface OvulationEval {
  cycles: number; ovulatory: number; anovulatory: number;
  sensitivity: number; specificity: number;
  meanAbsErrorDays: number; within1Day: number; within2Days: number;
}

export function evaluateOvulation(cycles = 600, seed = 5, params?: OvulationParams): OvulationEval {
  let tp = 0, fn = 0, tn = 0, fp = 0, errSum = 0, errN = 0, w1 = 0, w2 = 0;
  for (let i = 0; i < cycles; i++) {
    const c = simulateCycle(seed * 100_003 + i);
    const res = detectOvulation(c.days, c.win, params);
    const detected = res.status === "confirmed";
    if (c.ovulationDay == null) { if (detected) fp++; else tn++; continue; }
    if (!detected) { fn++; continue; }
    tp++;
    const err = Math.abs((res.ovulationCycleDay ?? 0) - c.ovulationDay);
    errSum += err; errN++; if (err <= 1) w1++; if (err <= 2) w2++;
  }
  return {
    cycles, ovulatory: tp + fn, anovulatory: tn + fp,
    sensitivity: +(tp / (tp + fn)).toFixed(3), specificity: +(tn / (tn + fp)).toFixed(3),
    meanAbsErrorDays: +(errSum / errN).toFixed(2), within1Day: +(w1 / errN).toFixed(3), within2Days: +(w2 / errN).toFixed(3),
  };
}
