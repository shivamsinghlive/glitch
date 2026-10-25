/**
 * Glitch — "Your training choices": goal, equipment and favourite styles.
 * Changing any of them rebuilds the weekly plan and the food targets straight away (logs are kept),
 * and the evidence list below shows what the plan is grounded in.
 */
import { useApp, type Equipment, type FitnessGoal, type WorkoutStyle } from "@/contexts/AppContext";

const GOALS: { id: FitnessGoal; label: string }[] = [
  { id: "maintain", label: "Stay healthy" }, { id: "lose_weight", label: "Lose weight" },
  { id: "build_muscle", label: "Build muscle" }, { id: "manage_diabetes", label: "Manage diabetes" },
];
const EQUIPMENT: { id: Equipment; label: string }[] = [
  { id: "none", label: "No equipment" }, { id: "dumbbells", label: "Dumbbells" }, { id: "resistance_bands", label: "Bands" },
  { id: "pull_up_bar", label: "Pull-up bar" }, { id: "kettlebells", label: "Kettlebells" }, { id: "full_gym", label: "Full gym" },
];
const STYLES: { id: WorkoutStyle; label: string }[] = [
  { id: "calisthenics", label: "Calisthenics" }, { id: "weight_training", label: "Weight training" }, { id: "yoga", label: "Yoga" },
  { id: "running", label: "Running / cardio" }, { id: "hiit", label: "HIIT" }, { id: "pilates", label: "Pilates" },
];

const font = "'DM Sans', sans-serif";

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, fontFamily: font, border: on ? "none" : "1.5px solid var(--line)", background: on ? "var(--accent)" : "var(--card-bg)", color: on ? "var(--on-accent)" : "var(--ink)" }}>
      {label}
    </button>
  );
}

function toggle<T extends string>(list: T[], id: T, fallback: T): T[] {
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  return next.length ? next : [fallback];
}

export default function TrainingChoices() {
  const { profile, updatePreferences, nutritionGoals } = useApp();
  if (!profile) return null;
  return (
    <section aria-labelledby="choices-h" style={{ background: "var(--card-bg)", borderRadius: 20, padding: 16, border: "1px solid var(--line)" }}>
      <h2 id="choices-h" style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", fontFamily: font }}>Your training choices</h2>
      <p style={{ fontSize: 12, color: "var(--txt-muted)", fontFamily: font, marginTop: 2, lineHeight: 1.45 }}>Change anything and your weekly plan and food targets rebuild instantly. Your logs stay.</p>

      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", fontFamily: font, marginTop: 12 }}>Goal</p>
      <div role="group" aria-label="Goal" className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
        {GOALS.map((g) => <Chip key={g.id} on={profile.goal === g.id} label={g.label} onClick={() => updatePreferences({ goal: g.id })} />)}
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", fontFamily: font, marginTop: 12 }}>Equipment you have</p>
      <div role="group" aria-label="Equipment" className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
        {EQUIPMENT.map((e) => <Chip key={e.id} on={profile.equipment.includes(e.id)} label={e.label} onClick={() => updatePreferences({ equipment: toggle(profile.equipment, e.id, "none") })} />)}
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", fontFamily: font, marginTop: 12 }}>Training you enjoy</p>
      <div role="group" aria-label="Training styles" className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
        {STYLES.map((s) => <Chip key={s.id} on={profile.workoutStyles.includes(s.id)} label={s.label} onClick={() => updatePreferences({ workoutStyles: toggle(profile.workoutStyles, s.id, "calisthenics") })} />)}
      </div>

      {nutritionGoals && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 12, background: "var(--surface-2)" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", fontFamily: font }}>Your food targets: {nutritionGoals.calorieTarget.toLocaleString()} kcal · {nutritionGoals.proteinTarget} g protein</p>
          <p style={{ fontSize: 11.5, color: "var(--txt-muted)", fontFamily: font, marginTop: 3, lineHeight: 1.45 }}>{nutritionGoals.rationale}</p>
        </div>
      )}
    </section>
  );
}
