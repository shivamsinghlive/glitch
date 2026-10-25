/**
 * NutriSense AI — Log Food Tab
 * Design: Organic Wellness Journal
 * Uses real AI food analysis via Forge API (vision model).
 * Ingredient add-ons also use AI nutrition lookup.
 */
import { useState, useRef } from "react";
import { useApp, Meal } from "@/contexts/AppContext";
import { Camera, Plus, CheckCircle2, X, Loader2, AlertCircle } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { analyzeFoodImage, lookupIngredient, FoodAnalysis, IngredientNutrition } from "@/lib/aiService";
import { AiBlockedError, AiConsentNeededError, grantPhotoConsent } from "@/lib/aiPrivacy";

type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";
const MEAL_TYPES: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

export default function LogFood() {
  const { addMeal } = useApp();
  const [mealType, setMealType] = useState<MealType>("Lunch");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState<FoodAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [addon, setAddon] = useState("");
  const [addons, setAddons] = useState<IngredientNutrition[]>([]);
  const [addonLoading, setAddonLoading] = useState(false);
  const [logged, setLogged] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState(false);
  const [needConsent, setNeedConsent] = useState(false);
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fats: "" });

  // Convert file to base64 data URL for AI vision
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setPhotoUrl(objectUrl);
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzed(null);

    try {
      const base64 = await fileToBase64(file);
      setPhotoBase64(base64);
      await analyze(base64);
    } catch (err) {
      console.error("Reading the photo failed:", err);
      setAnalyzeError("We couldn't read that photo. Try another one or type the meal in.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyze(base64: string) {
    setAnalyzing(true);
    setNeedConsent(false);
    setAnalyzeError(null);
    try {
      setAnalyzed(await analyzeFoodImage(base64));
    } catch (err) {
      if (err instanceof AiConsentNeededError) setNeedConsent(true);
      else if (err instanceof AiBlockedError) setAnalyzeError("The AI is turned off, so we can't analyse photos. Type the meal in instead, or turn the AI on under Progress, then Your data & privacy.");
      else setAnalyzeError("We couldn't analyse that photo reliably, so we haven't guessed. Please type the meal in.");
    } finally {
      setAnalyzing(false);
    }
  }

  function submitManual() {
    const n = (v: string) => Math.max(0, Number(v) || 0);
    if (!form.name.trim() || n(form.calories) <= 0) return toast.error("Add a name and the calories.");
    setAnalyzed({ name: form.name.trim().slice(0, 80), calories: n(form.calories), protein: n(form.protein), carbs: n(form.carbs), fats: n(form.fats), fiber: 0, omega3: 0, confidence: "manual", notes: "Entered by you" });
    setAnalyzeError(null);
    setNeedConsent(false);
  }

  async function handleAddAddon() {
    const ingredient = addon.trim();
    if (!ingredient) return;
    setAddonLoading(true);
    try {
      const result = await lookupIngredient(ingredient);
      if (result.found) {
        setAddons((prev) => [...prev, result]);
        setAddon("");
        toast.success(`Added ${result.name} (+${result.calories} kcal)`);
      } else {
        toast.error(`Could not find nutrition data for "${ingredient}". Try a different name.`);
      }
    } catch {
      toast.error("Ingredient lookup failed. Please try again.");
    } finally {
      setAddonLoading(false);
    }
  }

  function handleLog() {
    if (!analyzed) return;

    const addonTotals = addons.reduce(
      (acc, a) => ({
        calories: acc.calories + a.calories,
        protein:  acc.protein  + a.protein,
        carbs:    acc.carbs    + a.carbs,
        fats:     acc.fats     + a.fats,
        fiber:    acc.fiber    + a.fiber,
        omega3:   acc.omega3   + a.omega3,
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, omega3: 0 }
    );

    const meal: Meal = {
      id: nanoid(),
      type: mealType,
      name: analyzed.name,
      imageUrl: photoUrl ?? undefined,
      calories: Math.round(analyzed.calories + addonTotals.calories),
      protein:  Math.round(analyzed.protein  + addonTotals.protein),
      carbs:    Math.round(analyzed.carbs    + addonTotals.carbs),
      fats:     Math.round(analyzed.fats     + addonTotals.fats),
      fiber:    Math.round((analyzed.fiber   + addonTotals.fiber)  * 10) / 10,
      omega3:   Math.round((analyzed.omega3  + addonTotals.omega3) * 10) / 10,
      time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      loggedAt: new Date().toISOString(),
    };

    addMeal(meal);
    setLogged(true);
    toast.success(`Great job logging ${mealType.toLowerCase()}! 🌿`);
  }

  function handleReset() {
    setPhotoUrl(null);
    setPhotoBase64(null);
    setAnalyzed(null);
    setAnalyzeError(null);
    setAddons([]);
    setAddon("");
    setLogged(false);
    setManual(false);
    setNeedConsent(false);
    setForm({ name: "", calories: "", protein: "", carbs: "", fats: "" });
  }

  const confidenceBadge = analyzed
    ? analyzed.confidence === "manual" ? { label: "Entered by you", color: "oklch(0.72 0.08 148)" }
    : analyzed.confidence === "high"   ? { label: "High confidence", color: "oklch(0.72 0.08 148)" }
    : analyzed.confidence === "medium" ? { label: "Medium confidence", color: "oklch(0.78 0.10 75)" }
    :                                    { label: "Low confidence — verify", color: "var(--accent)" }
    : null;

  return (
    <div className="flex flex-col gap-0 pb-2">
      {/* Header */}
      <div style={{ padding: "20px 20px 12px" }}>
        <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 24, fontWeight: 700, color: "var(--ink)" }}>
          Log a Meal
        </h1>
        <p style={{ fontSize: 13, color: "var(--txt-muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
          Take a photo and the AI estimates the nutrition, or type the meal in yourself.
        </p>
      </div>

      <div className="flex flex-col gap-4 px-4">
        {/* Meal type selector */}
        <div className="flex gap-2 overflow-x-auto pb-1 animate-fade-up" style={{ scrollbarWidth: "none" }}>
          {MEAL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setMealType(t)}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: mealType === t ? "none" : "1.5px solid var(--line)",
                background: mealType === t ? "var(--accent)" : "var(--card-bg)",
                color: mealType === t ? "var(--on-accent)" : "var(--ink)",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                whiteSpace: "nowrap",
                transition: "all 0.15s",
                flexShrink: 0,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Camera / Upload area */}
        {!photoUrl && !manual && (
          <div
            className="animate-fade-up animate-fade-up-delay-1"
            onClick={() => fileRef.current?.click()}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              height: 200,
              borderRadius: 22,
              border: "2px dashed color-mix(in oklch, var(--accent) 40%, transparent)",
              background: "color-mix(in oklch, var(--accent) 5%, transparent)",
              cursor: "pointer",
              transition: "all 0.18s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "color-mix(in oklch, var(--accent) 10%, transparent)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "color-mix(in oklch, var(--accent) 5%, transparent)")}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 20px color-mix(in oklch, var(--accent) 35%, transparent)",
              }}
            >
              <Camera size={28} color="white" />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
                Take or upload a photo
              </p>
              <p style={{ fontSize: 12, color: "var(--txt-muted)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                AI will identify your food instantly
              </p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
          </div>
        )}
        {!photoUrl && !manual && (
          <button onClick={() => setManual(true)} style={{ border: "none", background: "transparent", color: "var(--ink)", fontWeight: 700, fontSize: 13, textDecoration: "underline", padding: 6 }}>No photo? Type the meal in instead</button>
        )}

        {/* Photo preview + analysis */}
        {(photoUrl || manual) && !logged && (
          <div className="flex flex-col gap-4 animate-fade-up">
            {photoUrl && <div style={{ position: "relative" }}>
              <img
                src={photoUrl}
                alt="Food"
                style={{ width: "100%", height: 200, objectFit: "cover", borderRadius: 18 }}
              />
              <button
                onClick={handleReset}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "oklch(0.25 0.025 50 / 0.7)",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={14} color="white" />
              </button>

              {/* Analyzing overlay */}
              {analyzing && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 18,
                    background: "oklch(0.25 0.025 50 / 0.55)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <Loader2 size={32} color="white" style={{ animation: "spin 1s linear infinite" }} />
                  <p style={{ color: "white", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
                    AI is analyzing your food…
                  </p>
                </div>
              )}
            </div>}

            {/* Consent for this photo (chat-only privacy mode) */}
            {needConsent && photoBase64 && (
              <div role="alert" style={{ padding: 14, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Send this photo to the AI?</p>
                <p style={{ fontSize: 12, color: "var(--txt-muted)", marginTop: 3, lineHeight: 1.45, fontFamily: "'DM Sans', sans-serif" }}>Photos are not covered by chat-only mode. This one photo goes to the AI to identify the food and is not stored. You can also type the meal in.</p>
                <div className="flex gap-2" style={{ marginTop: 10 }}>
                  <button onClick={() => { grantPhotoConsent(); analyze(photoBase64); }} style={{ flex: 1, padding: "10px", borderRadius: 12, border: "none", background: "var(--accent)", color: "var(--on-accent)", fontWeight: 700, fontSize: 13 }}>Send this photo</button>
                  <button onClick={() => { setNeedConsent(false); setManual(true); }} style={{ flex: 1, padding: "10px", borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--card-bg)", color: "var(--ink)", fontWeight: 700, fontSize: 13 }}>Type it in</button>
                </div>
              </div>
            )}

            {/* Manual entry (also the fallback whenever the AI can't help) */}
            {manual && !analyzed && (
              <div style={{ padding: 14, borderRadius: 14, background: "var(--card-bg)", border: "1px solid var(--line)" }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Type your meal in</p>
                <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
                  {([["name", "What did you eat?", "text"], ["calories", "Calories (kcal)", "number"], ["protein", "Protein (g)", "number"], ["carbs", "Carbs (g)", "number"], ["fats", "Fat (g)", "number"]] as const).map(([k, label, type]) => (
                    <label key={k} style={{ fontSize: 12, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>{label}
                      <input id={`manual-${k}`} type={type} inputMode={type === "number" ? "decimal" : undefined} min={0} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                        style={{ display: "block", width: "100%", marginTop: 3, padding: "9px 11px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--app-bg)", color: "var(--ink)", fontSize: 14 }} />
                    </label>
                  ))}
                </div>
                <button onClick={submitManual} style={{ width: "100%", marginTop: 12, padding: "11px", borderRadius: 12, border: "none", background: "var(--accent)", color: "var(--on-accent)", fontWeight: 700, fontSize: 14 }}>Continue</button>
              </div>
            )}

            {/* Error state */}
            {analyzeError && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "14px",
                  borderRadius: 14,
                  background: "color-mix(in oklch, var(--accent) 8%, transparent)",
                  border: "1px solid color-mix(in oklch, var(--accent) 30%, transparent)",
                }}
              >
                <AlertCircle size={18} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13, color: "oklch(0.84 0.1 38)", fontFamily: "'DM Sans', sans-serif" }}>{analyzeError}</p>
                  {!manual && <button onClick={() => setManual(true)} style={{ marginTop: 8, border: "none", background: "transparent", color: "var(--ink)", fontWeight: 700, fontSize: 13, textDecoration: "underline", padding: 0 }}>Type the meal in</button>}
                </div>
              </div>
            )}

            {/* AI result */}
            {analyzed && (
              <>
                <div
                  style={{
                    background: "var(--card-bg)",
                    borderRadius: 18,
                    padding: "16px",
                    boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)",
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 18 }}>🤖</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", fontFamily: "'DM Sans', sans-serif" }}>
                        AI Analysis
                      </span>
                    </div>
                    {confidenceBadge && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: `${confidenceBadge.color}22`,
                          color: confidenceBadge.color,
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {confidenceBadge.label}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>
                    {analyzed.name}
                  </p>
                  {analyzed.notes && (
                    <p style={{ fontSize: 12, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif", marginBottom: 10, fontStyle: "italic" }}>
                      {analyzed.notes}
                    </p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { l: "Calories", v: analyzed.calories, u: "kcal" },
                      { l: "Protein",  v: analyzed.protein,  u: "g" },
                      { l: "Carbs",    v: analyzed.carbs,    u: "g" },
                      { l: "Fats",     v: analyzed.fats,     u: "g" },
                      { l: "Fiber",    v: analyzed.fiber,    u: "g" },
                      { l: "Omega-3",  v: analyzed.omega3,   u: "g" },
                    ].map(({ l, v, u }) => (
                      <div
                        key={l}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 10,
                          background: "var(--surface-2)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          minWidth: 58,
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
                          {v}{u}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>{l}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add-ons */}
                <div
                  style={{
                    background: "var(--card-bg)",
                    borderRadius: 18,
                    padding: "16px",
                    boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)",
                  }}
                >
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>
                    Add ingredients
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={addon}
                      onChange={(e) => setAddon(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !addonLoading && handleAddAddon()}
                      placeholder="e.g. 1 tbsp flax seeds"
                      disabled={addonLoading}
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: "1.5px solid var(--line)",
                        background: "var(--app-bg)",
                        fontSize: 13,
                        fontFamily: "'DM Sans', sans-serif",
                        color: "var(--ink)",
                        outline: "none",
                        opacity: addonLoading ? 0.6 : 1,
                      }}
                    />
                    <button
                      onClick={handleAddAddon}
                      disabled={addonLoading || !addon.trim()}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        background: addonLoading ? "oklch(0.72 0.08 148 / 0.5)" : "oklch(0.72 0.08 148)",
                        border: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        color: "white",
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: "'DM Sans', sans-serif",
                        cursor: addonLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      {addonLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />}
                      Add
                    </button>
                  </div>
                  {addons.length > 0 && (
                    <div className="flex flex-col gap-2 mt-3">
                      {addons.map((a, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between"
                          style={{
                            padding: "6px 12px",
                            borderRadius: 10,
                            background: "oklch(0.72 0.08 148 / 0.10)",
                          }}
                        >
                          <span style={{ fontSize: 12, color: "oklch(0.84 0.08 148)", fontFamily: "'DM Sans', sans-serif" }}>
                            + {a.name}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>
                            {a.calories} kcal · {a.protein}g P
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Log button */}
                <button
                  onClick={handleLog}
                  style={{
                    padding: "16px",
                    borderRadius: 18,
                    background: "var(--accent)",
                    color: "var(--on-accent)",
                    fontWeight: 700,
                    fontSize: 16,
                    fontFamily: "'DM Sans', sans-serif",
                    border: "none",
                    boxShadow: "0 6px 20px color-mix(in oklch, var(--accent) 35%, transparent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <CheckCircle2 size={18} />
                  Confirm & Log {mealType}
                </button>
              </>
            )}
          </div>
        )}

        {/* Success state */}
        {logged && (
          <div
            className="flex flex-col items-center gap-4 py-10 animate-fade-up"
            style={{
              background: "var(--card-bg)",
              borderRadius: 22,
              boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)",
            }}
          >
            <span style={{ fontSize: 56 }}>🌿</span>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>
                Great job logging {mealType.toLowerCase()}!
              </p>
              <p style={{ fontSize: 13, color: "var(--txt-muted)", marginTop: 6, fontFamily: "'DM Sans', sans-serif" }}>
                Your dashboard has been updated.
              </p>
            </div>
            <button
              onClick={handleReset}
              style={{
                padding: "12px 24px",
                borderRadius: 14,
                background: "color-mix(in oklch, var(--accent) 12%, transparent)",
                color: "oklch(0.84 0.12 38)",
                fontWeight: 600,
                fontSize: 14,
                fontFamily: "'DM Sans', sans-serif",
                border: "none",
              }}
            >
              Log another meal
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
