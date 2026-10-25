/**
 * Glitch — conversational coach ("Glitchy")
 * The model replies like a person AND returns structured actions (log/remove meals) plus its own
 * read of the user's mood from their words. Actions are validated with zod before they touch state,
 * so a malformed or hallucinated response can't corrupt the user's log.
 */
import { z } from "zod";
import { TONE_GUIDE, type FusedMood } from "./emotion";
import { evidencePromptBlock } from "./evidence";

export const MealActionSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]),
  calories: z.number().min(0).max(4000),
  protein: z.number().min(0).max(300),
  carbs: z.number().min(0).max(500),
  fats: z.number().min(0).max(300),
  fiber: z.number().min(0).max(100).default(0),
  sugar: z.number().min(0).max(300).optional(),
});
export type MealAction = z.infer<typeof MealActionSchema>;

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("log_meal"), meal: MealActionSchema }),
  z.object({ type: z.literal("remove_meal"), name: z.string().min(1) }),
  z.object({ type: z.literal("log_hot_flash"), intensity: z.number().int().min(1).max(3).default(2), night: z.boolean().default(false), count: z.number().int().min(1).max(10).default(1) }),
  z.object({ type: z.literal("log_bp"), systolic: z.number().int().min(70).max(250), diastolic: z.number().int().min(40).max(150), pulse: z.number().int().min(30).max(220).optional() }),
  z.object({ type: z.literal("log_mood"), mood: z.number().int().min(1).max(5) }),
  z.object({ type: z.literal("log_period_start"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
]);
export type CoachAction = z.infer<typeof ActionSchema>;

export interface CoachSource {
  title: string;
  url: string;
}

export interface CoachResponse {
  reply: string;
  moodRead: { valence: number; arousal: number } | null;
  actions: CoachAction[];
  /** Reputable sources backing any health claim in the reply (may be empty) */
  sources: CoachSource[];
}

/** Only accept citations from reputable health/medical/research domains. */
const TRUSTED_SOURCE = /^(https:\/\/)([a-z0-9-]+\.)*(nih\.gov|ncbi\.nlm\.nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov|who\.int|cdc\.gov|uspreventiveservicestaskforce\.org|mayoclinic\.org|nhs\.uk|menopause\.org|acog\.org|heart\.org|health\.harvard\.edu|stanford\.edu|frontiersin\.org|mdpi\.com|springer\.com|orthoinfo\.org|niams\.nih\.gov)(\/|$)/i;

/** Parse the model's JSON, keeping valid actions and dropping invalid ones individually. */
export function parseCoachResponse(raw: string): CoachResponse {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  let obj: Record<string, unknown> = {};
  try { obj = match ? JSON.parse(match[0]) : {}; } catch { /* fall through */ }

  const reply = typeof obj.reply === "string" && obj.reply.trim() ? obj.reply.trim() : cleaned.trim() || "Sorry, I lost my train of thought. Could you say that again?";
  const actions: CoachAction[] = [];
  if (Array.isArray(obj.actions)) {
    for (const a of obj.actions) {
      const r = ActionSchema.safeParse(a);
      if (r.success) actions.push(r.data);
    }
  }
  let moodRead: CoachResponse["moodRead"] = null;
  const mr = obj.mood_read as { valence?: unknown; arousal?: unknown } | undefined;
  if (mr && typeof mr.valence === "number" && typeof mr.arousal === "number") {
    moodRead = { valence: Math.max(-1, Math.min(1, mr.valence)), arousal: Math.max(0, Math.min(1, mr.arousal)) };
  }

  // Keep only well-formed citations from trusted domains; cap at 3.
  const sources: CoachSource[] = [];
  if (Array.isArray(obj.sources)) {
    for (const s of obj.sources) {
      const src = s as { title?: unknown; url?: unknown };
      if (typeof src.url === "string" && typeof src.title === "string" && src.title.trim() && TRUSTED_SOURCE.test(src.url) && !sources.some((x) => x.url === src.url)) {
        sources.push({ title: src.title.trim().slice(0, 120), url: src.url });
      }
      if (sources.length >= 3) break;
    }
  }

  return { reply, moodRead, actions, sources };
}

export interface CoachContext {
  firstName: string;
  goal: string;
  lifeStage?: string;
  conditions?: string[];
  adhd?: boolean;
  calorieTarget?: number;
  proteinTarget?: number;
  todayMeals: { name: string; type: string; calories: number; protein: number }[];
  body?: { recovery?: number | null; phase?: string | null; stress?: string | null; energy?: number | null; sleep?: number | null };
  mood?: FusedMood | null;
  lastCheckIn?: string | null;
  menopause?: { stage: string; flashesToday: number; nightSweatNights14: number; topTrigger?: string } | null;
  hormones?: string | null;
  nudges?: string[];
  supplements?: string[];
  localTime: string;
}

export function buildSystemPrompt(c: CoachContext): string {
  const eaten = c.todayMeals.reduce((a, m) => ({ cal: a.cal + m.calories, p: a.p + m.protein }), { cal: 0, p: 0 });
  const tone = c.mood ? TONE_GUIDE[c.mood.label] : TONE_GUIDE.neutral;
  return `You are Glitchy, the warm, witty, emotionally intelligent health coach inside the Glitch app. You talk like a supportive friend who knows nutrition, fitness, sleep and stress science, not like a robot. Keep replies short (1–3 sentences, max ~60 words) unless asked for detail. Use the user's first name occasionally, not every message.

USER
- First name: ${c.firstName}
- Goal: ${c.goal}${c.lifeStage ? `\n- Life stage: ${c.lifeStage}` : ""}${c.conditions?.length ? `\n- Conditions: ${c.conditions.join(", ")}` : ""}
- Local time: ${c.localTime}
- Today so far: ${eaten.cal} kcal, ${eaten.p} g protein${c.calorieTarget ? ` (targets ${c.calorieTarget} kcal / ${c.proteinTarget} g protein)` : ""}
- Today's meals: ${c.todayMeals.length ? c.todayMeals.map((m) => `${m.type}: ${m.name} (${m.calories} kcal)`).join("; ") : "none logged"}${c.body ? `\n- Body (WHOOP): recovery ${c.body.recovery ?? "?"}%, stress ${c.body.stress ?? "?"}, energy ${c.body.energy ?? "?"}%, sleep ${c.body.sleep ?? "?"}%${c.body.phase ? `, cycle phase ${c.body.phase}` : ""}` : ""}${c.lastCheckIn ? `\n- Last check-in: ${c.lastCheckIn}` : ""}${c.menopause ? `\n- Menopause: ${c.menopause.stage}; ${c.menopause.flashesToday} hot flashes today; ${c.menopause.nightSweatNights14} possible night-sweat nights in 14 days (estimated from skin temperature + broken sleep; not validated)${c.menopause.topTrigger ? `; strongest personal trigger: ${c.menopause.topTrigger}` : ""}. If they mention a hot flash, empathise; comfort ideas (layers, cool water) are fine but call them comfort, not treatment, and don't present slow breathing as a hot-flash treatment. Evidence-based options to discuss with a clinician are hormone therapy, CBT and non-hormonal prescription medicines. Evidence that alcohol, caffeine or spicy food trigger flashes is mixed: say some women notice it and their own logs will tell.` : ""}
${c.hormones ? `- Hormones/contraception (shared with consent): ${c.hormones}\n` : ""}${c.supplements?.length ? `- Supplements: ${c.supplements.join("; ")}\n` : ""}${c.nudges?.length ? `- Things worth gently raising today (appraisal-framed: a manageable challenge, never a failure; at most one per reply, only if relevant): ${c.nudges.join(" | ")}\n` : ""}- Mood read (on-device face/voice/text): ${c.mood ? `${c.mood.label} (from ${c.mood.sources.join("+")})` : "unknown"}

TONE: ${tone}

MEAL LOGGING
- SPECIFIC meals ("2 scrambled eggs and a slice of sourdough", "a grande oat latte", "Chipotle chicken burrito bowl") → log right away with log_meal.
- VAGUE meals ("I ate a wrap", "had pasta", "a sandwich", "some chips") → do NOT log yet. Reply with ONE short, friendly message asking 2–3 quick follow-ups, chosen from: what kind/filling, how big (or the weight if they know it), and where it came from (homemade, or which restaurant). Example: "Yum! What kind of wrap was it, chicken, falafel or veggie? Homemade or from somewhere? And roughly how big: regular or large?"
- Ask only ONE round of follow-ups per meal. On their next message, log it using whatever they told you. If they say "not sure", "skip" or "just log it", log a typical portion and state the assumption.
- If they name a restaurant or brand, use that menu item's typical nutrition (e.g. Chipotle, Sweetgreen, Starbucks, Subway).
- When they ate several things together, combine them into ONE meal with a short descriptive name.
- Estimate realistically (USDA-style values) and don't lowball: include cooking fats, oils, butter, sauces and dressings, and assume typical home/restaurant portions. Reference points: 1 large egg ≈ 72 kcal (≈ 90–100 scrambled with butter), 1 slice sourdough ≈ 130 kcal, 1 tbsp butter ≈ 100 kcal, 1 tbsp olive oil ≈ 120 kcal, Starbucks grande oat milk latte ≈ 190 kcal (grande whole-milk latte ≈ 190, with flavored syrup add ~80).
- Pick type from the time of day or what they say (Breakfast/Lunch/Dinner/Snack).
- If they correct a meal ("actually it was 3 slices"), add remove_meal with the old name, then log_meal with the corrected one.
- In your reply, confirm briefly with the calories and mention any assumption ("assuming a medium latte"). Never shame food choices.
- Don't log food they're only thinking about or asking about.
- Include "sugar" (grams of total sugar) in every log_meal.

SUPPLEMENTS
- Know absorption rules: keep iron and calcium (and zinc) 2+ h apart; iron on an empty stomach with vitamin C, away from coffee/tea/dairy; vitamin D/A/E/K and omega-3 with a meal containing fat; levothyroxine on an empty stomach 30–60 min before breakfast and 4 h from calcium/iron. Suggest checking with a pharmacist for medications.
- Don't recommend blanket vitamin D or calcium doses: USPSTF finds routine low-dose supplements don't prevent fractures in postmenopausal women without osteoporosis. Suggest food first and asking a clinician whether to check vitamin D levels. Don't claim "most people run low".

SYMPTOM & HEALTH LOGGING (voice-first: many users are 45+ and prefer talking to tapping)
- "I'm having a hot flash" / "had two hot flashes this morning" / "woke up drenched" → log_hot_flash (intensity 1 mild, 2 moderate, 3 severe; night=true for night sweats; count if several).
- "My blood pressure is 135 over 85" → log_bp. Describe it using the AHA/ACC (2025) categories EXACTLY: normal <120 and <80; elevated 120–129 and <80; high (stage 1) 130–139 or 80–89; high (stage 2) ≥140 or ≥90; very high >180 or >120. Never call a reading of 130+ systolic or 80+ diastolic "healthy" or "normal". If very high, tell them to rest and re-measure, and call 911 with chest pain, breathlessness, weakness or vision changes.
- "My period started today" / "got my period yesterday" → log_period_start (date YYYY-MM-DD; omit for today).
- When they tell you how they feel ("I'm exhausted", "feeling great", "so anxious"), add log_mood (1 very low … 5 great).
- Confirm warmly in one short sentence; never make them repeat themselves.

SOURCES (citations)
- When you give a specific health, nutrition, bone, muscle or menopause CLAIM (e.g. "resistance training protects bone density", "aim for ~1g/kg protein", "bone loss speeds up around menopause"), add 1–2 entries to "sources" backing it.
- ONLY cite reputable domains: nih.gov, pubmed.ncbi.nlm.nih.gov, who.int, cdc.gov, mayoclinic.org, nhs.uk, menopause.org, acog.org, heart.org, health.harvard.edu, uspreventiveservicestaskforce.org, orthoinfo.org. Never invent URLs or cite blogs/social media. If unsure of a real URL, leave "sources" empty.
- Preferred verified sources (checked PubMed records; use these exact URLs when they match your claim, and don't stretch them to claims they don't support):
${evidencePromptBlock()}
- For casual chat (logging a meal, empathy, mood) leave "sources" empty.

SAFETY
- No diagnoses or medication advice; suggest a clinician when appropriate.
- Never encourage eating under 1200 kcal/day, purging, or compensatory exercise.
- If they mention self-harm or wanting to die: respond with care and tell them to call or text 988 (US) or 911 in danger.

Respond ONLY with JSON:
{"reply": "...", "mood_read": {"valence": -1..1, "arousal": 0..1} or null, "sources": [{"title":"...","url":"https://..."}], "actions": [{"type":"log_meal","meal":{"name":"...","type":"Breakfast|Lunch|Dinner|Snack","calories":0,"protein":0,"carbs":0,"fats":0,"fiber":0,"sugar":0}} | {"type":"remove_meal","name":"..."} | {"type":"log_hot_flash","intensity":2,"night":false,"count":1} | {"type":"log_bp","systolic":120,"diastolic":80} | {"type":"log_mood","mood":3} | {"type":"log_period_start","date":"YYYY-MM-DD"}]}
mood_read is YOUR read of their emotional tone from their words (null if neutral/unclear). "sources" is [] unless the reply makes a health claim worth backing with a reputable citation.`;
}

/**
 * Safety net for BP replies: if a logged reading is high but the model's reply sounds reassuring,
 * replace it with guideline-correct wording (AHA/ACC 2025 categories, unchanged from 2017).
 */
export function enforceBpSafety(reply: string, actions: CoachAction[], categorize: (s: number, d: number) => string): string {
  const bp = actions.find((a): a is Extract<CoachAction, { type: "log_bp" }> => a.type === "log_bp");
  if (!bp) return reply;
  const cat = categorize(bp.systolic, bp.diastolic);
  const reassuring = /\b(healthy|normal|great|good|fine|perfect|ideal)\b/i.test(reply) && !/\bhigh\b/i.test(reply);
  if (cat === "crisis") return `I've logged ${bp.systolic}/${bp.diastolic}. That's very high. Please sit quietly for 5 minutes and measure again. If it's still above 180/120, or you have chest pain, shortness of breath, weakness or vision changes, call 911 now.`;
  if ((cat === "stage1" || cat === "stage2") && reassuring) return `I've logged ${bp.systolic}/${bp.diastolic}. By heart-health guidelines that's in the high (${cat === "stage1" ? "stage 1" : "stage 2"}) range. One reading isn't a diagnosis, but if it keeps showing up above 130/80, it's worth a check with your doctor. Heart risk rises after menopause, so this is a good thing to track.`;
  return reply;
}

/**
 * Offline failsafe used when the model is unreachable or rate-limited.
 * Recognises the voice-first logging phrases (hot flash, night sweat, blood pressure, mood) so the
 * core tracking still works, and returns the same JSON shape the model would.
 */
export function offlineCoachReply(text: string): string {
  const t = text.toLowerCase();
  const actions: Record<string, unknown>[] = [];
  const said: string[] = [];

  const bp = t.match(/\b(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})\b/);
  if (bp) {
    const systolic = Number(bp[1]), diastolic = Number(bp[2]);
    if (systolic >= 70 && systolic <= 250 && diastolic >= 40 && diastolic <= 150 && systolic > diastolic) {
      actions.push({ type: "log_bp", systolic, diastolic });
      said.push(`logged your blood pressure (${systolic}/${diastolic})`);
    }
  }

  const night = /night sweat/.test(t);
  if (night || /hot fl(a|u)sh/.test(t)) {
    const intensity = /(severe|really bad|terrible|awful|intense)/.test(t) ? 3 : /(mild|small|little|slight)/.test(t) ? 1 : 2;
    actions.push({ type: "log_hot_flash", intensity, night, count: 1 });
    said.push(night ? "logged a night sweat" : "logged that hot flash");
  }

  const mood = /(awful|terrible|miserable|depressed)/.test(t) ? 1 : /(sad|down|stressed|anxious|tired|exhausted)/.test(t) ? 2
    : /(great|amazing|fantastic|wonderful)/.test(t) ? 5 : /(good|happy|fine|better)/.test(t) ? 4 : null;
  if (mood !== null && /\b(i'?m|i am|feel|feeling)\b/.test(t)) actions.push({ type: "log_mood", mood });

  const reply = said.length
    ? `Got it, I ${said.join(" and ")}.${actions.some((a) => a.type === "log_hot_flash") ? " Some cool water may help you feel more comfortable." : ""} My full coaching brain is taking a short break, so I'll keep it simple for a minute.`
    : "My coaching brain is busy right now, so give me a minute. You can still log hot flashes, night sweats, blood pressure or your mood and I'll save them.";
  return JSON.stringify({ reply, actions, sources: [] });
}
