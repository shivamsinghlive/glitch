/**
 * Glitch — Supplement Logger
 * Add supplements, mark them taken, and get timing/interaction guidance (lib/supplementRules.ts).
 * Design: Organic Wellness Journal
 */
import { useState } from "react";
import { useApp, bodyKind, Supplement } from "@/contexts/AppContext";
import { Plus, X, Pill, Check } from "lucide-react";
import { checkTaking, scheduleIssues, FOOD_RULES, kindOf } from "@/lib/supplementRules";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { isBoneHealthCohort, suggestBoneSupplements, CITATIONS } from "@/lib/boneHealth";

const COMMON_SUPPLEMENTS = [
  { name: "Vitamin D3",   dose: "1000 IU",  emoji: "☀️" },
  { name: "Vitamin B12",  dose: "500 mcg",  emoji: "⚡" },
  { name: "Omega-3",      dose: "1000 mg",  emoji: "🐟" },
  { name: "Iron",         dose: "18 mg",    emoji: "🔩" },
  { name: "Magnesium",    dose: "200 mg",   emoji: "💊" },
  { name: "Zinc",         dose: "15 mg",    emoji: "🔬" },
  { name: "Protein Powder", dose: "30 g",   emoji: "🥤" },
  { name: "Creatine",     dose: "5 g",      emoji: "💪" },
  { name: "Ashwagandha",  dose: "300 mg",   emoji: "🌿" },
  { name: "Probiotics",   dose: "10B CFU",  emoji: "🦠" },
];

const TIME_OPTIONS = ["Morning", "Afternoon", "Evening", "With Meal", "Before Workout", "After Workout"];

export default function SupplementLogger() {
  const { profile, supplements, addSupplement, removeSupplement, supplementTaken, markSupplementTaken, undoSupplementTaken, meals } = useApp();
  const issues = scheduleIssues(supplements);
  const showBoneSupps = isBoneHealthCohort({ age: profile?.age, bodyKind: bodyKind(profile) });
  const boneSuggestions = showBoneSupps ? suggestBoneSupplements() : [];
  const takenToday = (id: string) => supplementTaken.some((t) => t.supplementId === id && new Date(t.at).toDateString() === new Date().toDateString());

  function take(s: Supplement) {
    if (takenToday(s.id)) { undoSupplementTaken(s.id); return; }
    const check = checkTaking(s, new Date(), supplements, supplementTaken, meals);
    markSupplementTaken(s.id);
    if (check.ok) toast.success(`${s.emoji} ${s.name} taken ✓`);
    else toast.warning(`${s.name} logged. Heads-up: ${check.warnings[0]}`, { duration: 7000 });
  }
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [time, setTime] = useState("Morning");
  const [emoji, setEmoji] = useState("💊");

  function handleAdd() {
    if (!name.trim()) return;
    const s: Supplement = { id: nanoid(), name: name.trim(), dose: dose.trim() || "—", time, emoji };
    addSupplement(s);
    setName(""); setDose(""); setTime("Morning"); setEmoji("💊");
    setOpen(false);
    toast.success(`${s.emoji} ${s.name} added to your supplement log!`);
  }

  function handleQuickAdd(s: { name: string; dose: string; emoji: string }) {
    const alreadyAdded = supplements.some((sup) => sup.name === s.name);
    if (alreadyAdded) { toast.info(`${s.name} is already in your log.`); return; }
    addSupplement({ id: nanoid(), name: s.name, dose: s.dose, time: "Morning", emoji: s.emoji });
    toast.success(`${s.emoji} ${s.name} added!`);
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
        <div className="flex items-center gap-2">
          <Pill size={16} style={{ color: "var(--accent)" }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
            Supplements
          </p>
        </div>
        <button
          onClick={() => setOpen(!open)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "6px 12px", borderRadius: 10,
            background: open ? "var(--surface-2)" : "var(--accent)",
            color: open ? "var(--ink)" : "white",
            fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", border: "none",
            transition: "all 0.15s",
          }}
        >
          <Plus size={12} /> {open ? "Cancel" : "Add"}
        </button>
      </div>

      {/* Suggested for peri/menopausal women (bone + muscle) */}
      {boneSuggestions.length > 0 && (
        <div style={{ marginBottom: 12, padding: "11px 12px", borderRadius: 14, background: "color-mix(in oklch, var(--accent) 7%, var(--card-bg))", border: "1px solid color-mix(in oklch, var(--accent) 22%, transparent)" }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: "var(--accent)", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", marginBottom: 8 }}>
            Bone & muscle: food first
          </p>
          <div className="flex flex-col gap-2">
            {boneSuggestions.map((s) => {
              const added = supplements.some((sup) => sup.name === s.name);
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <span style={{ fontSize: 18 }}>{s.emoji}</span>
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>{s.name} <span style={{ color: "var(--txt-muted)", fontWeight: 500 }}>· {s.dose}</span></p>
                    <p style={{ fontSize: 11, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4 }}>
                      {s.reason} <a href={CITATIONS[s.citationKey].url} target="_blank" rel="noreferrer" title={CITATIONS[s.citationKey].title} style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}>source ↗</a>
                    </p>
                  </div>
                  <button onClick={() => handleQuickAdd({ name: s.name, dose: s.dose, emoji: s.emoji })} disabled={added} aria-label={`Add ${s.name}`}
                    style={{ flexShrink: 0, padding: "5px 11px", borderRadius: 999, border: "none", fontSize: 11.5, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", background: added ? "color-mix(in oklch, var(--accent) 16%, transparent)" : "var(--accent)", color: added ? "var(--accent)" : "var(--on-accent)" }}>
                    {added ? "Added" : "Add"}
                  </button>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif", marginTop: 8, lineHeight: 1.4 }}>
            General guidance for women over 50, not a prescription. Ask your clinician whether you need a supplement or a vitamin D level check.
          </p>
        </div>
      )}

      {/* Current supplements */}
      {supplements.length === 0 && !open && (
        <p style={{ fontSize: 13, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif", textAlign: "center", padding: "8px 0" }}>
          No supplements logged yet. Tap Add to get started.
        </p>
      )}

      {issues.map((i) => (
        <div key={i.ids.join()} style={{ padding: "9px 11px", borderRadius: 12, background: "oklch(0.78 0.12 75 / 0.15)", border: "1px solid oklch(0.78 0.12 75 / 0.4)", marginBottom: 8 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "oklch(0.84 0.1 70)", fontFamily: "'DM Sans', sans-serif" }}>⏱️ Timing clash</p>
          <p style={{ fontSize: 11.5, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.45 }}>{i.message} {i.fix}</p>
        </div>
      ))}

      {supplements.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {supplements.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between"
              style={{ padding: "9px 12px", borderRadius: 12, background: "var(--surface-2)" }}
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 20 }}>{s.emoji}</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
                    {s.name}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>
                    {s.dose} · {s.time}
                  </p>
                  {FOOD_RULES[kindOf(s.name)] && (
                    <p style={{ fontSize: 10.5, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif", marginTop: 2, lineHeight: 1.4 }}>💡 {FOOD_RULES[kindOf(s.name)]!.tip}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
              <button onClick={() => take(s)} aria-pressed={takenToday(s.id)} aria-label={takenToday(s.id) ? `Undo ${s.name}` : `Mark ${s.name} taken`}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 999, border: "none", fontSize: 11.5, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", background: takenToday(s.id) ? "oklch(0.62 0.10 148)" : "var(--card-bg)", color: takenToday(s.id) ? "white" : "var(--ink)" }}>
                {takenToday(s.id) ? <><Check size={12} /> Taken</> : "Take"}
              </button>
              <button
                onClick={() => removeSupplement(s.id)}
                style={{ background: "none", border: "none", padding: 4, color: "var(--txt-muted)", cursor: "pointer" }}
              >
                <X size={14} />
              </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {open && (
        <div className="flex flex-col gap-3 animate-fade-up">
          {/* Quick-add common supplements */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--txt-muted)", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
              QUICK ADD
            </p>
            <div className="flex flex-wrap gap-2">
              {COMMON_SUPPLEMENTS.map((s) => (
                <button
                  key={s.name}
                  onClick={() => handleQuickAdd(s)}
                  style={{
                    padding: "5px 10px", borderRadius: 999,
                    border: "1.5px solid var(--line)",
                    background: supplements.some((sup) => sup.name === s.name) ? "oklch(0.72 0.08 148 / 0.15)" : "var(--card-bg)",
                    fontSize: 11, fontFamily: "'DM Sans', sans-serif",
                    color: supplements.some((sup) => sup.name === s.name) ? "oklch(0.40 0.06 148)" : "var(--ink)",
                    transition: "all 0.15s",
                  }}
                >
                  {s.emoji} {s.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: "var(--surface-2)" }} />

          {/* Custom entry */}
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>
            CUSTOM
          </p>
          <div className="flex gap-2">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="💊"
              style={{ width: 44, padding: "9px 8px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--app-bg)", fontSize: 18, textAlign: "center", outline: "none" }}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Supplement name"
              style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--app-bg)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", outline: "none" }}
            />
          </div>
          <div className="flex gap-2">
            <input
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="Dose (e.g. 500 mg)"
              style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--app-bg)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", outline: "none" }}
            />
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--app-bg)", fontSize: 12, fontFamily: "'DM Sans', sans-serif", color: "var(--ink)", outline: "none" }}
            >
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            style={{
              padding: "11px", borderRadius: 12,
              background: name.trim() ? "var(--accent)" : "var(--surface-2)",
              color: name.trim() ? "white" : "oklch(0.65 0.015 60)",
              fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans', sans-serif", border: "none",
              cursor: name.trim() ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}
          >
            Add Supplement
          </button>
        </div>
      )}
    </div>
  );
}
