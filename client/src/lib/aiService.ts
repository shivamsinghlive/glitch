/**
 * NutriSense AI — AI service layer
 * All model calls go through the app's own /api/llm proxy (server/llmProxy.ts), which holds the Groq
 * key, picks models and handles rate limits. Every function here also has a local fallback, so the
 * app keeps working when the proxy reports that Groq is busy or unreachable.
 */
import { assertAiAllowed, recordOutbound, type AiScope } from "./aiPrivacy";
import { computeNutritionGoals } from "./nutritionPlan";
import { planDay } from "./planner";
import { evidenceBlock, passageById, retrieve } from "./evidenceRag";
import { offlineCoachReply } from "./coachAgent";

// ── Generic text chat (JSON output) ──────────────────────────
interface ChatOpts {
  /** Background jobs start on the fallback model so the main model's quota stays free for live chat */
  background?: boolean;
  /** Live chat: if every model is busy, the server waits out Groq's suggested delay once more */
  patient?: boolean;
  /** "chat" calls carry only the user's own messages; "full" calls may carry profile or health data. Default "full". */
  scope?: AiScope;
}

async function chat(
  messages: { role: string; content: string }[],
  json = true,
  maxTokens = 1200,
  opts: ChatOpts = {}
): Promise<string> {
  const { scope = "full", ...rest } = opts;
  assertAiAllowed(scope);
  recordOutbound("chat", messages);
  const res = await fetch("/api/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, json, maxTokens, ...rest }),
  });
  if (!res.ok) {
    const err = await res.text();
    // JSON mode sometimes rejects a reply the model wrote as plain text (e.g. a follow-up question).
    // Groq hands that text back as `failed_generation`; callers already treat non-JSON text as the reply.
    if (res.status === 400) {
      try {
        const e = JSON.parse(err)?.error;
        if (e?.code === "json_validate_failed" && typeof e.failed_generation === "string" && e.failed_generation.trim()) return e.failed_generation;
      } catch { /* not JSON */ }
    }
    throw new Error(`AI proxy error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content as string;
}

// ── Vision chat (food photo analysis) ────────────────────────
async function visionChat(
  imageBase64DataUrl: string,
  textPrompt: string
): Promise<string> {
  assertAiAllowed("photo");
  recordOutbound("photo", `[food photo, about ${Math.round(imageBase64DataUrl.length / 1365)} KB]\n${textPrompt}`);
  const res = await fetch("/api/llm/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageBase64DataUrl, prompt: textPrompt }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI vision proxy error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content as string;
}

// ── Safe JSON parse helper ────────────────────────────────────
function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    // Reasoning models may prepend <think>…</think>; drop it before looking for JSON
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
    // Extract JSON block if wrapped in markdown code fences
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    const jsonStr = match ? match[1] ?? match[0] : raw;
    return JSON.parse(jsonStr.trim()) as T;
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. Personalized Nutrition Goals
// ─────────────────────────────────────────────────────────────
export interface NutritionGoals {
  calorieTarget: number;
  proteinTarget: number;   // g
  carbsTarget:   number;   // g
  fatsTarget:    number;   // g
  fiberTarget:   number;   // g
  omega3Target:  number;   // g
  vitDTarget:    number;   // IU
  vitB12Target:  number;   // mcg
  ironTarget:    number;   // mg
  stepGoal:      number;
  rationale:     string;
}

export async function generateNutritionGoals(profile: {
  name: string;
  age: number;
  weight: number;
  height: number;
  goal: string;
  biologicalSex?: "female" | "male" | "prefer_not_to_say";
  /** Training days per week, if known */
  daysPerWeek?: number;
  /** Peri/post-menopause or 40+ female */
  boneCohort?: boolean;
  postmenopause?: boolean;
  /** e.g. "pregnant" — stages where a calorie deficit is unsafe set allowCalorieDeficit=false */
  lifeStage?: { label: string; allowCalorieDeficit: boolean };
}): Promise<NutritionGoals> {
  // The numbers are computed on the device (Mifflin-St Jeor + guidance), so they are always correct for the
  // profile and update instantly when weight, goal or training days change. No AI call can alter them.
  const { basis: _basis, ...goals } = computeNutritionGoals({
    name: profile.name, age: profile.age, weight: profile.weight, height: profile.height, goal: profile.goal,
    sex: profile.biologicalSex, daysPerWeek: profile.daysPerWeek, boneCohort: profile.boneCohort, postmenopause: profile.postmenopause,
    allowCalorieDeficit: profile.lifeStage?.allowCalorieDeficit,
  });
  return goals;
}

// ─────────────────────────────────────────────────────────────
// 2. Personalized Exercise Plan
// ─────────────────────────────────────────────────────────────
export interface Exercise {
  id: string;
  name: string;
  detail: string;
  burn: number;
  emoji: string;
  rationale: string;
  cues: string[];
  goodCue: string;
  sets?: number;
  reps?: number;
  duration?: string;
  formCues?: string[];
  caloriesBurned?: number;
  dayOfWeek?: number;
  completed?: boolean;
  description?: string;
  /** Why this exercise is in the plan: which of the user's choices it matches, or why it was added */
  why?: string;
  /** Evidence passage ids (see evidence.ts) that support it */
  sources?: string[];
  formName?: string;
}

export async function generateExercisePlan(profile: {
  age: number;
  weight: number;
  height: number;
  goal: string;
  equipment?: string[];
  workoutStyles?: string[];
  cyclePhase?: string;
  daysPerWeek?: number;
  /** Peri/post-menopause or 40+ female: turns on the bone-and-muscle rules */
  boneCohort?: boolean;
}): Promise<Exercise[]> {
  const goalLabels: Record<string, string> = {
    lose_weight:     "lose weight and burn fat",
    maintain:        "maintain fitness and general health",
    build_muscle:    "build lean muscle mass",
    manage_diabetes: "manage Type 2 diabetes through exercise",
  };
  const goalDesc = goalLabels[profile.goal] ?? profile.goal;
  const bmi = (profile.weight / ((profile.height / 100) ** 2)).toFixed(1);

  // Local, evidence-grounded plan built from the user's own choices (equipment, styles, goal, life stage).
  // It is the default, and the fallback whenever the AI is off or unavailable.
  const fallback: Exercise[] = planDay({
    goal: profile.goal as never, equipment: (profile.equipment ?? ["none"]) as never, styles: (profile.workoutStyles ?? []) as never,
    daysPerWeek: profile.daysPerWeek ?? 4, age: profile.age, boneCohort: !!profile.boneCohort, cyclePhase: profile.cyclePhase,
  });

  try {
    const equipmentList = profile.equipment?.length
      ? profile.equipment.map((e) => e.replace(/_/g, " ")).join(", ")
      : "no equipment (bodyweight only)";

    const styleList = profile.workoutStyles?.length
      ? profile.workoutStyles.map((s) => s.replace(/_/g, " ")).join(", ")
      : "general fitness";

    const cycleContext = profile.cyclePhase
      ? `\nMenstrual cycle phase: ${profile.cyclePhase}. Adjust workout intensity accordingly:\n- menstrual: gentle/restorative only\n- follicular: progressive overload welcome\n- ovulation: peak performance\n- luteal: moderate, recovery-focused`
      : "";

    // RAG: retrieve the evidence most relevant to this user and make the model ground its plan in it
    const query = [goalDesc, profile.boneCohort ? "bone menopause postmenopause strength impact frequency" : "general guideline", styleList, equipmentList].join(" ");
    const passages = retrieve(query, 5).map((r) => r.passage);
    const prompt = `You are a certified personal trainer. Create a personalized daily workout plan.

EVIDENCE (ground your plan in this; cite passage ids in each exercise's "sources"):
${evidenceBlock(passages)}

User: Age ${profile.age}, Weight ${profile.weight}kg, Height ${profile.height}cm, BMI ${bmi}
Goal: ${goalDesc}
Available equipment: ${equipmentList}
Preferred training styles: ${styleList}${cycleContext}

Critical rules:
- ONLY use exercises that can be done with the available equipment listed above
- Honour the user's preferred training styles as much as possible
- BUT always include at least 1-2 exercises that serve their primary fitness goal even if outside their preferred style (e.g. if goal is build_muscle but they only chose yoga, add 1-2 strength exercises and explain why)
- 4-6 exercises total, appropriate for their BMI and age
- For diabetes: include low-impact cardio and resistance work
- For weight loss: include cardio + compound movements
- For muscle building: prioritize compound lifts or calisthenics progressions
- Realistic calorie burn estimates
- Specific, actionable form cues (not generic)
- In rationale, briefly explain why this exercise suits their goal/equipment/style
- Each exercise must include "sources": an array of 1-2 evidence ids from the EVIDENCE list that support it

Return ONLY a valid JSON array (no markdown, no extra text):
[{"id":"squat","name":"Bodyweight Squat","detail":"3 × 15 reps","burn":80,"emoji":"🏋️","rationale":"Builds leg strength with no equipment needed","sources":["bmd-freq"],"cues":["Keep chest up","Knees over toes","Lower hips to parallel","Drive through heels"],"goodCue":"Perfect depth! Great form"}]`;

    const raw = await chat([{ role: "user", content: prompt }], true, 2600, { background: true });

    // Groq with json_object mode wraps arrays — handle both cases
    let parsed: Exercise[];
    try {
      const obj = JSON.parse(raw.trim());
      if (Array.isArray(obj)) {
        parsed = obj;
      } else {
        // Try common wrapper keys
        parsed = obj.exercises ?? obj.plan ?? obj.workout ?? Object.values(obj)[0] as Exercise[];
      }
    } catch {
      parsed = safeParseJSON<Exercise[]>(raw, []);
    }

    const valid = Array.isArray(parsed)
      ? parsed.filter((e) => e && typeof e.name === "string" && typeof e.detail === "string" && Array.isArray(e.cues))
          .map((e, i) => ({ ...e, id: e.id || `ai-${i}`, burn: Number(e.burn) || 80, emoji: e.emoji || "🏋️", why: e.rationale, sources: (e.sources ?? []).filter((id) => passageById(id)) }))
      : [];
    return valid.length >= 3 ? valid : fallback;
  } catch (error) {
    console.warn("Exercise plan generation failed, using local fallback:", error);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────
// 3. AI Food Analysis from image (base64 data URL)
// ─────────────────────────────────────────────────────────────
export interface FoodAnalysis {
  name: string;
  calories: number;
  protein:  number;
  carbs:    number;
  fats:     number;
  fiber:    number;
  omega3:   number;
  confidence: string;
  notes: string;
}

export async function analyzeFoodImage(base64DataUrl: string): Promise<FoodAnalysis> {
  // Never invent nutrition numbers: if the photo can't be analysed, throw so the app asks the user to type
  // it in. (An earlier version silently returned a made-up "Mixed Meal, 400 kcal".)
  const prompt = `You are a nutrition expert. Analyze this food image and estimate nutritional content for a typical single serving.

Return ONLY valid JSON (no markdown, no explanation):
{"name":"Food Name","calories":400,"protein":20,"carbs":45,"fats":12,"fiber":5.0,"omega3":0.5,"confidence":"high","notes":"Brief note about the meal"}

If you cannot identify the food clearly, make your best estimate and set confidence to "low".`;

  const raw = await visionChat(base64DataUrl, prompt);
  const r = safeParseJSON<Partial<FoodAnalysis> | null>(raw, null);
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
  const calories = num(r?.calories), protein = num(r?.protein), carbs = num(r?.carbs), fats = num(r?.fats);
  if (!r || typeof r.name !== "string" || !r.name.trim() || calories == null || protein == null || carbs == null || fats == null || calories > 4000) {
    throw new Error("The photo could not be analysed reliably");
  }
  return {
    name: r.name.trim().slice(0, 80), calories, protein, carbs, fats,
    fiber: num(r.fiber) ?? 0, omega3: num(r.omega3) ?? 0,
    confidence: r.confidence === "high" || r.confidence === "medium" ? r.confidence : "low",
    notes: typeof r.notes === "string" ? r.notes : "",
  };
}

// ─────────────────────────────────────────────────────────────
// 4. Ingredient nutrition lookup
// ─────────────────────────────────────────────────────────────
export interface IngredientNutrition {
  found: boolean;
  name: string;
  calories: number;
  protein:  number;
  carbs:    number;
  fats:     number;
  fiber:    number;
  omega3:   number;
}

export async function lookupIngredient(ingredient: string): Promise<IngredientNutrition> {
  const fallback: IngredientNutrition = {
    found: false, name: ingredient, calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, omega3: 0,
  };

  try {
    const prompt = `You are a nutrition database. Provide nutritional content for: "${ingredient}"
Use a typical standard serving size.

Return ONLY valid JSON (no markdown):
{"found":true,"name":"1 tbsp Flax Seeds","calories":37,"protein":1.3,"carbs":2.0,"fats":3.0,"fiber":1.9,"omega3":1.60}`;

    const raw = await chat([{ role: "user", content: prompt }], true, 700, { scope: "chat" }); // sends only a food name
    return safeParseJSON<IngredientNutrition>(raw, fallback);
  } catch (error) {
    console.warn("Ingredient lookup failed, using local fallback:", error);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────
// 5. Motivational message
// ─────────────────────────────────────────────────────────────
export async function getMotivationalMessage(profile: {
  name: string;
  goal: string;
  caloriesPct: number;
  proteinPct: number;
  streakDays: number;
}): Promise<string> {
  try {
    const prompt = `Write a short (max 12 words) warm motivational message for ${profile.name} who is ${Math.round(profile.caloriesPct * 100)}% through their calorie goal and ${Math.round(profile.proteinPct * 100)}% through their protein goal today. They have a ${profile.streakDays}-day logging streak. Goal: ${profile.goal}. Be specific and warm. Return ONLY the message text, no quotes, no JSON.`;

    return await chat([{ role: "user", content: prompt }], false, 300, { background: true });
  } catch (error) {
    console.warn("Motivational message generation failed, using local fallback:", error);
    return "Keep going — your plan is working.";
  }
}

// ─────────────────────────────────────────────────────────────
// Appraisal coaching — warm re-wording only
// The strategy is chosen by the deterministic engine in lib/appraisal.ts; the model may only
// phrase it. No name or identifiers are sent.
// ─────────────────────────────────────────────────────────────
export async function phraseCoaching(ctx: {
  stateLabel: string;
  insight: string;
  strategyTitle: string;
  note?: string;
}): Promise<string | null> {
  try {
    const prompt = `You are a warm, non-judgmental wellness coach. The user checked in feeling: "${ctx.stateLabel}".
Context: ${ctx.insight}
${ctx.note ? `They wrote: "${ctx.note.slice(0, 200)}"\n` : ""}The coaching strategy already chosen for them is: "${ctx.strategyTitle}".
Write ONE or TWO short sentences (max 35 words) that validate how they feel and encourage them to try that strategy.
Rules: never shame, never mention calories or weight, never give medical advice, don't suggest a different strategy.
Return ONLY the message text.`;
    const text = (await chat([{ role: "user", content: prompt }], false, 400)).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return text || null;
  } catch (error) {
    console.warn("Coaching phrasing failed, using engine text:", error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Conversational coach — multi-turn, JSON (see lib/coachAgent.ts)
// ─────────────────────────────────────────────────────────────
export async function coachCompletion(messages: { role: "system" | "user" | "assistant"; content: string }[]): Promise<string> {
  try {
    return await chat(messages, true, 700, { patient: true, scope: "chat" });
  } catch (error) {
    // Offline failsafe: still log hot flashes / BP / mood from the user's words, in the same JSON shape
    console.warn("Coach model unavailable, using offline reply:", error);
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    return offlineCoachReply(lastUser?.content ?? "");
  }
}
