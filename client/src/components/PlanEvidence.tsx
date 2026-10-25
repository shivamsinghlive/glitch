/**
 * Glitch — "Why this plan": what the weekly plan was built from, and the cited evidence behind it.
 * The evidence is retrieved on the device from a small cited library (lib/evidence.ts, BM25 retrieval).
 */
import { useApp } from "@/contexts/AppContext";

const font = "'DM Sans', sans-serif";
const EQ: Record<string, string> = { none: "no equipment", dumbbells: "dumbbells", resistance_bands: "bands", pull_up_bar: "pull-up bar", kettlebells: "kettlebells", full_gym: "full gym" };
const ST: Record<string, string> = { calisthenics: "calisthenics", weight_training: "weight training", yoga: "yoga", running: "running/cardio", hiit: "HIIT", pilates: "Pilates" };

export default function PlanEvidence() {
  const { weeklyWorkoutPlan: plan } = useApp();
  if (!plan?.evidence?.length) return null;
  return (
    <section aria-labelledby="why-h" style={{ background: "var(--card-bg)", borderRadius: 20, padding: 16, border: "1px solid var(--line)" }}>
      <div className="flex items-center justify-between">
        <h2 id="why-h" style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", fontFamily: font }}>Why this plan</h2>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "oklch(0.58 0.09 260 / 0.12)", color: "oklch(0.84 0.11 260)", fontFamily: font }}>EVIDENCE-GROUNDED</span>
      </div>
      {plan.basis && (
        <p style={{ fontSize: 12, color: "var(--txt-muted)", fontFamily: font, marginTop: 4, lineHeight: 1.5 }}>
          Built from your choices: {plan.daysPerWeek} days · {plan.basis.equipment.map((e) => EQ[e] ?? e).join(", ")} · {plan.basis.styles.map((s) => ST[s] ?? s).join(", ")}{plan.basis.boneCohort ? " · bone and muscle focus" : ""}.
        </p>
      )}
      {plan.notes?.map((n) => <p key={n} style={{ fontSize: 12, color: "var(--ink)", fontFamily: font, marginTop: 6, lineHeight: 1.5 }}>• {n}</p>)}
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", fontFamily: font, marginTop: 10 }}>Retrieved from our cited library</p>
      <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
        {plan.evidence.map((p) => (
          <li key={p.id} style={{ padding: "8px 10px", borderRadius: 10, background: "var(--surface-2)", marginBottom: 6 }}>
            <p style={{ fontSize: 12, color: "var(--ink)", fontFamily: font, lineHeight: 1.45 }}>{p.text}</p>
            <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "var(--accent)", fontFamily: font, fontWeight: 600 }}>{p.label} ↗</a>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 11, color: "var(--txt-muted)", fontFamily: font, marginTop: 4 }}>Wellness guidance, not a prescription. Start light, build slowly, and check with a clinician if you have osteoporosis, joint problems or heart disease.</p>
    </section>
  );
}
