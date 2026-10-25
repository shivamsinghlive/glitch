/**
 * Glitch — Bone & strength card (Fitness tab, peri/menopausal women).
 * Explains why loading exercise matters around menopause (all exercise helps; resistance + impact most), offers a modest starter
 * routine the user can add to their plan (which auto-enables Form Check for supported moves),
 * and cites its sources. Wellness insight, not a diagnosis.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Dumbbell, Plus, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useApp, type WorkoutExercise } from "@/contexts/AppContext";
import { matchFormExercise } from "@/lib/formAnalysis";
import {
  BONE_HEALTH_SUMMARY, BONE_STRENGTH_EXERCISES, CITATIONS, type BoneExercise,
} from "@/lib/boneHealth";

const font = "'DM Sans', sans-serif";
const KIND_LABEL: Record<BoneExercise["kind"], string> = { resistance: "Strength", impact: "Impact", balance: "Balance" };

export default function BoneHealthCard() {
  const { weeklyWorkoutPlan, addCustomExerciseToDay } = useApp();
  const [added, setAdded] = useState<Set<string>>(new Set());

  function addExercise(ex: BoneExercise) {
    // Add to the earliest workday in the current plan (fallback day 0), mirroring Fitness.tsx shape.
    const day = weeklyWorkoutPlan?.exercises[0]?.dayOfWeek ?? 0;
    const form = ex.formName ? matchFormExercise(ex.formName) : matchFormExercise(ex.name);
    const detail = `${ex.sets} sets × ${ex.reps}${ex.kind === "balance" ? "s hold" : " reps"}`;
    const custom: WorkoutExercise = {
      id: `bone-${Date.now()}`,
      name: ex.name, description: detail, detail,
      sets: ex.sets, reps: ex.reps, duration: "15 min",
      caloriesBurned: 0, burn: 0,
      formCues: [], cues: [],
      emoji: ex.emoji, rationale: ex.why, goodCue: ex.why,
      dayOfWeek: day, completed: false,
    };
    addCustomExerciseToDay(day, custom);
    setAdded((prev) => new Set(prev).add(ex.name));
    // Hint the Form tab to open on this move next time it's visited.
    if (form) { try { localStorage.setItem("glitch.formExercise", form); } catch { /* storage unavailable */ } }
    toast.success(
      form ? `${ex.name} added — open the Form tab to check it 📹` : `${ex.name} added to your plan`
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: "var(--card-bg)", borderRadius: 22, padding: 16, border: "1px solid var(--line)" }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        <Dumbbell size={18} style={{ color: "var(--accent)" }} />
        <p style={{ fontFamily: font, fontSize: 16, fontWeight: 800, color: "var(--ink)" }}>Strong bones & muscle</p>
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "color-mix(in oklch, var(--accent) 14%, transparent)", color: "var(--accent)", fontFamily: font }}>MENOPAUSE</span>
      </div>

      <p style={{ fontSize: 12.5, color: "var(--txt-muted)", fontFamily: font, lineHeight: 1.55 }}>{BONE_HEALTH_SUMMARY}</p>

      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: "var(--txt-muted)", fontFamily: font, textTransform: "uppercase", margin: "14px 0 8px" }}>
        A gentle starter routine (2–3×/week)
      </p>

      <div className="flex flex-col gap-2">
        {BONE_STRENGTH_EXERCISES.map((ex) => {
          const isAdded = added.has(ex.name);
          const hasForm = !!(ex.formName ? matchFormExercise(ex.formName) : matchFormExercise(ex.name));
          return (
            <div key={ex.name} className="flex items-center gap-3" style={{ padding: "10px 12px", borderRadius: 14, background: "var(--surface-2)" }}>
              <span style={{ fontSize: 22 }}>{ex.emoji}</span>
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className="flex items-center gap-2">
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", fontFamily: font }}>{ex.name}</p>
                  <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 6px", borderRadius: 999, background: "var(--card-bg)", color: "var(--txt-muted)", fontFamily: font }}>{KIND_LABEL[ex.kind]}</span>
                  {hasForm && <span title="Form Check available" style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 6px", borderRadius: 999, background: "color-mix(in oklch, var(--accent) 14%, transparent)", color: "var(--accent)", fontFamily: font }}>📹 Form</span>}
                </div>
                <p style={{ fontSize: 11, color: "var(--txt-muted)", fontFamily: font, lineHeight: 1.4 }}>{ex.sets}×{ex.reps} · {ex.why}</p>
              </div>
              <button onClick={() => addExercise(ex)} disabled={isAdded} aria-label={`Add ${ex.name} to plan`}
                style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, border: "none", background: isAdded ? "color-mix(in oklch, var(--accent) 16%, transparent)" : "var(--accent)", color: isAdded ? "var(--accent)" : "var(--on-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isAdded ? <Check size={16} /> : <Plus size={16} />}
              </button>
            </div>
          );
        })}
      </div>

      <SourceLinks keys={["boneLossRate", "resistanceBmd", "liftmor"]} />
    </motion.div>
  );
}

/** Small clickable citation chips shared by bone-health surfaces. */
export function SourceLinks({ keys }: { keys: (keyof typeof CITATIONS)[] }) {
  return (
    <div className="flex flex-wrap gap-1.5" style={{ marginTop: 12 }}>
      <span style={{ fontSize: 10.5, color: "var(--txt-muted)", fontFamily: font, alignSelf: "center" }}>Sources:</span>
      {keys.map((k) => {
        const c = CITATIONS[k];
        return (
          <a key={k} href={c.url} target="_blank" rel="noreferrer" title={c.title}
            className="flex items-center gap-1"
            style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999, border: "1px solid var(--line)", color: "var(--accent)", fontFamily: font, textDecoration: "none" }}>
            {c.label} <ExternalLink size={10} />
          </a>
        );
      })}
    </div>
  );
}
