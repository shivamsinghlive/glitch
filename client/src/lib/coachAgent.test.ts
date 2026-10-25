import { describe, expect, it } from "vitest";
import { parseCoachResponse, buildSystemPrompt } from "./coachAgent";

describe("parseCoachResponse", () => {
  it("parses reply, mood read and a valid meal action", () => {
    const r = parseCoachResponse(JSON.stringify({
      reply: "Logged! Eggs on toast, about 390 kcal.",
      mood_read: { valence: 0.4, arousal: 0.5 },
      actions: [{ type: "log_meal", meal: { name: "Eggs on toast", type: "Breakfast", calories: 390, protein: 20, carbs: 30, fats: 18, fiber: 3 } }],
    }));
    expect(r.reply).toMatch(/Logged/);
    expect(r.moodRead).toEqual({ valence: 0.4, arousal: 0.5 });
    expect(r.actions).toHaveLength(1);
  });

  it("drops invalid actions but keeps valid ones", () => {
    const r = parseCoachResponse(JSON.stringify({
      reply: "ok",
      actions: [
        { type: "log_meal", meal: { name: "Pizza", type: "Dinner", calories: 99999, protein: 10, carbs: 10, fats: 10 } },
        { type: "delete_everything" },
        { type: "remove_meal", name: "Latte" },
      ],
    }));
    expect(r.actions).toEqual([{ type: "remove_meal", name: "Latte" }]);
  });

  it("strips <think> blocks and tolerates surrounding text", () => {
    const r = parseCoachResponse('<think>hmm {not json}</think>Sure! {"reply":"Hi there","actions":[]}');
    expect(r.reply).toBe("Hi there");
  });

  it("falls back to the raw text when there is no JSON", () => {
    expect(parseCoachResponse("Just plain text").reply).toBe("Just plain text");
  });

  it("clamps out-of-range mood reads", () => {
    expect(parseCoachResponse('{"reply":"x","mood_read":{"valence":-3,"arousal":2}}').moodRead).toEqual({ valence: -1, arousal: 1 });
  });
});

describe("buildSystemPrompt", () => {
  it("adapts tone to the fused mood and includes today's meals", () => {
    const p = buildSystemPrompt({
      firstName: "Maya", goal: "manage blood sugar", localTime: "8:10 PM",
      todayMeals: [{ name: "Oatmeal", type: "Breakfast", calories: 300, protein: 10 }],
      mood: { valence: -0.5, arousal: 0.7, label: "tense", sources: ["face", "voice"] },
    });
    expect(p).toMatch(/seem tense/);
    expect(p).toMatch(/Breakfast: Oatmeal \(300 kcal\)/);
    expect(p).toMatch(/988/);
  });
});

describe("enforceBpSafety", () => {
  const cat = (s: number, d: number) => (s > 180 || d > 120 ? "crisis" : s >= 140 || d >= 90 ? "stage2" : s >= 130 || d >= 80 ? "stage1" : s >= 120 ? "elevated" : "normal");
  it("corrects a reassuring reply for a stage-1 reading", async () => {
    const { enforceBpSafety } = await import("./coachAgent");
    const out = enforceBpSafety("Your BP is 132/84, which is in a healthy range!", [{ type: "log_bp", systolic: 132, diastolic: 84 }], cat);
    expect(out).toMatch(/high \(stage 1\)/);
    expect(out).not.toMatch(/healthy/);
  });
  it("always gives 911 guidance for a crisis reading", async () => {
    const { enforceBpSafety } = await import("./coachAgent");
    expect(enforceBpSafety("Logged!", [{ type: "log_bp", systolic: 190, diastolic: 115 }], cat)).toMatch(/911/);
  });
  it("leaves accurate replies alone", async () => {
    const { enforceBpSafety } = await import("./coachAgent");
    const r = "Logged 118/76, that's in the normal range.";
    expect(enforceBpSafety(r, [{ type: "log_bp", systolic: 118, diastolic: 76 }], cat)).toBe(r);
  });
});

describe("period logging action", () => {
  it("accepts log_period_start with or without a date, rejects bad dates", () => {
    const r = parseCoachResponse(JSON.stringify({ reply: "ok", actions: [
      { type: "log_period_start" }, { type: "log_period_start", date: "2026-10-23" }, { type: "log_period_start", date: "yesterday" },
    ] }));
    expect(r.actions).toHaveLength(2);
  });
});

describe("vague meal follow-ups", () => {
  it("instructs one round of 2–3 follow-up questions before logging vague meals", () => {
    const p = buildSystemPrompt({ firstName: "Linda", goal: "stay healthy", localTime: "1:00 PM", todayMeals: [] });
    expect(p).toMatch(/VAGUE meals/);
    expect(p).toMatch(/do NOT log yet/);
    expect(p).toMatch(/ONE round of follow-ups/);
  });
});

import { buildSystemPrompt as bsp } from "./coachAgent";
describe("privacy mode prompt", () => {
  const base = { firstName: "Maya", goal: "feel better", conditions: ["hypertension"], todayMeals: [{ name: "oats", type: "Breakfast", calories: 300, protein: 10 }], menopause: { stage: "Early transition", flashesToday: 2, nightSweatNights14: 4 }, hormones: "on HRT", localTime: "Sunday 9:00 AM" };
  it("full mode includes the health summary", () => {
    const p = bsp(base);
    expect(p).toContain("Maya");
    expect(p).toContain("hypertension");
    expect(p).toContain("on HRT");
  });
  it("minimal mode leaks none of it", () => {
    const p = bsp({ ...base, minimal: true });
    for (const secret of ["Maya", "hypertension", "oats", "Early transition", "on HRT"]) expect(p).not.toContain(secret);
    expect(p).toContain("NOT to share");
  });
});
