/**
 * Glitch — does the evidence retrieval find the right passages, and does the planner obey the user's choices?
 *
 * Retrieval is scored on a small hand-labelled set (written by the team, so it is a sanity check, not a
 * benchmark): each question lists the passages that actually answer it. Off-topic messages should retrieve
 * nothing, so the coach doesn't attach evidence to small talk.
 */
import { EVIDENCE, evidenceForQuestion, retrieve } from "./evidence";
import { planWeek, type PlanInput } from "./planner";
import { rng } from "./detectorEvaluation";
import type { Equipment, WorkoutStyle } from "@/contexts/AppContext";

export const LABELLED: { q: string; gold: string[] }[] = [
  { q: "should I lift weights for my bones", gold: ["liftmor", "meta17", "bmd-freq"] },
  { q: "how many days a week should I strength train", gold: ["bmd-freq", "cdc-adult", "cdc-older", "meta17"] },
  { q: "is yoga enough for bone health", gold: ["yoga-limit"] },
  { q: "is walking enough to protect my bones", gold: ["yoga-limit"] },
  { q: "how much calcium do I need", gold: ["esceo"] },
  { q: "how much vitamin D should I take", gold: ["esceo"] },
  { q: "how much protein do I need after menopause", gold: ["esceo", "protein-exercise"] },
  { q: "why am I losing bone at menopause", gold: ["aaos-loss"] },
  { q: "when should I get a bone density scan", gold: ["dexa"] },
  { q: "how much cardio do I need each week", gold: ["cdc-adult"] },
  { q: "I'm worried about falling, what helps my balance", gold: ["cdc-older"] },
  { q: "what is the straw stage of perimenopause", gold: ["straw"] },
  { q: "does lifting heavy help women after menopause", gold: ["liftmor", "meta17", "bmd-freq", "stanford-50"] },
  { q: "how much weight should I lift for bone density", gold: ["bmd-freq", "meta17"] },
  { q: "do I need to jump for my bones", gold: ["bmd-freq", "liftmor"] },
  { q: "what was the early menopause strength training trial", gold: ["stopem"] },
  { q: "why do I lose muscle as I get older", gold: ["stanford-50", "aaos-loss"] },
  { q: "how often should I exercise", gold: ["bmd-freq", "cdc-adult"] },
];
export const OFF_TOPIC = ["I'm having a hot flash", "hello how are you", "what did I eat today", "I can't sleep", "log my blood pressure 130 over 85", "tell me a joke"];

export interface RetrievalReport {
  questions: number; passages: number;
  hitAt1: number; hitAt3: number; precisionAt3: number; recallAt3: number; mrr: number;
  /** Share of questions where retrieval returned nothing, although something relevant existed */
  noAnswer: number;
  offTopic: { messages: number; correctlyEmpty: number };
  randomBaseline: { hitAt3: number; precisionAt3: number };
  misses: { q: string; got: string[]; wanted: string[] }[];
}

export function evaluateRetrieval(): RetrievalReport {
  let hit1 = 0, hit3 = 0, prec = 0, rec = 0, mrr = 0, none = 0;
  const misses: RetrievalReport["misses"] = [];
  for (const { q, gold } of LABELLED) {
    const ids = evidenceForQuestion(q, 3).map((p) => p.id);
    if (ids.length === 0) none++;
    const goldSet = new Set(gold);
    if (ids[0] && goldSet.has(ids[0])) hit1++;
    const found = ids.filter((id) => goldSet.has(id));
    if (found.length) hit3++; else misses.push({ q, got: ids, wanted: gold });
    prec += ids.length ? found.length / ids.length : 0;
    rec += found.length / gold.length;
    const rank = retrieve(q, EVIDENCE.length).findIndex((r) => goldSet.has(r.passage.id));
    mrr += rank >= 0 ? 1 / (rank + 1) : 0;
  }
  const n = LABELLED.length;
  // Random baseline: 3 passages drawn at random, averaged over many draws (deterministic seed)
  const r = rng(9);
  let rHit = 0, rPrec = 0;
  const draws = 400;
  for (let d = 0; d < draws; d++) for (const { gold } of LABELLED) {
    const pick = new Set<string>();
    while (pick.size < 3) pick.add(EVIDENCE[Math.floor(r.next() * EVIDENCE.length)].id);
    const f = Array.from(pick).filter((id) => gold.includes(id)).length;
    if (f) rHit++;
    rPrec += f / 3;
  }
  return {
    questions: n, passages: EVIDENCE.length,
    hitAt1: +(hit1 / n).toFixed(3), hitAt3: +(hit3 / n).toFixed(3), precisionAt3: +(prec / n).toFixed(3), recallAt3: +(rec / n).toFixed(3), mrr: +(mrr / n).toFixed(3),
    noAnswer: +(none / n).toFixed(3),
    offTopic: { messages: OFF_TOPIC.length, correctlyEmpty: OFF_TOPIC.filter((q) => evidenceForQuestion(q).length === 0).length },
    randomBaseline: { hitAt3: +(rHit / (draws * n)).toFixed(3), precisionAt3: +(rPrec / (draws * n)).toFixed(3) },
    misses,
  };
}

// ── Planner: does it obey the user's choices? ────────────────

const EQUIPMENT: Equipment[] = ["none", "dumbbells", "resistance_bands", "pull_up_bar", "kettlebells", "full_gym"];
const STYLES: WorkoutStyle[] = ["calisthenics", "weight_training", "yoga", "running", "hiit", "pilates"];
const GOALS = ["maintain", "lose_weight", "build_muscle", "manage_diabetes"] as const;
// Equipment each exercise needs (mirrors planner.ts); used to check the plan never asks for kit the user doesn't have
const NEEDS: Record<string, Equipment[]> = {
  "goblet-squat": ["dumbbells", "kettlebells"], "leg-press": ["full_gym"], rdl: ["dumbbells", "kettlebells"], "kb-swing": ["kettlebells"], "db-press": ["dumbbells"],
  "band-row": ["resistance_bands"], "band-press": ["resistance_bands"], "lat-pulldown": ["full_gym"], "pull-up": ["pull_up_bar"], "gym-cardio": ["full_gym"],
};

export interface PlannerReport {
  plans: number;
  /** Plans that asked for equipment the user does not have (should be 0) */
  equipmentViolations: number;
  /** Chosen training days with no exercises (should be 0) */
  emptyDays: number;
  /** Bone-cohort plans with 3+ days that had 2 or 3 strength days */
  boneStrengthRule: { plans: number; satisfied: number };
  /** Exercises that carry at least one evidence citation */
  citedShare: number;
  /** Share of exercises that match at least one of the user's chosen styles */
  styleMatchShare: number;
  /** Share of plans that have at least one exercise matching a chosen style */
  plansWithStyleMatch: number;
}

export function evaluatePlanner(plans = 3000, seed = 21): PlannerReport {
  const r = rng(seed);
  const subset = <T,>(all: T[]) => { const s = all.filter(() => r.next() < 0.45); return s.length ? s : [all[Math.floor(r.next() * all.length)]]; };
  let eqViol = 0, empty = 0, boneN = 0, boneOk = 0, ex = 0, cited = 0, styled = 0, planWithStyle = 0;
  for (let i = 0; i < plans; i++) {
    const input: PlanInput = { goal: GOALS[Math.floor(r.next() * 4)], equipment: subset(EQUIPMENT), styles: subset(STYLES), daysPerWeek: 1 + Math.floor(r.next() * 7), age: 40 + Math.floor(r.next() * 30), boneCohort: r.next() < 0.5 };
    const plan = planWeek(input);
    const have = new Set(input.equipment);
    let planHasStyle = false;
    for (const d of plan.days) {
      if (d.exercises.length === 0) empty++;
      for (const e of d.exercises) {
        ex++;
        const needs = NEEDS[e.id];
        if (needs && !have.has("full_gym") && !needs.some((n) => have.has(n))) eqViol++;
        if (e.sources.length) cited++;
        if (/^Matches your pick/.test(e.why ?? "")) { styled++; planHasStyle = true; }
      }
    }
    if (planHasStyle) planWithStyle++;
    if (input.boneCohort && input.daysPerWeek >= 3) { boneN++; if (plan.counts.strength >= 2 && plan.counts.strength <= 3) boneOk++; }
  }
  return {
    plans, equipmentViolations: eqViol, emptyDays: empty, boneStrengthRule: { plans: boneN, satisfied: boneOk },
    citedShare: +(cited / ex).toFixed(3), styleMatchShare: +(styled / ex).toFixed(3), plansWithStyleMatch: +(planWithStyle / plans).toFixed(3),
  };
}
