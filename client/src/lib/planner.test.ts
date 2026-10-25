import { describe, expect, it } from "vitest";
import { planWeek, weekMix, type PlanInput } from "./planner";
import { retrieve } from "./evidence";

const base: PlanInput = { goal: "maintain", equipment: ["none"], styles: ["calisthenics"], daysPerWeek: 4, age: 50, boneCohort: true };
const names = (p: ReturnType<typeof planWeek>) => p.days.flatMap((d) => d.exercises.map((e) => e.id));

describe("evidence retrieval (RAG)", () => {
  it("retrieves bone-and-strength passages for a bone query and balance passages for a balance query", () => {
    expect(retrieve("bone strength resistance impact postmenopause", 3).map((r) => r.passage.id)).toEqual(expect.arrayContaining(["bmd-freq"]));
    expect(retrieve("balance falls older", 2)[0].passage.id).toBe("cdc-older");
  });
  it("returns nothing for an unrelated query", () => {
    expect(retrieve("pizza topping", 3)).toEqual([]);
  });
});

describe("planWeek follows the user's choices", () => {
  it("fills every chosen day with exercises (no empty days)", () => {
    for (let n = 1; n <= 7; n++) {
      const p = planWeek({ ...base, daysPerWeek: n });
      expect(p.days).toHaveLength(n);
      p.days.forEach((d) => expect(d.exercises.length).toBeGreaterThan(0));
    }
  });

  it("only uses equipment the user has", () => {
    const bodyweight = names(planWeek({ ...base, equipment: ["none"], styles: ["weight_training"] }));
    for (const heavy of ["goblet-squat", "leg-press", "kb-swing", "db-press", "band-row", "pull-up", "lat-pulldown"]) expect(bodyweight).not.toContain(heavy);
    const dumbbells = names(planWeek({ ...base, equipment: ["dumbbells"], styles: ["weight_training"], boneCohort: false, goal: "build_muscle" }));
    expect(dumbbells).toContain("goblet-squat");
    expect(dumbbells).not.toContain("leg-press");
  });

  it("prefers the user's chosen styles", () => {
    const run = names(planWeek({ ...base, boneCohort: false, goal: "maintain", styles: ["running"], daysPerWeek: 5 }));
    expect(run.some((id) => id === "brisk-walk" || id === "jog-intervals")).toBe(true);
    const yoga = planWeek({ ...base, styles: ["yoga"], daysPerWeek: 4 });
    expect(names(yoga).some((id) => ["sun-salutation", "tree-pose", "cat-cow"].includes(id))).toBe(true);
  });

  it("still adds strength for the goal when the user only picked yoga, and says why", () => {
    const p = planWeek({ ...base, goal: "build_muscle", boneCohort: false, styles: ["yoga"], daysPerWeek: 4 });
    expect(p.counts.strength).toBeGreaterThanOrEqual(2);
    const added = p.days.flatMap((d) => d.exercises).filter((e) => e.kind === "strength").map((e) => e.why);
    expect(added.some((w) => /even though you picked yoga/i.test(w))).toBe(true);
    expect(p.notes.join(" ")).toMatch(/still added strength/i);
  });

  it("bone cohort gets 2–3 strength days plus impact, with citations", () => {
    const p = planWeek({ ...base, daysPerWeek: 5, equipment: ["dumbbells"], styles: ["weight_training"] });
    expect(p.counts.strength).toBeGreaterThanOrEqual(2);
    expect(p.counts.strength).toBeLessThanOrEqual(3);
    expect(p.counts.impact).toBeGreaterThanOrEqual(1);
    expect(p.evidence.map((e) => e.id)).toContain("bmd-freq");
    p.days.flatMap((d) => d.exercises).forEach((e) => expect(e.sources.length).toBeGreaterThan(0));
  });

  it("changes when the user changes their choices", () => {
    const a = JSON.stringify(planWeek({ ...base, equipment: ["none"], styles: ["yoga"] }).days);
    const b = JSON.stringify(planWeek({ ...base, equipment: ["full_gym"], styles: ["weight_training"] }).days);
    const c = JSON.stringify(planWeek({ ...base, daysPerWeek: 6 }).days);
    expect(a).not.toBe(b);
    expect(c).not.toBe(JSON.stringify(planWeek(base).days));
  });

  it("is deterministic", () => {
    expect(planWeek(base)).toEqual(planWeek(base));
  });

  it("weekMix matches the goal", () => {
    expect(weekMix({ goal: "build_muscle", daysPerWeek: 5, boneCohort: false, styles: [] }).filter((t) => t === "strength").length).toBeGreaterThanOrEqual(3);
    expect(weekMix({ goal: "lose_weight", daysPerWeek: 5, boneCohort: false, styles: ["hiit"] })).toContain("hiit");
  });
});

import { evidenceForQuestion, evidenceBlock } from "./evidence";
import { buildSystemPrompt } from "./coachAgent";

describe("coach grounding (RAG)", () => {
  it("retrieves evidence for health questions and nothing for small talk", () => {
    expect(evidenceForQuestion("should I lift weights for my bones").map((p) => p.id)).toEqual(expect.arrayContaining(["liftmor"]));
    expect(evidenceForQuestion("how much calcium and vitamin D").map((p) => p.id)).toContain("esceo");
    expect(evidenceForQuestion("hello how are you")).toEqual([]);
    expect(evidenceForQuestion("I'm having a hot flash")).toEqual([]);
  });

  it("puts retrieved passages, with URLs, in the prompt, even in privacy mode", () => {
    const ev = evidenceBlock(evidenceForQuestion("is yoga enough for bone health"));
    const p = buildSystemPrompt({ minimal: true, firstName: "x", goal: "x", todayMeals: [], localTime: "Sunday", evidence: ev });
    expect(p).toContain("EVIDENCE");
    expect(p).toContain("https://");
    expect(p).not.toContain("Maya");
  });
});
