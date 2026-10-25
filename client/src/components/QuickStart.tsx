/**
 * Glitch — 1-minute setup for every woman: name + age → where you are in life → one date.
 * Perimenopause / menopause hand off to the existing QuickMenopauseSetup. Everything else has sensible
 * defaults and can be changed later.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import QuickMenopauseSetup from "./QuickMenopauseSetup";

type Stage = "cycling" | "pregnant" | "postpartum" | "menopause";
const INK = "var(--ink)";
const MUTED = "var(--txt-muted)";
const font = "'DM Sans', sans-serif";
const input: React.CSSProperties = { width: "100%", padding: "14px 16px", borderRadius: 14, border: "2px solid var(--line)", fontSize: 18, fontFamily: font, color: INK, background: "var(--card-bg)", outline: "none" };
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const STAGES: [Stage, string, string, string][] = [
  ["cycling", "🩸", "I have periods", "Learn how your cycle affects energy, mood, cravings and training"],
  ["pregnant", "🤰", "I'm pregnant", "Safe movement, nutrition and mood support"],
  ["postpartum", "👶", "I recently had a baby", "Recovery first, plus mood check-ins"],
  ["menopause", "🌗", "Perimenopause or menopause", "Hot flashes, sleep, bone and heart health"],
];

export default function QuickStart({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { setProfile } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [stage, setStage] = useState<Stage | null>(null);
  const [date, setDate] = useState("");
  const [cycleLength, setCycleLength] = useState("28");

  if (stage === "menopause" && step === 2) return <QuickMenopauseSetup onDone={onDone} onBack={() => setStep(1)} />;

  function finish() {
    const base = { name: name.trim(), age: Number(age), weight: 65, height: 165, goal: "maintain" as const, equipment: ["none" as const], workoutStyles: ["calisthenics" as const, "yoga" as const], biologicalSex: "female" as const };
    const common = { commonSymptoms: [], healthConditions: ["none" as const] };
    const womensHealth = stage === "cycling"
      ? { ...common, cycleStatus: "yes" as const, lifePhase: "reproductive" as const, lastPeriodDate: date || isoDaysAgo(20), cycleLength: Math.min(45, Math.max(21, Number(cycleLength) || 28)) }
      : { ...common, cycleStatus: "no" as const, noCycleReason: stage === "pregnant" ? "pregnant" as const : "postpartum" as const, lastPeriodDate: "", cycleLength: 28, ...(stage === "pregnant" && date ? { dueDate: date } : {}) };
    setProfile({ ...base, womensHealth });
    onDone();
  }

  const canNext = step === 0 ? !!name.trim() && Number(age) >= 13 : step === 1 ? !!stage : true;
  const next = () => { if (step < 2) setStep(step + 1); else finish(); };

  return (
    <div style={{ minHeight: "100%", background: "var(--app-bg)", padding: "28px 20px 32px", fontFamily: font, display: "flex", flexDirection: "column", gap: 14 }}>
      <button onClick={() => (step === 0 ? onBack() : setStep(step - 1))} aria-label="Back" style={{ alignSelf: "flex-start", border: "none", background: "transparent", color: MUTED, display: "flex", alignItems: "center", gap: 4, fontSize: 14 }}>
        <ChevronLeft size={18} /> Back
      </button>

      {step === 0 && (
        <>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: INK }}>Hi, I'm Glitchy 👋</h1>
          <p style={{ fontSize: 15, color: MUTED }}>Your body isn't a smaller man's body. Let's learn how yours works.</p>
          <input style={input} placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} aria-label="First name" />
          <input style={input} placeholder="Age" type="number" value={age} onChange={(e) => setAge(e.target.value)} aria-label="Age" />
        </>
      )}

      {step === 1 && (
        <>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: INK }}>Where are you right now?</h1>
          {STAGES.map(([id, emoji, title, sub]) => (
            <motion.button key={id} whileTap={{ scale: 0.97 }} onClick={() => setStage(id)} aria-pressed={stage === id}
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 18, textAlign: "left", border: stage === id ? "3px solid var(--accent)" : "2px solid var(--line)", background: stage === id ? "color-mix(in oklch, var(--accent) 10%, var(--card-bg))" : "var(--card-bg)" }}>
              <span style={{ fontSize: 30 }}>{emoji}</span>
              <span><span style={{ display: "block", fontSize: 17, fontWeight: 800, color: INK }}>{title}</span><span style={{ display: "block", fontSize: 13, color: MUTED }}>{sub}</span></span>
            </motion.button>
          ))}
        </>
      )}

      {step === 2 && stage === "cycling" && (
        <>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: INK }}>When did your last period start?</h1>
          <input style={input} type="date" value={date} max={isoDaysAgo(0)} onChange={(e) => setDate(e.target.value)} aria-label="Last period start" />
          <label style={{ fontSize: 14, color: MUTED }}>Usual cycle length (days)</label>
          <input style={input} type="number" value={cycleLength} onChange={(e) => setCycleLength(e.target.value)} aria-label="Cycle length" />
          <p style={{ fontSize: 13, color: MUTED }}>Not sure? Leave it. Glitch adjusts as you log periods.</p>
        </>
      )}
      {step === 2 && stage === "pregnant" && (
        <>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: INK }}>When's your due date?</h1>
          <input style={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date" />
          <p style={{ fontSize: 13, color: MUTED }}>Optional. It lets Glitch show your week of pregnancy.</p>
        </>
      )}
      {step === 2 && stage === "postpartum" && (
        <>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: INK }}>Congratulations 💛</h1>
          <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.5 }}>Glitch will focus on recovery, sleep and how you're feeling, and gently check in on your mood.</p>
        </>
      )}

      <motion.button whileTap={{ scale: 0.97 }} disabled={!canNext} onClick={next}
        style={{ marginTop: "auto", padding: "16px 0", borderRadius: 16, border: "none", background: canNext ? "var(--accent)" : "var(--surface-2)", color: canNext ? "var(--on-accent)" : MUTED, fontSize: 17, fontWeight: 800, fontFamily: font }}>
        {step === 2 ? "Start" : "Next"}
      </motion.button>
    </div>
  );
}
