/**
 * Glitch — Onboarding (up to 7 steps)
 * Steps: Personal Info → Goal → Equipment → Workout Style → [Women's Health if female] → Ready
 * Design: Organic Wellness Journal
 */
import { useState } from "react";
import {
  useApp, FitnessGoal, Equipment, WorkoutStyle,
  BiologicalSex, CycleStatus, PmsSymptom, HealthCondition,
} from "@/contexts/AppContext";
import { ChevronRight, Leaf } from "lucide-react";
import { toast } from "sonner";
import { LIFE_STAGES, NO_CYCLE_OPTIONS, NoCycleReason } from "@/lib/lifeStage";
import type { HormoneContext } from "@/lib/hormones";
import HormoneConsent from "@/components/HormoneConsent";
import QuickStart from "@/components/QuickStart";

const GOALS: { id: FitnessGoal; label: string; desc: string; emoji: string }[] = [
  { id: "lose_weight",      label: "Lose Weight",     desc: "Burn fat, feel lighter",         emoji: "🔥" },
  { id: "maintain",         label: "Stay Healthy",    desc: "Maintain current weight",        emoji: "⚖️" },
  { id: "build_muscle",     label: "Build Muscle",    desc: "Gain strength & lean mass",      emoji: "💪" },
  { id: "manage_diabetes",  label: "Manage Diabetes", desc: "Control blood sugar naturally",  emoji: "🌿" },
];

const EQUIPMENT_OPTIONS: { id: Equipment; label: string; emoji: string; desc: string }[] = [
  { id: "none",             label: "No Equipment",     emoji: "🤸", desc: "Bodyweight only" },
  { id: "dumbbells",        label: "Dumbbells",        emoji: "🏋️", desc: "Free weights at home" },
  { id: "resistance_bands", label: "Resistance Bands", emoji: "🎗️", desc: "Portable & versatile" },
  { id: "pull_up_bar",      label: "Pull-Up Bar",      emoji: "🔩", desc: "Door-frame mounted" },
  { id: "kettlebells",      label: "Kettlebells",      emoji: "⚙️", desc: "Functional strength" },
  { id: "full_gym",         label: "Full Gym Access",  emoji: "🏟️", desc: "All machines & weights" },
];

const STYLE_OPTIONS: { id: WorkoutStyle; label: string; emoji: string; desc: string }[] = [
  { id: "calisthenics",    label: "Calisthenics",    emoji: "🤸", desc: "Bodyweight skill & strength" },
  { id: "weight_training", label: "Weight Training", emoji: "🏋️", desc: "Barbells, dumbbells, machines" },
  { id: "yoga",            label: "Yoga",            emoji: "🧘", desc: "Flexibility & mindfulness" },
  { id: "running",         label: "Running / Cardio",emoji: "🏃", desc: "Endurance & fat burn" },
  { id: "hiit",            label: "HIIT",            emoji: "⚡", desc: "High-intensity intervals" },
  { id: "pilates",         label: "Pilates",         emoji: "🌀", desc: "Core strength & posture" },
];

const PMS_SYMPTOMS: { id: PmsSymptom; label: string; emoji: string }[] = [
  { id: "mood_swings",        label: "Mood Swings",       emoji: "🌊" },
  { id: "bloating",           label: "Bloating",          emoji: "💧" },
  { id: "cravings",           label: "Cravings",          emoji: "🍫" },
  { id: "fatigue",            label: "Fatigue",           emoji: "😴" },
  { id: "headaches",          label: "Headaches",         emoji: "🤕" },
  { id: "anxiety",            label: "Anxiety",           emoji: "😰" },
  { id: "acne",               label: "Acne",              emoji: "🔴" },
  { id: "breast_tenderness",  label: "Breast Tenderness", emoji: "💗" },
  { id: "sleep_disturbances", label: "Sleep Issues",      emoji: "🌙" },
];

const HEALTH_CONDITIONS: { id: HealthCondition; label: string }[] = [
  { id: "pcos",             label: "PCOS" },
  { id: "endometriosis",    label: "Endometriosis" },
  { id: "heavy_periods",    label: "Heavy Periods" },
  { id: "irregular_cycles", label: "Irregular Cycles" },
  { id: "none",             label: "None of the above" },
];

function MultiSelectGrid<T extends string>({
  options, selected, onToggle,
}: { options: { id: T; label: string; emoji?: string; desc?: string }[]; selected: T[]; onToggle: (id: T) => void }) {
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
      {options.map(({ id, label, emoji, desc }) => {
        const isSelected = selected.includes(id);
        return (
          <button key={id} onClick={() => onToggle(id)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
              padding: "11px 13px", borderRadius: 14, textAlign: "left", position: "relative",
              border: isSelected ? "2px solid var(--accent)" : "1.5px solid var(--line)",
              background: isSelected ? "color-mix(in oklch, var(--accent) 10%, transparent)" : "var(--card-bg)",
              transition: "all 0.15s", boxShadow: isSelected ? "0 3px 10px color-mix(in oklch, var(--accent) 15%, transparent)" : "0 1px 4px oklch(0.25 0.025 50 / 0.05)",
            }}>
            {isSelected && (
              <div style={{ position: "absolute", top: 7, right: 7, width: 15, height: 15, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            )}
            {emoji && <span style={{ fontSize: 20 }}>{emoji}</span>}
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.2 }}>{label}</span>
            {desc && <span style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>{desc}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { setProfile } = useApp();
  const [step, setStep] = useState(0);
  const [quickMeno, setQuickMeno] = useState(false);

  // Step 0
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex>("prefer_not_to_say");

  // Step 1
  const [goal, setGoal] = useState<FitnessGoal>("maintain");

  // Step 2
  const [equipment, setEquipment] = useState<Equipment[]>(["none"]);

  // Step 3
  const [workoutStyles, setWorkoutStyles] = useState<WorkoutStyle[]>(["calisthenics"]);

  // Step 4 (Women's Health — only shown if female)
  const [cycleStatus, setCycleStatus] = useState<CycleStatus>("yes");
  const [lastPeriodDate, setLastPeriodDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 14);
    return d.toISOString().split("T")[0];
  });
  const [cycleLength, setCycleLength] = useState(28);
  const [commonSymptoms, setCommonSymptoms] = useState<PmsSymptom[]>([]);
  const [healthConditions, setHealthConditions] = useState<HealthCondition[]>(["none"]);
  const [noCycleReason, setNoCycleReason] = useState<NoCycleReason | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [hormones, setHormones] = useState<HormoneContext | undefined>(undefined);
  const [menoLastPeriod, setMenoLastPeriod] = useState("");
  const [lifePhase, setLifePhase] = useState<"reproductive" | "perimenopause" | "unsure">("reproductive");
  const isMeno = noCycleReason === "menopause" || noCycleReason === "perimenopause";

  const isFemale = biologicalSex === "female";
  // Steps: 0=Info, 1=Goal, 2=Equipment, 3=Style, [4=Women's if female], last=Ready
  const totalSteps = isFemale ? 6 : 5;
  const readyStep = isFemale ? 5 : 4;
  const womensStep = 4;

  function toggleEquipment(id: Equipment) { setEquipment((p) => p.includes(id) ? p.filter((e) => e !== id) : [...p, id]); }
  function toggleStyle(id: WorkoutStyle) { setWorkoutStyles((p) => p.includes(id) ? p.filter((s) => s !== id) : [...p, id]); }
  function toggleSymptom(id: PmsSymptom) { setCommonSymptoms((p) => p.includes(id) ? p.filter((s) => s !== id) : [...p, id]); }
  function toggleCondition(id: HealthCondition) {
    if (id === "none") { setHealthConditions(["none"]); return; }
    setHealthConditions((p) => {
      const without = p.filter((c) => c !== "none");
      return without.includes(id) ? without.filter((c) => c !== id) : [...without, id];
    });
  }

  function handleNext() {
    if (step === 0 && (!name || !age || !weight || !height)) {
      return toast.error("Please fill in your name, age, weight and height to continue.");
    }
    if (step === 2 && equipment.length === 0) {
      return toast.error("Pick at least one equipment option (choose “None” if you have no equipment).");
    }
    if (step === 3 && workoutStyles.length === 0) {
      return toast.error("Pick at least one training style you enjoy.");
    }
    if (step === womensStep && isFemale && cycleStatus === "no" && !noCycleReason) {
      return toast.error("Let us know why your cycle has stopped so we can tailor your guidance.");
    }
    if (step < readyStep) { setStep(step + 1); return; }
    // Final step — submit
    setProfile({
      name, age: Number(age), weight: Number(weight), height: Number(height),
      goal, equipment, workoutStyles, biologicalSex,
      ...(isFemale ? {
        womensHealth: {
          cycleStatus, lastPeriodDate, cycleLength, commonSymptoms, healthConditions,
          ...(cycleStatus === "no"
            ? {
                noCycleReason: noCycleReason ?? "other",
                ...(noCycleReason === "pregnant" && dueDate ? { dueDate } : {}),
                // Menopause staging needs the real last period (blank = unknown), not the cycling default
                ...(isMeno ? { lastPeriodDate: menoLastPeriod } : {}),
              }
            : {}),
          ...(hormones ? { hormones: { consented: hormones.consented, preferNotToSay: hormones.preferNotToSay, uses: hormones.uses } } : {}),
          ...(cycleStatus !== "no" ? { lifePhase } : {}),
        },
      } : {}),
    });
    onDone();
  }

  const stepLabels = isFemale
    ? ["Your Info", "Your Goal", "Equipment", "Workout Style", "Women's Health", "Ready!"]
    : ["Your Info", "Your Goal", "Equipment", "Workout Style", "Ready!"];

  if (quickMeno) return <QuickStart onDone={onDone} onBack={() => setQuickMeno(false)} />;

  return (
    <div className="flex flex-col min-h-full" style={{ background: "var(--app-bg)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `url(https://d2xsxph8kpxj0f.cloudfront.net/310519663713781500/N52YZyrsSNdjSRTgTVUb76/nutrisense-onboarding-3SmdPTeErfea5KVPWPdRcD.webp)`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.14, zIndex: 0 }} />

      <div className="relative z-10 flex flex-col flex-1 px-5 pt-10 pb-8" style={{ overflowY: "auto" }}>
        {/* Logo */}
        <div className="flex items-center gap-2 mb-5 animate-fade-up">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px color-mix(in oklch, var(--accent) 35%, transparent)" }}>
            <Leaf size={16} color="white" />
          </div>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>Glitch</div>
            <div style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>Find the bug. Fix your health.</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 mb-2 animate-fade-up animate-fade-up-delay-1">
          {stepLabels.map((_, i) => (
            <div key={i} style={{ flex: i === step ? 3 : 1, height: 5, borderRadius: 999, background: i <= step ? "var(--accent)" : "var(--surface-2)", transition: "all 0.3s cubic-bezier(0.23, 1, 0.32, 1)" }} />
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--txt-muted)", marginBottom: 14, fontFamily: "'DM Sans', sans-serif" }}>
          Step {step + 1} of {totalSteps} — {stepLabels[step]}
        </p>

        {/* ── Step 0: Personal Info + Sex ── */}
        {step === 0 && (
          <div className="flex flex-col gap-3 flex-1 animate-fade-up animate-fade-up-delay-2">
            <button onClick={() => setQuickMeno(true)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, border: "2px solid color-mix(in oklch, var(--accent) 35%, transparent)", background: "color-mix(in oklch, var(--accent) 8%, var(--card-bg))", textAlign: "left" }}>
              <span style={{ fontSize: 28 }}>💜</span>
              <span>
                <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Quick start for women</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>Periods, pregnancy, postpartum or menopause: 1-minute setup →</span>
              </span>
            </button>
            <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>Let's get to know you</h1>
            <p style={{ fontSize: 13, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>We'll personalize your plan just for you.</p>
            {[
              { label: "Your name",   value: name,   set: setName,   type: "text",   ph: "e.g. Priya" },
              { label: "Age (years)", value: age,    set: setAge,    type: "number", ph: "e.g. 28" },
              { label: "Weight (kg)", value: weight, set: setWeight, type: "number", ph: "e.g. 65" },
              { label: "Height (cm)", value: height, set: setHeight, type: "number", ph: "e.g. 165" },
            ].map(({ label, value, set, type, ph }) => (
              <div key={label} className="flex flex-col gap-1">
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>{label}</label>
                <input type={type} value={value} onChange={(e) => set(e.target.value)} placeholder={ph}
                  style={{ padding: "10px 13px", borderRadius: 11, border: "1.5px solid var(--line)", background: "var(--card-bg)", fontSize: 14, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--surface-2)")} />
              </div>
            ))}
            {/* Biological sex */}
            <div className="flex flex-col gap-1.5">
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Biological Sex</label>
              <div className="flex gap-2">
                {([["female","Female","♀️"],["male","Male","♂️"],["prefer_not_to_say","Prefer Not to Say","—"]] as [BiologicalSex,string,string][]).map(([id, label, icon]) => (
                  <button key={id} onClick={() => setBiologicalSex(id)}
                    style={{ flex: 1, padding: "9px 6px", borderRadius: 11, border: biologicalSex === id ? "2px solid var(--accent)" : "1.5px solid var(--line)", background: biologicalSex === id ? "color-mix(in oklch, var(--accent) 10%, transparent)" : "var(--card-bg)", fontSize: 11, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
                    {icon} {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 1: Goal ── */}
        {step === 1 && (
          <div className="flex flex-col gap-3 flex-1 animate-fade-up animate-fade-up-delay-2">
            <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>What's your goal?</h1>
            {GOALS.map(({ id, label, desc, emoji }) => (
              <button key={id} onClick={() => setGoal(id)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderRadius: 15, border: goal === id ? "2px solid var(--accent)" : "1.5px solid var(--line)", background: goal === id ? "color-mix(in oklch, var(--accent) 8%, transparent)" : "var(--card-bg)", textAlign: "left", transition: "all 0.15s" }}>
                <span style={{ fontSize: 24 }}>{emoji}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>{label}</div>
                  <div style={{ fontSize: 11, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>{desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Step 2: Equipment ── */}
        {step === 2 && (
          <div className="flex flex-col gap-3 flex-1 animate-fade-up animate-fade-up-delay-2">
            <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>What equipment do you have?</h1>
            <p style={{ fontSize: 12, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>Select all that apply.</p>
            <MultiSelectGrid options={EQUIPMENT_OPTIONS} selected={equipment} onToggle={toggleEquipment} />
          </div>
        )}

        {/* ── Step 3: Workout Style ── */}
        {step === 3 && (
          <div className="flex flex-col gap-3 flex-1 animate-fade-up animate-fade-up-delay-2">
            <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>What training do you enjoy?</h1>
            <p style={{ fontSize: 12, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>Pick your favourites — AI will always prioritize your goal.</p>
            <MultiSelectGrid options={STYLE_OPTIONS} selected={workoutStyles} onToggle={toggleStyle} />
            <div style={{ padding: "9px 12px", borderRadius: 11, background: "oklch(0.72 0.08 148 / 0.12)", border: "1px solid oklch(0.72 0.08 148 / 0.3)" }}>
              <p style={{ fontSize: 11, color: "oklch(0.84 0.08 148)", fontFamily: "'DM Sans', sans-serif" }}>💡 Even if you prefer yoga, AI will suggest complementary strength work for your goal.</p>
            </div>
          </div>
        )}

        {/* ── Step 4: Women's Health (female only) ── */}
        {step === womensStep && isFemale && (
          <div className="flex flex-col gap-4 flex-1 animate-fade-up animate-fade-up-delay-2">
            <div>
              <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>Women's Health Profile</h1>
              <p style={{ fontSize: 12, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif", marginTop: 3 }}>This helps us give you cycle-aware nutrition and fitness guidance. Encrypted and stored only on your device.</p>
            </div>

            {/* Cycle status */}
            <div className="flex flex-col gap-1.5">
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Do you currently experience menstrual cycles?</label>
              <div className="flex gap-2">
                {([["yes","Yes"],["no","No"],["irregular","Irregular"]] as [CycleStatus,string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setCycleStatus(id)}
                    style={{ flex: 1, padding: "8px", borderRadius: 10, border: cycleStatus === id ? "2px solid var(--accent)" : "1.5px solid var(--line)", background: cycleStatus === id ? "color-mix(in oklch, var(--accent) 10%, transparent)" : "var(--card-bg)", fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {cycleStatus === "no" && (
              <div className="flex flex-col gap-2">
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Which best describes you right now?</label>
                <div className="flex flex-col gap-2">
                  {NO_CYCLE_OPTIONS.map((id) => {
                    const info = LIFE_STAGES[id];
                    const on = noCycleReason === id;
                    return (
                      <button key={id} onClick={() => setNoCycleReason(id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 13, textAlign: "left", border: on ? "2px solid var(--accent)" : "1.5px solid var(--line)", background: on ? "color-mix(in oklch, var(--accent) 8%, transparent)" : "var(--card-bg)", transition: "all 0.15s" }}>
                        <span style={{ fontSize: 20 }}>{info.emoji}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>{info.label}</span>
                      </button>
                    );
                  })}
                </div>
                {noCycleReason === "pregnant" && (
                  <div className="flex flex-col gap-1">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Due date (optional)</label>
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                      style={{ padding: "10px 13px", borderRadius: 11, border: "1.5px solid var(--line)", background: "var(--card-bg)", fontSize: 14, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", outline: "none", width: "100%" }} />
                  </div>
                )}
                {isMeno && (
                  <div className="flex flex-col gap-1">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>When was your last period? (a rough guess is fine)</label>
                    <input type="date" value={menoLastPeriod} max={new Date().toISOString().split("T")[0]} onChange={(e) => setMenoLastPeriod(e.target.value)}
                      style={{ padding: "10px 13px", borderRadius: 11, border: "1.5px solid var(--line)", background: "var(--card-bg)", fontSize: 14, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", outline: "none", width: "100%" }} />
                    <p style={{ fontSize: 10.5, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>Used to place you on the menopause timeline and spot early menopause.</p>
                  </div>
                )}
                {noCycleReason && (
                  <div style={{ padding: "10px 12px", borderRadius: 11, background: "oklch(0.72 0.08 148 / 0.12)", border: "1px solid oklch(0.72 0.08 148 / 0.3)" }}>
                    <p style={{ fontSize: 11, color: "oklch(0.84 0.08 148)", fontFamily: "'DM Sans', sans-serif" }}>💡 {LIFE_STAGES[noCycleReason].summary}</p>
                  </div>
                )}
              </div>
            )}

            {/* Contraception / fertility / hormone therapy, with consent */}
            <HormoneConsent value={hormones} onChange={setHormones} />

            {cycleStatus !== "no" && (
              <>
                {/* Stage, even while still having periods */}
                <div className="flex flex-col gap-1.5">
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Which best describes your cycle right now?</label>
                  {([
                    ["reproductive", "🌱", "Regular cycles", "My periods are fairly predictable"],
                    ["perimenopause", "🌗", "Changing: perimenopause", "Irregular periods, hot flashes, sleep or mood changes"],
                    ["unsure", "🤔", "Not sure", "Something feels different"],
                  ] as const).map(([id, emoji, title, sub]) => (
                    <button key={id} onClick={() => setLifePhase(id)} aria-pressed={lifePhase === id}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, textAlign: "left", border: lifePhase === id ? "2px solid var(--accent)" : "1.5px solid var(--line)", background: lifePhase === id ? "color-mix(in oklch, var(--accent) 10%, transparent)" : "var(--card-bg)" }}>
                      <span style={{ fontSize: 20 }}>{emoji}</span>
                      <span>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>{title}</span>
                        <span style={{ display: "block", fontSize: 11, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>{sub}</span>
                      </span>
                    </button>
                  ))}
                  {Number(age) >= 40 && lifePhase === "reproductive" && (
                    <p style={{ fontSize: 11, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>Perimenopause often starts in the 40s, sometimes while periods are still regular. You can change this later.</p>
                  )}
                </div>

                {/* Last period date */}
                <div className="flex flex-col gap-1">
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Last Period Start Date</label>
                  <input type="date" value={lastPeriodDate} onChange={(e) => setLastPeriodDate(e.target.value)}
                    style={{ padding: "10px 13px", borderRadius: 11, border: "1.5px solid var(--line)", background: "var(--card-bg)", fontSize: 14, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", outline: "none", width: "100%" }} />
                </div>

                {/* Cycle length */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Average Cycle Length</label>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", fontFamily: "'DM Sans', sans-serif" }}>{cycleLength} days</span>
                  </div>
                  <input type="range" min={21} max={40} value={cycleLength} onChange={(e) => setCycleLength(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--accent)" }} />
                  <div className="flex justify-between">
                    <span style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>21 days</span>
                    <span style={{ fontSize: 10, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>40 days</span>
                  </div>
                </div>

                {/* Common symptoms */}
                <div className="flex flex-col gap-2">
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Common Symptoms (select all that apply)</label>
                  <div className="flex flex-wrap gap-2">
                    {PMS_SYMPTOMS.map(({ id, label, emoji }) => (
                      <button key={id} onClick={() => toggleSymptom(id)}
                        style={{ padding: "5px 11px", borderRadius: 999, border: commonSymptoms.includes(id) ? "none" : "1.5px solid var(--line)", background: commonSymptoms.includes(id) ? "var(--accent)" : "var(--card-bg)", color: commonSymptoms.includes(id) ? "var(--on-accent)" : "var(--ink)", fontSize: 11, fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
                        {emoji} {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Health conditions */}
                <div className="flex flex-col gap-2">
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>Health Conditions</label>
                  <div className="flex flex-wrap gap-2">
                    {HEALTH_CONDITIONS.map(({ id, label }) => (
                      <button key={id} onClick={() => toggleCondition(id)}
                        style={{ padding: "5px 11px", borderRadius: 999, border: healthConditions.includes(id) ? "none" : "1.5px solid var(--line)", background: healthConditions.includes(id) ? "oklch(0.68 0.09 25)" : "var(--card-bg)", color: healthConditions.includes(id) ? "white" : "var(--ink)", fontSize: 11, fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Ready step ── */}
        {step === readyStep && (
          <div className="flex flex-col items-center justify-center flex-1 gap-5 animate-fade-up animate-fade-up-delay-2">
            <div style={{ width: 88, height: 88, borderRadius: "50%", background: "color-mix(in oklch, var(--accent) 12%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 42 }}>🌱</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 24, fontWeight: 700, color: "var(--ink)" }}>You're all set, {name}!</h1>
              <p style={{ fontSize: 13, color: "var(--txt-muted)", marginTop: 8, lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
                Our AI is building your personalized nutrition targets and workout plan.
                {isFemale && cycleStatus !== "no" && " Cycle-aware recommendations are enabled."}
                {isFemale && cycleStatus === "no" && noCycleReason && ` Guidance is tailored for: ${LIFE_STAGES[noCycleReason].label.toLowerCase()}.`}
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {[...equipment, ...workoutStyles].map((tag) => (
                  <span key={tag} style={{ padding: "3px 9px", borderRadius: 999, background: "color-mix(in oklch, var(--accent) 10%, transparent)", color: "oklch(0.84 0.12 38)", fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
                    {tag.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        <button onClick={handleNext} className="flex items-center justify-center gap-2 mt-5"
          style={{ padding: "14px 24px", borderRadius: 15, background: "var(--accent)", color: "var(--on-accent)", fontWeight: 600, fontSize: 15, fontFamily: "'DM Sans', sans-serif", border: "none", boxShadow: "0 6px 20px color-mix(in oklch, var(--accent) 35%, transparent)" }}>
          {step < readyStep ? "Continue" : "Start My Journey"} <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
