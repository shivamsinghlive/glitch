/**
 * Glitch — personal estimates that combine population evidence (prior) with her own check-ins (data).
 *
 * 1. Phase effects: Bayesian normal–normal shrinkage, one model per metric × phase.
 *      prior       θ ~ N(μ₀, τ²)                 μ₀ from meta-analyses, τ = between-woman spread (assumption)
 *      likelihood  d̂ | θ ~ N(θ, s²),  s² = σ²(1/n_in + 1/n_out)   d̂ = her phase mean − her other-days mean
 *      posterior   θ | d̂ ~ N(w·d̂ + (1−w)·μ₀,  1/(1/s² + 1/τ²)),   w = (1/s²) / (1/s² + 1/τ²)
 *    w is the share of the estimate that comes from her own data: few days → leans on research, many → hers.
 *    Priors (points on the 1–5 scale):
 *      - energy, mood, workout, sleep, cramps, stress: μ₀ = 0. McNulty 2020 meta-analysis (78 studies) found only a
 *        trivial average phase effect on performance (ES −0.06, 95% CrI −0.16 to 0.04) and recommends a personalised
 *        approach; a 2023 umbrella review found no clear effect on strength. Cramps/stress: no prior assumed.
 *      - cravings in the luteal phase: μ₀ = +0.3. Energy intake is higher in the luteal phase (SMD 0.69, ~168 kcal/day;
 *        Tucker 2025). Intake isn't the same as craving ratings, so we use a deliberately small prior.
 *      - τ = 0.5 by default (assumption: not reported in the literature); sensitivity at 0.3 and 1.0 is returned.
 *
 * 2. Short sleep: Beta–Binomial. Prior Beta(k·p₀, k·(1−p₀)) with p₀ = NHANES short-sleep prevalence for her life
 *    stage and k = 10 pseudo-nights (weak); posterior adds her nights < 7 h and nights ≥ 7 h.
 *    Caveat: NHANES measures the share of WOMEN whose usual sleep is < 7 h; hers is the share of HER NIGHTS.
 */
import type { CyclePhase, CycleSymptomEntry } from "@/contexts/AppContext";
import { PHASES, PHASE_METRICS, type PhaseFinding, type PhaseMetric, type PhaseReport } from "./phasePatterns";
import nhanes from "./models/nhanesLifeStages.json";

export const DEFAULT_TAU = 0.5;
export const SENSITIVITY_TAUS = [0.3, 1.0];

/** Prior mean μ₀ (points) for metric × phase. */
export function priorMean(metric: PhaseMetric, phase: CyclePhase): number {
  return metric === "cravings" && phase === "luteal" ? 0.3 : 0;
}

export interface Shrunk {
  metric: PhaseMetric;
  phase: CyclePhase;
  /** Her raw difference (phase mean − other days) */
  raw: number;
  priorMean: number;
  /** Posterior mean and 95% credible interval */
  mean: number;
  lo: number;
  hi: number;
  sd: number;
  /** Share of the estimate from her own data (0–1) */
  weight: number;
  nIn: number;
  nOut: number;
  /** Posterior means at the sensitivity τ values, same order as SENSITIVITY_TAUS */
  sensitivity: number[];
  /** 95% interval excludes 0 */
  credible: boolean;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function variance(xs: number[]) { const m = mean(xs); return xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1); }

/** Closed-form normal–normal posterior. */
export function normalNormal(raw: number, se2: number, mu0: number, tau: number): { mean: number; sd: number; weight: number } {
  const precData = 1 / se2, precPrior = 1 / (tau * tau);
  const weight = precData / (precData + precPrior);
  return { mean: weight * raw + (1 - weight) * mu0, sd: Math.sqrt(1 / (precData + precPrior)), weight };
}

/** Posterior phase effect for every metric × phase with ≥ 2 days on each side. */
export function shrinkPhaseEffects(log: CycleSymptomEntry[], phaseOf: (cycleDay: number) => CyclePhase, tau = DEFAULT_TAU): Shrunk[] {
  const out: Shrunk[] = [];
  for (const m of PHASE_METRICS) {
    const rows = log
      .filter((e) => e.cycleDay > 0)
      .map((e) => ({ v: (e as unknown as Record<string, number | undefined>)[m.key], p: phaseOf(e.cycleDay) }))
      .filter((r): r is { v: number; p: CyclePhase } => typeof r.v === "number" && r.v > 0);
    if (rows.length < 4) continue;
    // Day-to-day SD of her scores; floor at 0.5 so a run of identical answers can't fake certainty
    const sigma2 = Math.max(0.25, variance(rows.map((r) => r.v)));
    for (const phase of PHASES) {
      const inV = rows.filter((r) => r.p === phase).map((r) => r.v);
      const outV = rows.filter((r) => r.p !== phase).map((r) => r.v);
      if (inV.length < 2 || outV.length < 2) continue;
      const raw = mean(inV) - mean(outV);
      const se2 = sigma2 * (1 / inV.length + 1 / outV.length);
      const mu0 = priorMean(m.key, phase);
      const post = normalNormal(raw, se2, mu0, tau);
      const lo = post.mean - 1.96 * post.sd, hi = post.mean + 1.96 * post.sd;
      out.push({
        metric: m.key, phase, raw, priorMean: mu0, mean: post.mean, lo, hi, sd: post.sd, weight: post.weight,
        nIn: inV.length, nOut: outV.length, credible: lo > 0 || hi < 0,
        sensitivity: SENSITIVITY_TAUS.map((t) => normalNormal(raw, se2, mu0, t).mean),
      });
    }
  }
  return out;
}

// ── Short sleep: Beta–Binomial ─────────────────────────────────────────────

export const SLEEP_PRIOR_STRENGTH = 10;

export interface SleepEstimate {
  /** Population prior (NHANES prevalence for her stage) */
  prior: number;
  /** Posterior mean share of her nights < 7 h, with 95% credible interval */
  mean: number;
  lo: number;
  hi: number;
  shortNights: number;
  nights: number;
  /** Share of the estimate from her own nights (0–1) */
  weight: number;
}

/** Regularised incomplete beta via continued fraction (Numerical Recipes), for Beta quantiles. */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function lgamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x; const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015;
  for (const c of g) s += c / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
export function betaQuantile(p: number, a: number, b: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (betaCdf(mid, a, b) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export function shortSleepEstimate(prior: number, hours: number[], k = SLEEP_PRIOR_STRENGTH): SleepEstimate {
  const shortNights = hours.filter((h) => h < 7).length, nights = hours.length;
  const a = k * prior + shortNights, b = k * (1 - prior) + (nights - shortNights);
  return { prior, mean: a / (a + b), lo: betaQuantile(0.025, a, b), hi: betaQuantile(0.975, a, b), shortNights, nights, weight: nights / (nights + k) };
}

// ── Combining the two checks ───────────────────────────────────────────────

/**
 * A phase pattern is shown only when BOTH checks agree: the permutation test on her raw data passes
 * (q < 0.10, |diff| ≥ 0.5) AND the population-informed posterior's 95% interval excludes 0.
 * Each finding gets its posterior attached for the details view.
 */
export type CombinedFinding = PhaseFinding & { posterior?: Shrunk };
export type CombinedReport = Omit<PhaseReport, "tested" | "significant"> & { tested: CombinedFinding[]; significant: CombinedFinding[] };

export function combinePatterns(report: PhaseReport, shrunk: Shrunk[]): CombinedReport {
  const key = (m: string, p: string) => `${m}|${p}`;
  const byKey = new Map(shrunk.map((s) => [key(s.metric, s.phase), s]));
  const tested: CombinedFinding[] = report.tested.map((t) => {
    const posterior = byKey.get(key(t.metric, t.phase));
    return { ...t, posterior, significant: t.significant && !!posterior?.credible };
  });
  return { ...report, tested, significant: tested.filter((t) => t.significant) };
}

/** NHANES short-sleep prevalence (survey-weighted, crude) for her life stage: the Beta–Binomial prior. */
export function stageShortSleepPrior(stage: "cycling" | "pregnant" | "breastfeeding" | "post"): number {
  const o = (nhanes.outcomes as unknown as { key: string; crude: Record<string, { est?: number }> }[]).find((x) => x.key === "short_sleep");
  return o?.crude[stage]?.est ?? o?.crude.cycling?.est ?? 0.24;
}
