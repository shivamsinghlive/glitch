/**
 * Glitch — 20-second daily check-in: one row of 1–5 taps per metric. Feeds the n-of-1 phase analysis
 * (lib/phasePatterns.ts) for cycling users and the mood trend for pregnancy / postpartum.
 * Metrics that aren't asked are saved as 0, which the analysis treats as "not logged".
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useApp, type CycleSymptomEntry } from "@/contexts/AppContext";

export type CheckInMetric = "energy" | "mood" | "cravings" | "cramps" | "workout" | "sleepQuality";

const ROWS: Record<CheckInMetric, { label: string; low: string; high: string; faces: string[] }> = {
  energy: { label: "Energy", low: "drained", high: "buzzing", faces: ["🪫", "😮‍💨", "🙂", "😃", "⚡"] },
  mood: { label: "Mood", low: "low", high: "great", faces: ["😞", "😕", "😐", "🙂", "😄"] },
  cravings: { label: "Cravings", low: "none", high: "intense", faces: ["🥗", "🍎", "🍪", "🍫", "🍕"] },
  cramps: { label: "Cramps / pain", low: "none", high: "severe", faces: ["😌", "🙂", "😣", "😖", "😫"] },
  workout: { label: "Workout felt", low: "weak", high: "strong", faces: ["🐢", "😓", "💪", "🔥", "🦾"] },
  sleepQuality: { label: "Sleep", low: "awful", high: "great", faces: ["😵", "🥱", "😐", "😊", "😴"] },
};

const font = "'DM Sans', sans-serif";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function DailyCheckIn({ metrics, cycleDay, accent = "var(--accent)" }: { metrics: CheckInMetric[]; cycleDay: number; accent?: string }) {
  const { cycleSymptomLog, addCycleSymptomEntry } = useApp();
  const today = iso(new Date());
  const existing = cycleSymptomLog.find((e) => e.date === today);
  const [vals, setVals] = useState<Partial<Record<CheckInMetric, number>>>(() =>
    existing ? Object.fromEntries(metrics.map((m) => [m, (existing as unknown as Record<string, number | undefined>)[m] || undefined])) : {});
  const [saved, setSaved] = useState(!!existing);

  const required = metrics.filter((m) => m !== "workout");
  const ready = required.every((m) => vals[m]);

  function save() {
    const e: CycleSymptomEntry = {
      date: today, cycleDay, notes: existing?.notes ?? "",
      mood: vals.mood ?? 0, energy: vals.energy ?? 0, cravings: vals.cravings ?? 0, cramps: vals.cramps ?? 0, sleepQuality: vals.sleepQuality ?? 0,
      stress: existing?.stress ?? 0, bloating: existing?.bloating ?? 0,
      ...(vals.workout ? { workout: vals.workout } : {}),
    };
    addCycleSymptomEntry(e);
    setSaved(true);
  }

  return (
    <div style={{ background: "var(--card-bg)", borderRadius: 22, padding: 16, marginTop: 14, fontFamily: font }}>
      <div className="flex items-center justify-between">
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: "var(--txt-muted)", textTransform: "uppercase" }}>Today's check-in</p>
        {saved && <span style={{ fontSize: 12, fontWeight: 700, color: accent, display: "flex", alignItems: "center", gap: 4 }}><Check size={14} /> saved</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {metrics.map((m) => {
          const r = ROWS[m];
          return (
            <div key={m}>
              <div className="flex items-baseline justify-between">
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{r.label}{m === "workout" && <span style={{ fontWeight: 500, color: "var(--txt-muted)" }}> (if you trained)</span>}</span>
                <span style={{ fontSize: 11, color: "var(--txt-muted)" }}>{r.low} → {r.high}</span>
              </div>
              <div role="radiogroup" aria-label={r.label} className="flex gap-1.5" style={{ marginTop: 5 }}>
                {r.faces.map((f, i) => {
                  const v = i + 1, on = vals[m] === v;
                  return (
                    <motion.button key={v} whileTap={{ scale: 0.9 }} role="radio" aria-checked={on} aria-label={`${r.label} ${v} of 5`}
                      onClick={() => { setVals((p) => ({ ...p, [m]: p[m] === v && m === "workout" ? undefined : v })); setSaved(false); }}
                      style={{ flex: 1, height: 40, borderRadius: 12, border: on ? `2px solid ${accent}` : "1.5px solid var(--line)", background: on ? `color-mix(in oklch, ${accent} 16%, transparent)` : "transparent", fontSize: 19 }}>
                      {f}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <motion.button whileTap={{ scale: 0.97 }} disabled={!ready || saved} onClick={save}
        style={{ width: "100%", marginTop: 14, padding: "12px 0", borderRadius: 14, border: "none", background: ready && !saved ? accent : "var(--surface-2)", color: ready && !saved ? "var(--on-accent)" : "var(--txt-muted)", fontSize: 15, fontWeight: 800, fontFamily: font }}>
        {saved ? "Logged for today" : ready ? "Save check-in" : "Tap one for each"}
      </motion.button>
    </div>
  );
}
