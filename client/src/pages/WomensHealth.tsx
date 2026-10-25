/**
 * Glitch — Women's Health & Cycle Intelligence Tab
 * Design: Organic Wellness Journal — warm rose + terracotta + sage
 * Disclaimer: Cycle predictions are estimates, not medical advice.
 */
import { useState, useEffect, useRef } from "react";
import { useApp, getCycleDay, getCyclePhase, getNextPeriodDate, getOvulationDate, CyclePhase, CycleSymptomEntry, isPerimenopausal } from "@/contexts/AppContext";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Loader2 } from "lucide-react";
import { useHealthInsights } from "@/hooks/useHealthInsights";
import OvulationCard from "@/components/OvulationCard";
import LifeStagePanel from "@/components/LifeStagePanel";
import MenopausePanel from "@/components/MenopausePanel";

const PHASE_INFO: Record<CyclePhase, { label: string; color: string; bg: string; emoji: string; desc: string }> = {
  menstrual:  { label: "Menstrual",  color: "var(--accent)",  bg: "color-mix(in oklch, var(--accent) 12%, transparent)",  emoji: "🌑", desc: "Rest, restore, and be gentle with yourself." },
  follicular: { label: "Follicular", color: "oklch(0.72 0.08 148)", bg: "oklch(0.72 0.08 148 / 0.12)", emoji: "🌱", desc: "Energy is rising — great time to start new goals." },
  ovulation:  { label: "Ovulation",  color: "oklch(0.78 0.10 75)",  bg: "oklch(0.78 0.10 75 / 0.12)",  emoji: "🌕", desc: "Peak energy and strength — push your limits!" },
  luteal:     { label: "Luteal",     color: "oklch(0.68 0.09 25)",  bg: "oklch(0.68 0.09 25 / 0.12)",  emoji: "🌖", desc: "Wind down, prioritize rest and stable blood sugar." },
};

const NUTRITION_GUIDANCE: Record<CyclePhase, { priority: string[]; tip: string }> = {
  menstrual:  { priority: ["Iron", "Protein", "Hydration"],              tip: "Consider iron-rich foods like lentils, beans, tofu, spinach, and fortified cereals." },
  follicular: { priority: ["Energy", "Balanced Carbohydrates", "B vitamins"], tip: "Focus on whole grains, eggs, and leafy greens to fuel rising energy levels." },
  ovulation:  { priority: ["Protein", "Recovery", "Antioxidants"],       tip: "Prioritize lean protein and colorful vegetables to support peak performance." },
  luteal:     { priority: ["Magnesium", "Fiber", "Blood Sugar Stability"], tip: "Magnesium-rich foods (dark chocolate, pumpkin seeds, avocado) can ease PMS symptoms." },
};

const FITNESS_GUIDANCE: Record<CyclePhase, { types: string[]; tip: string }> = {
  menstrual:  { types: ["Walking", "Yoga", "Mobility", "Light Strength"],   tip: "Honor your body — gentle movement is better than pushing through pain." },
  follicular: { types: ["Progressive Overload", "HIIT", "Strength Focus"],  tip: "Estrogen is rising — your body recovers faster. Great time for new PRs." },
  ovulation:  { types: ["Peak Performance", "Strength Training", "Challenging Sessions"], tip: "This is your power window. Go for your hardest workouts this week." },
  luteal:     { types: ["Moderate Intensity", "Recovery", "Flexible Volume"], tip: "Progesterone rises — listen to your body and reduce intensity if needed." },
};

const SYMPTOM_LABELS = ["Mood", "Energy", "Stress", "Bloating", "Cramps", "Cravings", "Sleep Quality"];
const SYMPTOM_KEYS: (keyof Omit<CycleSymptomEntry, "date" | "cycleDay" | "notes" | "workout" | "sleepHours">)[] = ["mood", "energy", "stress", "bloating", "cramps", "cravings", "sleepQuality"];
const SYMPTOM_COLORS = ["oklch(0.72 0.08 148)", "oklch(0.78 0.10 75)", "var(--accent)", "oklch(0.62 0.10 200)", "oklch(0.68 0.09 25)", "oklch(0.75 0.12 55)", "oklch(0.65 0.08 280)"];

// ── Cycle Ring ────────────────────────────────────────────────
function CycleRing({ day, total, phase }: { day: number; total: number; phase: CyclePhase }) {
  const circleRef = useRef<SVGCircleElement>(null);
  const size = 110; const sw = 9; const r = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct = day / total;
  const offset = circ * (1 - pct);
  const info = PHASE_INFO[phase];

  useEffect(() => {
    const el = circleRef.current;
    if (!el) return;
    el.style.strokeDasharray = `${circ}`;
    el.style.strokeDashoffset = `${circ}`;
    requestAnimationFrame(() => {
      el.style.transition = "stroke-dashoffset 1s cubic-bezier(0.23,1,0.32,1)";
      el.style.strokeDashoffset = `${offset}`;
    });
  }, [circ, offset]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#2A2D36" strokeWidth={sw} />
          <circle ref={circleRef} cx={size/2} cy={size/2} r={r} fill="none" stroke={info.color} strokeWidth={sw} strokeLinecap="round" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 22 }}>{info.emoji}</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>Day {day}</span>
          <span style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>of {total}</span>
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: info.color, fontFamily: "'DM Sans', sans-serif" }}>{info.label} Phase</span>
    </div>
  );
}

// ── Period Calendar ───────────────────────────────────────────
function PeriodCalendar({ lastPeriodDate, cycleLength }: { lastPeriodDate: string; cycleLength: number }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const nextPeriod = getNextPeriodDate(lastPeriodDate, cycleLength);
  const ovulation = getOvulationDate(lastPeriodDate, cycleLength);
  const fertileStart = new Date(ovulation.getTime() - 2 * 86400000);
  const fertileEnd   = new Date(ovulation.getTime() + 1 * 86400000);

  function getDateType(d: number): string {
    const date = new Date(year, month, d);
    const start = new Date(lastPeriodDate);
    const periodEnd = new Date(start.getTime() + 5 * 86400000);
    if (date >= start && date <= periodEnd) return "period";
    if (date >= fertileStart && date <= fertileEnd) return "fertile";
    if (date.toDateString() === ovulation.toDateString()) return "ovulation";
    if (date.toDateString() === nextPeriod.toDateString()) return "predicted";
    if (date.toDateString() === today.toDateString()) return "today";
    return "";
  }

  const dayColors: Record<string, string> = {
    period: "var(--accent)",
    fertile: "oklch(0.72 0.08 148)",
    ovulation: "oklch(0.78 0.10 75)",
    predicted: "oklch(0.68 0.09 25)",
    today: "color-mix(in oklch, var(--accent) 25%, transparent)",
  };

  return (
    <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: "16px", boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>
        {today.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      </p>
      {/* Day headers */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif", padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      {/* Calendar grid */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
          const type = getDateType(d);
          const bg = type ? dayColors[type] : "transparent";
          const isToday = new Date(year, month, d).toDateString() === today.toDateString();
          return (
            <div key={d} style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: bg, border: isToday && !type ? "1.5px solid var(--accent)" : "none" }}>
              <span style={{ fontSize: 11, fontWeight: type ? 700 : 400, color: type && type !== "today" ? "white" : "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>{d}</span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-3">
        {[["period","Period"],["predicted","Next Period"],["ovulation","Ovulation"],["fertile","Fertile Window"]].map(([type, label]) => (
          <div key={type} className="flex items-center gap-1">
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: dayColors[type] }} />
            <span style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Symptom Slider ────────────────────────────────────────────
function SymptomSlider({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'DM Sans', sans-serif" }}>{value}/5</span>
      </div>
      <div className="flex gap-1.5">
        {[1,2,3,4,5].map((v) => (
          <button key={v} onClick={() => onChange(v)}
            style={{ flex: 1, height: 28, borderRadius: 7, border: "none", background: v <= value ? color: "var(--surface-2)", opacity: v <= value ? 1 : 0.35, transition: "all 0.12s", cursor: "pointer" }} />
        ))}
      </div>
    </div>
  );
}

// ── Stress Recovery Score ─────────────────────────────────────
function getStressRecovery(entry: CycleSymptomEntry, completedCount: number): { label: string; color: string; tip: string; score: number } {
  const score =
    (6 - entry.stress) * 2 +
    entry.energy +
    entry.mood +
    entry.sleepQuality +
    (completedCount > 0 ? 2 : 0) -
    (entry.cravings > 3 ? 2 : 0);
  const pct = Math.min(100, Math.round((score / 18) * 100));
  if (pct >= 70) return { label: "Low Stress Pattern",      color: "oklch(0.72 0.08 148)", tip: "Your wellness indicators have remained stable. Keep it up!", score: pct };
  if (pct >= 45) return { label: "Moderate Stress Pattern", color: "oklch(0.78 0.10 75)",  tip: "Recent sleep and stress patterns suggest increased recovery needs.", score: pct };
  return              { label: "Elevated Stress Pattern",   color: "var(--accent)",  tip: "Your body may need extra rest and nourishment today. Be kind to yourself.", score: pct };
}

// ── Main Page ─────────────────────────────────────────────────
export default function WomensHealth() {
  const { profile, cycleSymptomLog, addCycleSymptomEntry, logPeriodStart, completedExercises } = useApp();
  const wh = profile?.womensHealth;
  const insights = useHealthInsights();
  const [activeSection, setActiveSection] = useState<"overview" | "checkin" | "insights" | "analytics">("overview");
  const peri = isPerimenopausal(profile ?? null);
  const [periWatch, setPeriWatch] = useState(peri);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  // Symptom check-in state
  const [symptoms, setSymptoms] = useState({ mood: 3, energy: 3, stress: 2, bloating: 1, cramps: 1, cravings: 2, sleepQuality: 3 });
  const [notes, setNotes] = useState("");
  const [checkedIn, setCheckedIn] = useState(false);

  if (profile && wh && wh.cycleStatus === "no") {
    const meno = wh.noCycleReason === "menopause" || wh.noCycleReason === "perimenopause";
    return (
      <div className="flex flex-col gap-0 pb-2">
        <div style={{ padding: "20px 20px 4px" }}>
          <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>{meno ? "Menopause Hub" : "Your Hormonal Health"}</h1>
          <p style={{ fontSize: 12, color: "var(--txt-muted)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{meno ? `Symptoms, sleep, training and heart health, ${profile.name}` : `Guidance for your life stage, ${profile.name}`}</p>
        </div>
        {meno ? <MenopausePanel /> : <LifeStagePanel />}
      </div>
    );
  }

  if (!profile || !wh) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6" style={{ minHeight: "60vh" }}>
        <span style={{ fontSize: 48 }}>🌸</span>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>Women's Health</p>
          <p style={{ fontSize: 13, color: "var(--txt-muted)", marginTop: 6, fontFamily: "'DM Sans', sans-serif" }}>
            This feature is available for users who selected Female and enabled cycle tracking during onboarding.
          </p>
        </div>
      </div>
    );
  }

  const cycleDay = getCycleDay(wh.lastPeriodDate, wh.cycleLength);
  // Prefer the phase confirmed from WHOOP temperature data over the calendar estimate
  const phase = insights.cycle?.currentPhase ?? getCyclePhase(cycleDay, wh.cycleLength);
  const phaseInfo = PHASE_INFO[phase];
  const nutrition = NUTRITION_GUIDANCE[phase];
  const fitness = FITNESS_GUIDANCE[phase];
  const todayStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const todayEntry = cycleSymptomLog.find((e) => e.date === todayStr);

  async function handleCheckin() {
    const entry: CycleSymptomEntry = {
      date: todayStr, cycleDay, ...symptoms, notes,
    };
    addCycleSymptomEntry(entry);
    setCheckedIn(true);
    toast.success("Daily check-in saved! 🌸");

    if (!profile) return;
    // Generate AI insight
    setInsightLoading(true);
    try {
      const { getMotivationalMessage } = await import("@/lib/aiService");
      const msg = await getMotivationalMessage({
        name: profile.name,
        goal: profile.goal,
        caloriesPct: 0.5,
        proteinPct: 0.5,
        streakDays: cycleSymptomLog.length,
      });
      setAiInsight(msg);
    } catch { /* silent */ }
    finally { setInsightLoading(false); }
  }

  // PMS prediction (needs ≥2 entries)
  const hasPmsData = cycleSymptomLog.length >= 5;
  const daysUntilPeriod = wh.cycleLength - cycleDay;
  const isPmsWindow = daysUntilPeriod <= 7 && daysUntilPeriod >= 0;
  const avgCravings = cycleSymptomLog.length > 0 ? cycleSymptomLog.reduce((a, e) => a + e.cravings, 0) / cycleSymptomLog.length : 0;
  const avgFatigue  = cycleSymptomLog.length > 0 ? cycleSymptomLog.reduce((a, e) => a + (6 - e.energy), 0) / cycleSymptomLog.length : 0;

  // Analytics data
  const analyticsData = cycleSymptomLog.slice(-14).map((e) => ({
    day: `D${e.cycleDay}`,
    mood: e.mood,
    energy: e.energy,
    cravings: e.cravings,
    sleep: e.sleepQuality,
  }));

  const TABS = [
    { id: "overview", label: "Overview", emoji: "🌸" },
    { id: "checkin",  label: "Check-In", emoji: "📝" },
    { id: "insights", label: "Insights", emoji: "✨" },
    { id: "analytics",label: "Analytics",emoji: "📊" },
  ] as const;

  return (
    <div className="flex flex-col gap-0 pb-2">
      {/* Header */}
      <div style={{ background: `linear-gradient(160deg, ${phaseInfo.bg} 0%, var(--app-bg) 60%)`, padding: "20px 20px 14px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, borderRadius: "50%", background: `${phaseInfo.color}18`, zIndex: 0 }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>Women's Health</h1>
          <p style={{ fontSize: 12, color: "var(--txt-muted)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>Cycle-aware wellness for {profile.name}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-4 py-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {TABS.map(({ id, label, emoji }) => (
          <button key={id} onClick={() => setActiveSection(id as typeof activeSection)}
            style={{ padding: "7px 14px", borderRadius: 999, border: "none", whiteSpace: "nowrap", flexShrink: 0, background: activeSection === id ? "var(--accent)" : "var(--surface-2)", color: activeSection === id ? "var(--on-accent)" : "var(--ink)", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
            {emoji} {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 px-4 pt-1">

        {/* ── OVERVIEW ── */}
        {activeSection === "overview" && (
          <>
            {/* Cycle ring + phase */}
            <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: "20px 16px", boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" }}>
              <div className="flex items-center gap-6">
                <CycleRing day={cycleDay} total={wh.cycleLength} phase={phase} />
                <div className="flex flex-col gap-2 flex-1">
                  <div style={{ padding: "8px 12px", borderRadius: 12, background: phaseInfo.bg, border: `1px solid ${phaseInfo.color}44` }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: phaseInfo.color, fontFamily: "'DM Sans', sans-serif" }}>{phaseInfo.desc}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <div style={{ padding: "5px 10px", borderRadius: 10, background: "var(--surface-2)" }}>
                      <p style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>Next period</p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
                        {getNextPeriodDate(wh.lastPeriodDate, wh.cycleLength).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div style={{ padding: "5px 10px", borderRadius: 10, background: "var(--surface-2)" }}>
                      <p style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>In</p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>{daysUntilPeriod} days</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <OvulationCard />

            {/* 40+: perimenopause can start while cycles continue */}
            {(profile.age >= 40 || peri) && (
              <button onClick={() => setPeriWatch((v) => !v)}
                style={{ width: "100%", textAlign: "left", padding: "14px 16px", borderRadius: 18, border: "1.5px solid oklch(0.63 0.17 35 / 0.35)", background: "oklch(0.63 0.17 35 / 0.06)" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>🌗 Perimenopause watch {periWatch ? "▲" : "▼"}</p>
                <p style={{ fontSize: 12, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>Cycle changes, hot flashes, night sweats and training for your 40s+</p>
              </button>
            )}
            {(profile.age >= 40 || peri) && periWatch && <div style={{ margin: "0 -16px" }}><MenopausePanel /></div>}

            {/* Period calendar */}
            <PeriodCalendar lastPeriodDate={wh.lastPeriodDate} cycleLength={wh.cycleLength} />

            {/* Cycle-aware nutrition */}
            <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: "16px", boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>🥗 Nutrition This Phase</p>
              <div className="flex gap-2 flex-wrap mb-3">
                {nutrition.priority.map((p) => (
                  <span key={p} style={{ padding: "4px 10px", borderRadius: 999, background: "oklch(0.72 0.08 148 / 0.15)", color: "oklch(0.84 0.08 148)", fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{p}</span>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, fontStyle: "italic" }}>"{nutrition.tip}"</p>
            </div>

            {/* Cycle-aware fitness */}
            <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: "16px", boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>🏃 Fitness This Phase</p>
              <div className="flex gap-2 flex-wrap mb-3">
                {fitness.types.map((t) => (
                  <span key={t} style={{ padding: "4px 10px", borderRadius: 999, background: `${phaseInfo.color}18`, color: phaseInfo.color, fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{t}</span>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, fontStyle: "italic" }}>"{fitness.tip}"</p>
            </div>

            {/* PMS prediction */}
            {isPmsWindow && (
              <div style={{ background: "oklch(0.68 0.09 25 / 0.10)", borderRadius: 20, padding: "16px", border: "1px solid oklch(0.68 0.09 25 / 0.3)" }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.84 0.1 25)", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>🔮 PMS Prediction</p>
                {avgCravings > 3 && (
                  <p style={{ fontSize: 12, color: "oklch(0.84 0.08 25)", fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>
                    • Based on your patterns, you may experience increased cravings in the next {daysUntilPeriod} days.
                    <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "oklch(0.68 0.09 25 / 0.2)", color: "oklch(0.84 0.1 25)" }}>{hasPmsData ? "Moderate" : "Low"} confidence</span>
                  </p>
                )}
                {avgFatigue > 2.5 && (
                  <p style={{ fontSize: 12, color: "oklch(0.84 0.08 25)", fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>
                    • Your data suggests a higher likelihood of fatigue before your next period.
                    <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "oklch(0.68 0.09 25 / 0.2)", color: "oklch(0.84 0.1 25)" }}>{hasPmsData ? "Moderate" : "Low"} confidence</span>
                  </p>
                )}
                {!avgCravings && !avgFatigue && (
                  <p style={{ fontSize: 12, color: "oklch(0.84 0.08 25)", fontFamily: "'DM Sans', sans-serif" }}>Log more daily check-ins to unlock personalized PMS predictions.</p>
                )}
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
              <p style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
                ⚠️ Cycle predictions and wellness insights are estimates based on your reported data and should not be used for medical diagnosis or contraception.
              </p>
            </div>
          </>
        )}

        {/* ── CHECK-IN ── */}
        {activeSection === "checkin" && (
          <>
            {(todayEntry || checkedIn) ? (
              <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: "20px", boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)", textAlign: "center" }}>
                <span style={{ fontSize: 48 }}>🌸</span>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--ink)", marginTop: 8 }}>Check-in complete!</p>
                <p style={{ fontSize: 13, color: "var(--txt-muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>You've logged today's symptoms.</p>
                {aiInsight && (
                  <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "oklch(0.72 0.08 148 / 0.12)", border: "1px solid oklch(0.72 0.08 148 / 0.3)" }}>
                    <p style={{ fontSize: 12, color: "oklch(0.84 0.08 148)", fontFamily: "'DM Sans', sans-serif", fontStyle: "italic" }}>✨ {aiInsight}</p>
                  </div>
                )}
                {insightLoading && <Loader2 size={18} style={{ color: "var(--accent)", animation: "spin 1s linear infinite", margin: "12px auto 0" }} />}
                {/* Stress recovery */}
                {(todayEntry || checkedIn) && (() => {
                  const entry = todayEntry ?? { ...symptoms, date: todayStr, cycleDay, notes };
                  const sr = getStressRecovery(entry as CycleSymptomEntry, completedExercises.length);
                  return (
                    <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: `${sr.color}18`, border: `1px solid ${sr.color}44` }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: sr.color, fontFamily: "'DM Sans', sans-serif" }}>🧬 {sr.label}</p>
                      <p style={{ fontSize: 11, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", marginTop: 3 }}>{sr.tip}</p>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: "16px", boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Daily Symptom Check-In</p>
                <p style={{ fontSize: 12, color: "var(--txt-muted)", marginBottom: 14, fontFamily: "'DM Sans', sans-serif" }}>Cycle Day {cycleDay} · {phaseInfo.label} Phase</p>
                <div className="flex flex-col gap-4">
                  {SYMPTOM_KEYS.map((key, i) => (
                    <SymptomSlider key={key} label={SYMPTOM_LABELS[i]} value={symptoms[key]} color={SYMPTOM_COLORS[i]}
                      onChange={(v) => setSymptoms((prev) => ({ ...prev, [key]: v }))} />
                  ))}
                  <div className="flex flex-col gap-1">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Notes (optional)</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How are you feeling today?" rows={2}
                      style={{ padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--app-bg)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", outline: "none", resize: "none", width: "100%" }} />
                  </div>
                  <button onClick={handleCheckin}
                    style={{ padding: "13px", borderRadius: 14, background: "var(--accent)", color: "var(--on-accent)", fontWeight: 700, fontSize: 15, fontFamily: "'DM Sans', sans-serif", border: "none", boxShadow: "0 4px 14px color-mix(in oklch, var(--accent) 30%, transparent)" }}>
                    Save Check-In 🌸
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── INSIGHTS ── */}
        {activeSection === "insights" && (
          <>
            {cycleSymptomLog.length === 0 ? (
              <div style={{ padding: "32px 16px", borderRadius: 20, background: "var(--card-bg)", textAlign: "center", border: "1.5px dashed var(--line)" }}>
                <p style={{ fontSize: 36, marginBottom: 8 }}>✨</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>No insights yet</p>
                <p style={{ fontSize: 12, color: "var(--txt-muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>Log at least 3 daily check-ins to unlock AI insights about your patterns.</p>
              </div>
            ) : (
              <>
                {/* Pattern insights */}
                <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: "16px", boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>✨ AI Pattern Insights</p>
                  <div className="flex flex-col gap-3">
                    {[
                      avgCravings > 3 && `You frequently report increased cravings (avg ${avgCravings.toFixed(1)}/5) — especially around days ${cycleDay - 3}–${cycleDay}.`,
                      avgFatigue > 2 && `Your energy tends to dip in the late luteal phase. Consider lighter workouts and extra sleep then.`,
                      cycleSymptomLog.length >= 3 && `You've logged ${cycleSymptomLog.length} check-ins. Keep going — patterns become clearer with more data.`,
                    ].filter(Boolean).map((insight, i) => (
                      <div key={i} style={{ padding: "10px 12px", borderRadius: 12, background: "var(--surface-2)", display: "flex", gap: 8 }}>
                        <span style={{ fontSize: 14 }}>💡</span>
                        <p style={{ fontSize: 12, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>{insight as string}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stress recovery over time */}
                <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: "16px", boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>🧬 Stress Recovery History</p>
                  <p style={{ fontSize: 11, color: "var(--txt-muted)", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>Based on sleep, stress, energy, mood & workout completion — not a medical measurement.</p>
                  <div className="flex flex-col gap-2">
                    {cycleSymptomLog.slice(-5).reverse().map((entry, i) => {
                      const sr = getStressRecovery(entry, 0);
                      return (
                        <div key={i} className="flex items-center justify-between" style={{ padding: "8px 12px", borderRadius: 10, background: "var(--surface-2)" }}>
                          <span style={{ fontSize: 11, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Day {entry.cycleDay} · {entry.date}</span>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: `${sr.color}22`, color: sr.color, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{sr.label.split(" ")[0]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── ANALYTICS ── */}
        {activeSection === "analytics" && (
          <>
            {analyticsData.length === 0 ? (
              <div style={{ padding: "32px 16px", borderRadius: 20, background: "var(--card-bg)", textAlign: "center", border: "1.5px dashed var(--line)" }}>
                <p style={{ fontSize: 36, marginBottom: 8 }}>📊</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>No data yet</p>
                <p style={{ fontSize: 12, color: "var(--txt-muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>Log daily check-ins to see your cycle patterns here.</p>
              </div>
            ) : (
              <>
                {[
                  { key: "mood",     label: "Mood by Cycle Day",    color: "oklch(0.72 0.08 148)" },
                  { key: "energy",   label: "Energy by Cycle Day",  color: "oklch(0.78 0.10 75)" },
                  { key: "cravings", label: "Cravings by Cycle Day",color: "var(--accent)" },
                  { key: "sleep",    label: "Sleep Quality",        color: "oklch(0.65 0.08 280)" },
                ].map(({ key, label, color }) => (
                  <div key={key} style={{ background: "var(--card-bg)", borderRadius: 20, padding: "16px", boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>{label}</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={analyticsData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2D36" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 9, fontFamily: "'DM Sans', sans-serif", fill: "oklch(0.55 0.020 60)" }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 5]} tick={{ fontSize: 9, fontFamily: "'DM Sans', sans-serif", fill: "oklch(0.65 0.015 60)" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 11, fontFamily: "'DM Sans', sans-serif" }} />
                        <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2.5} dot={{ fill: color, r: 3 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
