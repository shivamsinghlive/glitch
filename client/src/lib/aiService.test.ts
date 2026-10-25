import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateExercisePlan, generateNutritionGoals, getMotivationalMessage } from "./aiService";
import { setAiMode } from "./aiPrivacy";

beforeEach(() => setAiMode("full"));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AI service fallbacks", () => {
  it("returns usable nutrition and exercise data when the external API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const goals = await generateNutritionGoals({
      name: "Ava",
      age: 29,
      weight: 62,
      height: 168,
      goal: "lose_weight",
    });

    expect(goals.calorieTarget).toBeGreaterThan(0);
    expect(goals.proteinTarget).toBeGreaterThan(0);
    expect(goals.rationale.length).toBeGreaterThan(0);

    const plan = await generateExercisePlan({
      age: 29,
      weight: 62,
      height: 168,
      goal: "lose_weight",
      equipment: ["dumbbells"],
      workoutStyles: ["weight_training", "running"],
    });

    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0]?.name.length).toBeGreaterThan(0);

    const message = await getMotivationalMessage({
      name: "Ava",
      goal: "lose_weight",
      caloriesPct: 0.7,
      proteinPct: 0.8,
      streakDays: 5,
    });

    expect(message.length).toBeGreaterThan(0);
  });
});

describe("AI proxy", () => {
  it("sends chat requests to the server proxy, never to Groq with a key", async () => {
    const { coachCompletion } = await import("./aiService");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: '{"reply":"hi","actions":[]}' }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await coachCompletion([{ role: "user", content: "hello" }])).toContain('"reply":"hi"');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("/api/llm/chat");
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body).patient).toBe(true);
  });

  it("falls back to an offline coach reply that still logs a hot flash and BP", async () => {
    const { coachCompletion } = await import("./aiService");
    const { parseCoachResponse } = await import("./coachAgent");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":{"code":"rate_limited"}}', { status: 503 })));
    const res = parseCoachResponse(await coachCompletion([{ role: "user", content: "Severe hot flash, and my blood pressure is 132 over 84" }]));
    expect(res.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "log_hot_flash", intensity: 3 }),
      expect.objectContaining({ type: "log_bp", systolic: 132, diastolic: 84 }),
    ]));
    expect(res.reply.length).toBeGreaterThan(0);
  });
});

describe("JSON-mode recovery", () => {
  it("uses Groq's failed_generation text when the model answered in plain text", async () => {
    const { coachCompletion } = await import("./aiService");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "json_validate_failed", failed_generation: "What kind of pasta was it?" } }), { status: 400 })));
    expect(await coachCompletion([{ role: "user", content: "had pasta" }])).toBe("What kind of pasta was it?");
  });
});

describe("AI privacy modes", () => {
  it("sends nothing when the AI is off", async () => {
    setAiMode("off");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await getMotivationalMessage({ name: "Ava", goal: "maintain", streak: 3 } as never);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("in chat mode, blocks profile-carrying calls but lets the coach chat through", async () => {
    setAiMode("chat");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: '{"reply":"hi","actions":[]}' }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getMotivationalMessage({ name: "Ava", goal: "maintain", streak: 3 } as never);
    expect(fetchMock).not.toHaveBeenCalled();
    const { coachCompletion } = await import("./aiService");
    await coachCompletion([{ role: "user", content: "hello" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("records exactly what was sent", async () => {
    setAiMode("chat");
    const { getOutboundLog, clearOutboundLog } = await import("./aiPrivacy");
    clearOutboundLog();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: "{}" }), { status: 200 })));
    const { coachCompletion } = await import("./aiService");
    await coachCompletion([{ role: "user", content: "my knee hurts" }]);
    expect(getOutboundLog().at(-1)?.text).toContain("my knee hurts");
  });
});

import { analyzeFoodImage, lookupIngredient } from "./aiService";
import { AiConsentNeededError, grantPhotoConsent } from "./aiPrivacy";

describe("food photo analysis never invents numbers", () => {
  const photo = "data:image/jpeg;base64,AAAA";
  const ok = (content: string) => vi.fn(async () => new Response(JSON.stringify({ content }), { status: 200 }));

  it("returns the model's numbers when they are valid", async () => {
    vi.stubGlobal("fetch", ok('{"name":"Oatmeal","calories":300,"protein":10,"carbs":50,"fats":6,"fiber":6,"omega3":0.1,"confidence":"high","notes":""}'));
    const r = await analyzeFoodImage(photo);
    expect(r).toMatchObject({ name: "Oatmeal", calories: 300, confidence: "high" });
  });

  it("throws (so the app asks the user to type it in) when the service fails or the reply is unusable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(analyzeFoodImage(photo)).rejects.toThrow();
    vi.stubGlobal("fetch", ok("sorry, I can't tell"));
    await expect(analyzeFoodImage(photo)).rejects.toThrow(/reliably/);
    vi.stubGlobal("fetch", ok('{"name":"x","calories":-5,"protein":1,"carbs":1,"fats":1}'));
    await expect(analyzeFoodImage(photo)).rejects.toThrow();
  });

  it("in chat-only mode a photo needs explicit consent, once", async () => {
    setAiMode("chat");
    const fetchMock = ok('{"name":"Salad","calories":200,"protein":8,"carbs":15,"fats":10,"confidence":"medium"}');
    vi.stubGlobal("fetch", fetchMock);
    await expect(analyzeFoodImage(photo)).rejects.toBeInstanceOf(AiConsentNeededError);
    expect(fetchMock).not.toHaveBeenCalled();
    grantPhotoConsent();
    await analyzeFoodImage(photo);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(analyzeFoodImage(photo)).rejects.toBeInstanceOf(AiConsentNeededError); // consent was single-use
  });

  it("ingredient lookup sends only a food name, so it works in chat-only mode", async () => {
    setAiMode("chat");
    const fetchMock = ok('{"found":true,"name":"1 tbsp flax","calories":37,"protein":1.3,"carbs":2,"fats":3,"fiber":1.9,"omega3":1.6}');
    vi.stubGlobal("fetch", fetchMock);
    const r = await lookupIngredient("flax seeds");
    expect(r.found).toBe(true);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).messages[0].content).not.toMatch(/Maya|age|weight/i);
  });
});
