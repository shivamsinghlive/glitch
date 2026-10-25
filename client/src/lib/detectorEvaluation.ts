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
import { classMetrics, tally, type ClassMetrics } from "./metrics";
import { benjaminiHochberg, permutationP } from "./menopause";

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
export type NightCause = "sweat" | "confounder" | "poorSleep" | "normal";
export interface SimNights { days: DailyPhysiology[]; truth: boolean[]; causes: NightCause[] }

/** `people` simulated women, `nights` each. ~25% of nights are true sweats; ~10% are warm-but-not-sweat confounders. */
export interface SensorOpts { /** multiplies night-to-night skin-temperature noise (1 = default) */ noiseScale?: number; /** constant °C added to every reading (a sensor that reads high or low) */ offset?: number }

export function simulateNights(people: number, nights: number, seed: number, opts: SensorOpts = {}): SimNights {
  const noiseScale = opts.noiseScale ?? 1, offset = opts.offset ?? 0;
  const r = rng(seed);
  const days: DailyPhysiology[] = [];
  const truth: boolean[] = [];
  const causes: NightCause[] = [];
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
      d.skinTemp = base + offset + r.normal() * 0.18 * noiseScale + (sweat ? 0.5 + r.normal() * 0.22 : 0) + (confounder ? 0.45 + r.normal() * 0.2 : 0);
      d.sleepEfficiency = baseEff + r.normal() * 3.5 - (sweat ? 8 + r.normal() * 4 : 0) - (poorSleepOnly ? 9 + r.normal() * 3 : 0);
      d.disturbances = Math.max(0, baseDist + r.normal() * 2 + (sweat ? 4 + r.normal() * 2 : 0) + (poorSleepOnly ? 4 : 0));
      d.sleepPerformance = 85 + r.normal() * 6 - (sweat ? 12 : 0) - (poorSleepOnly ? 12 : 0);
      days.push(d);
      truth.push(sweat);
      causes.push(sweat ? "sweat" : confounder ? "confounder" : poorSleepOnly ? "poorSleep" : "normal");
    }
  }
  return { days, truth, causes };
}

export interface NightSweatEval {
  nights: number; prevalence: number;
  operating: Prf & { threshold: number };
  tempOnly: Prf; disruptionOnly: Prf;
  sweep: { threshold: number; precision: number; recall: number; falseAlarmRate: number }[];
}

export function evaluateNightSweats(people = 60, nights = 120, seed = 11, threshold = 0.35, sensor: SensorOpts = {}): NightSweatEval {
  const { days, truth } = simulateNights(people, nights, seed, sensor);
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
export interface SimCycle { days: DailyPhysiology[]; win: CycleWindow; ovulationDay: number | null; rise: number }

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
  return { days, win: { start: iso(start), end: iso(start + (length - 1) * DAY), complete: true }, ovulationDay: anov ? null : ov, rise };
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

// ── Sensor bias stress test ──────────────────────────────────
export interface SensorRow { scenario: string; precision: number; recall: number; falseAlarmRate: number }

/**
 * What if a wearable's skin-temperature sensor is less reliable for some users (for example across skin
 * tones, which we have NOT measured)? We simulate two failure types and re-run the detector:
 * a constant offset (reads high or low) and extra noise.
 */
export function evaluateSensorRobustness(): SensorRow[] {
  const run = (scenario: string, sensor: SensorOpts): SensorRow => {
    const r = evaluateNightSweats(60, 120, 11, 0.35, sensor).operating;
    return { scenario, precision: r.precision, recall: r.recall, falseAlarmRate: r.falseAlarmRate };
  };
  return [
    run("Reference sensor", {}),
    run("Reads 0.5 °C too high", { offset: 0.5 }),
    run("Reads 0.5 °C too low", { offset: -0.5 }),
    run("1.5× noisier", { noiseScale: 1.5 }),
    run("2× noisier", { noiseScale: 2 }),
    run("3× noisier", { noiseScale: 3 }),
  ];
}

// ── Full scorecards and error analysis ───────────────────────

export interface NightSweatReport {
  nights: number; prevalence: number; threshold: number;
  combined: ClassMetrics; tempOnly: ClassMetrics; disruptionOnly: ClassMetrics; alwaysNo: ClassMetrics;
  /** Why real sweats were missed, and what the false alarms were */
  misses: { n: number; tempRiseTooSmall: number; sleepNotDisruptedEnough: number };
  falseAlarms: { n: number; warmButNotSweat: number; poorSleepOnly: number; plainNoise: number };
}

export function analyzeNightSweats(people = 60, nights = 120, seed = 11, threshold = 0.35): NightSweatReport {
  const { days, truth, causes } = simulateNights(people, nights, seed);
  const delta = new Map<string, number>(), likely = new Map<string, boolean>();
  for (let p = 0; p < people; p++) {
    const slice = days.slice(p * nights, (p + 1) * nights);
    for (const w of warmNights(slice, { tempThreshold: -99 })) delta.set(w.date, w.tempDelta);
    for (const w of warmNights(slice, { tempThreshold: threshold })) likely.set(w.date, w.likely);
  }
  const rows = days.map((d, i) => ({ d, i })).filter(({ d }) => delta.has(d.date));
  const disrupted = ({ d }: { d: DailyPhysiology }) => (d.sleepEfficiency ?? 100) < 82 || (d.sleepPerformance ?? 100) < 68;
  const scored = (f: (r: { d: DailyPhysiology; i: number }) => boolean) => classMetrics(tally(rows.map((r) => ({ predicted: f(r), actual: truth[r.i] }))));
  const combined = scored(({ d }) => likely.get(d.date)!);
  const missed = rows.filter((r) => truth[r.i] && !likely.get(r.d.date));
  const fas = rows.filter((r) => !truth[r.i] && likely.get(r.d.date));
  return {
    nights: rows.length, prevalence: +(rows.filter((r) => truth[r.i]).length / rows.length).toFixed(3), threshold,
    combined,
    tempOnly: scored(({ d }) => delta.get(d.date)! >= threshold),
    disruptionOnly: scored((r) => disrupted(r)),
    alwaysNo: scored(() => false),
    misses: {
      n: missed.length,
      tempRiseTooSmall: +(missed.filter((r) => delta.get(r.d.date)! < threshold).length / Math.max(1, missed.length)).toFixed(3),
      sleepNotDisruptedEnough: +(missed.filter((r) => delta.get(r.d.date)! >= threshold).length / Math.max(1, missed.length)).toFixed(3),
    },
    falseAlarms: {
      n: fas.length,
      warmButNotSweat: +(fas.filter((r) => causes[r.i] === "confounder").length / Math.max(1, fas.length)).toFixed(3),
      poorSleepOnly: +(fas.filter((r) => causes[r.i] === "poorSleep").length / Math.max(1, fas.length)).toFixed(3),
      plainNoise: +(fas.filter((r) => causes[r.i] === "normal").length / Math.max(1, fas.length)).toFixed(3),
    },
  };
}

export interface OvulationReport {
  cycles: number; anovulatoryShare: number;
  detection: ClassMetrics; alwaysDetect: ClassMetrics;
  timing: { n: number; meanErrorDays: number; biasDays: number; within1: number; within2: number; within3: number };
  /** Miss rate by size of the real temperature rise */
  missByRise: { band: string; cycles: number; missRate: number }[];
  falsePositives: number; misses: number;
}

export function analyzeOvulation(cycles = 1000, seed = 5): OvulationReport {
  const pairs: { predicted: boolean; actual: boolean }[] = [];
  const errs: number[] = [];
  const bands = [{ band: "rise under 0.3 °C", lo: 0, hi: 0.3 }, { band: "0.3 to 0.4 °C", lo: 0.3, hi: 0.4 }, { band: "0.4 °C or more", lo: 0.4, hi: 9 }].map((b) => ({ ...b, n: 0, miss: 0 }));
  let anov = 0;
  for (let i = 0; i < cycles; i++) {
    const c = simulateCycle(seed * 100_003 + i);
    const res = detectOvulation(c.days, c.win);
    const detected = res.status === "confirmed";
    const actual = c.ovulationDay != null;
    pairs.push({ predicted: detected, actual });
    if (!actual) { anov++; continue; }
    const band = bands.find((b) => c.rise >= b.lo && c.rise < b.hi)!;
    band.n++;
    if (!detected) band.miss++;
    else errs.push((res.ovulationCycleDay ?? 0) - c.ovulationDay!);
  }
  const conf = tally(pairs);
  const abs = errs.map(Math.abs);
  const within = (k: number) => +(abs.filter((e) => e <= k).length / errs.length).toFixed(3);
  return {
    cycles, anovulatoryShare: +(anov / cycles).toFixed(3),
    detection: classMetrics(conf), alwaysDetect: classMetrics(tally(pairs.map((p) => ({ predicted: true, actual: p.actual })))),
    timing: { n: errs.length, meanErrorDays: +(abs.reduce((a, b) => a + b, 0) / errs.length).toFixed(2), biasDays: +(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(2), within1: within(1), within2: within(2), within3: within(3) },
    missByRise: bands.map((b) => ({ band: b.band, cycles: b.n, missRate: +(b.miss / Math.max(1, b.n)).toFixed(3) })),
    falsePositives: conf.fp, misses: conf.fn,
  };
}

// ── Trigger finder: how often does it cry wolf, and how often does it find a real trigger? ──

function poisson(r: { next: () => number }, mean: number): number {
  const L = Math.exp(-mean);
  let k = 0, p = 1;
  do { k++; p *= r.next(); } while (p > L);
  return k - 1;
}

export interface TriggerReport {
  simulations: number; days: number;
  /** Chance of reporting at least one (false) trigger when none is real */
  falseTriggerRate: { naive: number; corrected: number };
  power: { effect: string; naive: number; corrected: number }[];
}

export function evaluateTriggers(simulations = 500, days = 60, seed = 3): TriggerReport {
  const r = rng(seed);
  const K = 6, P_TRIGGER = 0.3, BASE = 1.2;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  /** one simulated user: returns which candidates each rule would report. effect on candidate 0 (1 = no real trigger) */
  const trial = (effect: number) => {
    const present = Array.from({ length: K }, () => Array.from({ length: days }, () => r.next() < P_TRIGGER));
    const counts = Array.from({ length: days }, (_, d) => poisson(r, BASE * (present[0][d] ? effect : 1)));
    const tested: { k: number; w: number; wo: number; p: number }[] = [];
    for (let k = 0; k < K; k++) {
      const w = counts.filter((_, d) => present[k][d]), wo = counts.filter((_, d) => !present[k][d]);
      if (w.length < 3 || wo.length < 3) continue;
      tested.push({ k, w: mean(w), wo: mean(wo), p: permutationP(w, wo, 300, 1 + k) });
    }
    const q = benjaminiHochberg(tested.map((t) => t.p));
    const naive = tested.filter((t) => (t.wo > 0 ? t.w / t.wo : 9) >= 1.5 && t.w - t.wo >= 0.5).map((t) => t.k);
    const corrected = tested.filter((t, i) => naive.includes(t.k) && q[i] <= 0.1).map((t) => t.k);
    return { naive, corrected };
  };
  const run = (effect: number) => Array.from({ length: simulations }, () => trial(effect));
  const nulls = run(1);
  const rate = (rs: { naive: number[]; corrected: number[] }[], key: "naive" | "corrected", any: (ks: number[]) => boolean) => +(rs.filter((x) => any(x[key])).length / rs.length).toFixed(3);
  return {
    simulations, days,
    falseTriggerRate: { naive: rate(nulls, "naive", (ks) => ks.length > 0), corrected: rate(nulls, "corrected", (ks) => ks.length > 0) },
    power: [1.5, 2, 3].map((m) => { const rs = run(m); return { effect: `${m}x more flashes`, naive: rate(rs, "naive", (ks) => ks.includes(0)), corrected: rate(rs, "corrected", (ks) => ks.includes(0)) }; }),
  };
}
