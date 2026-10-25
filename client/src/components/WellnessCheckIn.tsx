/**
 * NutriSense AI — Wellness Check-In Card
 * Tracks mood, energy, stress, sleep, cravings for cortisol pattern analysis.
 * Design: Organic Wellness Journal
 */
import { useState } from "react";
import { useApp, WellnessEntry } from "@/contexts/AppContext";
import { toast } from "sonner";
import { nanoid } from "nanoid";

const MOOD_LABELS  = ["😞 Very Low", "😕 Low", "😐 Okay", "🙂 Good", "😄 Great"];
const ENERGY_LABELS = ["🪫 Exhausted", "😴 Tired", "⚡ Okay", "💪 Energized", "🚀 Pumped"];
const STRESS_LABELS = ["😌 Calm", "🧘 Relaxed", "😐 Moderate", "😰 Stressed", "🤯 Very Stressed"];

const CRAVING_OPTIONS = [
  { id: "sweets",   label: "Sweets",    emoji: "🍫" },
  { id: "salty",    label: "Salty",     emoji: "🧂" },
  { id: "carbs",    label: "Carbs",     emoji: "🍞" },
  { id: "caffeine", label: "Caffeine",  emoji: "☕" },
  { id: "none",     label: "None",      emoji: "✅" },
];

function ScaleSelector({
  label,
  value,
  onChange,
  labels,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  labels: string[];
  color: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
          {labels[value - 1]}
        </span>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              flex: 1,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: v <= value ? color: "var(--surface-2)",
              opacity: v <= value ? 1 : 0.4,
              transition: "all 0.15s",
              cursor: "pointer",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function WellnessCheckIn() {
  const { addWellnessEntry, wellnessLog } = useApp();
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(2);
  const [sleep, setSleep] = useState("7");
  const [cravings, setCravings] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const todayStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const todayEntry = wellnessLog.find((e) => e.date === todayStr);

  function toggleCraving(id: string) {
    if (id === "none") {
      setCravings(["none"]);
      return;
    }
    setCravings((prev) => {
      const without = prev.filter((c) => c !== "none");
      return without.includes(id) ? without.filter((c) => c !== id) : [...without, id];
    });
  }

  function handleSubmit() {
    const entry: WellnessEntry = {
      date: todayStr,
      mood,
      energy,
      stress,
      sleepHours: parseFloat(sleep) || 7,
      cravings,
      notes,
    };
    addWellnessEntry(entry);
    setOpen(false);
    toast.success("Wellness check-in saved! 🌿");
  }

  // Cortisol risk indicator based on stress + sleep + cravings
  function getCortisolRisk(entry: WellnessEntry): { label: string; color: string; tip: string } {
    const riskScore =
      (entry.stress - 1) * 2 +
      (5 - entry.mood) +
      (8 - Math.min(entry.sleepHours, 8)) +
      (entry.cravings.includes("sweets") || entry.cravings.includes("carbs") ? 2 : 0);

    if (riskScore <= 4)  return { label: "Low", color: "oklch(0.72 0.08 148)", tip: "Great balance — cortisol looks healthy." };
    if (riskScore <= 8)  return { label: "Moderate", color: "oklch(0.78 0.10 75)", tip: "Some stress signals — try a 10-min walk or deep breathing." };
    return { label: "Elevated", color: "var(--accent)", tip: "High stress + poor sleep + sugar cravings can spike cortisol. Prioritize rest and low-GI meals today." };
  }

  return (
    <div
      style={{
        background: "var(--card-bg)",
        borderRadius: 20,
        padding: "16px",
        boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
            🧠 Daily Wellness Check-In
          </p>
          <p style={{ fontSize: 11, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
            Tracks mood, energy, stress & cortisol patterns
          </p>
        </div>
        {!todayEntry && (
          <button
            onClick={() => setOpen(!open)}
            style={{
              padding: "7px 14px",
              borderRadius: 10,
              background: open ? "var(--surface-2)" : "var(--accent)",
              color: open ? "var(--ink)" : "var(--on-accent)",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              border: "none",
              transition: "all 0.15s",
            }}
          >
            {open ? "Cancel" : "Check In"}
          </button>
        )}
      </div>

      {/* Today's entry summary */}
      {todayEntry && (() => {
        const risk = getCortisolRisk(todayEntry);
        return (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 flex-wrap">
              {[
                { label: "Mood",   val: MOOD_LABELS[todayEntry.mood - 1] },
                { label: "Energy", val: ENERGY_LABELS[todayEntry.energy - 1] },
                { label: "Stress", val: STRESS_LABELS[todayEntry.stress - 1] },
                { label: "Sleep",  val: `${todayEntry.sleepHours}h` },
              ].map(({ label, val }) => (
                <div key={label} style={{ padding: "6px 12px", borderRadius: 10, background: "var(--surface-2)" }}>
                  <p style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>{label}</p>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>{val}</p>
                </div>
              ))}
            </div>
            {/* Cortisol indicator */}
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: `${risk.color}18`,
                border: `1px solid ${risk.color}44`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 13 }}>🧬</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: risk.color, fontFamily: "'DM Sans', sans-serif" }}>
                  Cortisol Risk: {risk.label}
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
                {risk.tip}
              </p>
            </div>
            {todayEntry.cravings.length > 0 && !todayEntry.cravings.includes("none") && (
              <div className="flex gap-2 flex-wrap">
                <span style={{ fontSize: 11, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>Cravings:</span>
                {todayEntry.cravings.map((c) => {
                  const opt = CRAVING_OPTIONS.find((o) => o.id === c);
                  return (
                    <span key={c} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "color-mix(in oklch, var(--accent) 10%, transparent)", color: "oklch(0.84 0.12 38)", fontFamily: "'DM Sans', sans-serif" }}>
                      {opt?.emoji} {opt?.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Check-in form */}
      {open && !todayEntry && (
        <div className="flex flex-col gap-4 mt-2 animate-fade-up">
          <ScaleSelector label="Mood"   value={mood}   onChange={setMood}   labels={MOOD_LABELS}   color="oklch(0.72 0.08 148)" />
          <ScaleSelector label="Energy" value={energy} onChange={setEnergy} labels={ENERGY_LABELS} color="oklch(0.78 0.10 75)" />
          <ScaleSelector label="Stress" value={stress} onChange={setStress} labels={STRESS_LABELS} color="var(--accent)" />

          <div className="flex flex-col gap-1">
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
              Sleep last night (hours)
            </label>
            <input
              type="number"
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
              min="0" max="12" step="0.5"
              style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--app-bg)", fontSize: 14, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", outline: "none", width: "100%" }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
              Cravings today?
            </label>
            <div className="flex gap-2 flex-wrap">
              {CRAVING_OPTIONS.map(({ id, label, emoji }) => (
                <button
                  key={id}
                  onClick={() => toggleCraving(id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: cravings.includes(id) ? "none" : "1.5px solid var(--line)",
                    background: cravings.includes(id) ? "var(--accent)" : "var(--card-bg)",
                    color: cravings.includes(id) ? "white" : "var(--ink)",
                    fontSize: 12,
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "all 0.15s",
                  }}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
              Any notes? (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How are you feeling today?"
              rows={2}
              style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--app-bg)", fontSize: 13, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "none", width: "100%" }}
            />
          </div>

          <button
            onClick={handleSubmit}
            style={{
              padding: "13px",
              borderRadius: 14,
              background: "var(--accent)",
              color: "white",
              fontWeight: 700,
              fontSize: 15,
              fontFamily: "'DM Sans', sans-serif",
              border: "none",
              boxShadow: "0 4px 14px color-mix(in oklch, var(--accent) 30%, transparent)",
            }}
          >
            Save Check-In
          </button>
        </div>
      )}

      {/* Historical wellness log */}
      {wellnessLog.length > 1 && (
        <div className="mt-4">
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
            Recent check-ins
          </p>
          <div className="flex flex-col gap-2">
            {wellnessLog.slice(-5).reverse().map((entry, i) => {
              const risk = getCortisolRisk(entry);
              return (
                <div key={i} className="flex items-center justify-between" style={{ padding: "8px 12px", borderRadius: 10, background: "var(--surface-2)" }}>
                  <span style={{ fontSize: 12, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>{entry.date}</span>
                  <div className="flex gap-2 items-center">
                    <span style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: "var(--txt-muted)" }}>
                      😊{entry.mood} ⚡{entry.energy} 😰{entry.stress}
                    </span>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: `${risk.color}22`, color: risk.color, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                      {risk.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
