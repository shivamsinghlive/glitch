/**
 * Glitch — Hot-flash risk factors (educational ML model with a visible model card).
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { hotflashRisk, whatIfChanges, MODEL_CARD } from "@/lib/hotflashRisk";

const INK = "var(--ink)";
const MUTED = "var(--txt-muted)";
const HEAT = "oklch(0.63 0.17 35)";
const SAGE = "oklch(0.60 0.10 148)";
const font = "'DM Sans', sans-serif";

export default function HotflashRiskCard({ hasLoggedFlashes }: { hasLoggedFlashes: boolean }) {
  const { profile, updateWomensHealth, mrsLog } = useApp();
  const [showCard, setShowCard] = useState(false);
  const [labsOpen, setLabsOpen] = useState(false);
  if (!profile?.womensHealth) return null;
  const wh = profile.womensHealth;

  const bmi = profile.weight / (profile.height / 100) ** 2;
  // Prior symptoms: explicit answer wins; otherwise infer from logs / MRS
  const lastMrs = mrsLog[mrsLog.length - 1];
  const priorSymptoms = wh.priorMenoSymptoms ?? (hasLoggedFlashes || (lastMrs ? lastMrs.somatic > 0 : false));
  const r = hotflashRisk({ age: profile.age, smoker: !!wh.smoker, bmi, priorSymptoms, fsh: wh.labs?.fsh, estradiol: wh.labs?.estradiol });
  const whatIf = whatIfChanges({ age: profile.age, smoker: !!wh.smoker, bmi, priorSymptoms, fsh: wh.labs?.fsh, estradiol: wh.labs?.estradiol });
  const pct = Math.round(r.probability * 100);
  const base = Math.round(r.prevalence * 100);
  const ev = r.usedLabs ? MODEL_CARD.evaluation.withLabs : MODEL_CARD.evaluation.base;
  const lr = ev.comparison.logisticRegression;
  const gbm = ev.comparison.gradientBoosting;
  const color = r.relative === "higher" ? HEAT : r.relative === "lower" ? SAGE: "oklch(0.70 0.12 75)";

  return (
    <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: 16, boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" }}>
      <div className="flex items-center justify-between">
        <p style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: font }}>Hot-flash risk factors</p>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "oklch(0.58 0.09 260 / 0.12)", color: "oklch(0.84 0.11 260)", fontFamily: font }}>ML · EDUCATIONAL</span>
      </div>

      {/* Gauge */}
      <div style={{ marginTop: 12 }}>
        <div style={{ position: "relative", height: 10, borderRadius: 999, background: "linear-gradient(90deg, oklch(0.80 0.08 148), oklch(0.85 0.10 85), oklch(0.70 0.15 35))" }}>
          <div title={`Study average ${base}%`} style={{ position: "absolute", left: `${base}%`, top: -4, width: 2, height: 18, background: INK, opacity: 0.5 }} />
          <motion.div initial={{ left: "0%" }} animate={{ left: `${Math.min(97, pct)}%` }} transition={{ type: "spring", stiffness: 120, damping: 16 }}
            style={{ position: "absolute", top: -5, width: 20, height: 20, marginLeft: -10, borderRadius: "50%", background: "var(--card-bg)", border: `4px solid ${color}`, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }} />
        </div>
        <div className="flex justify-between" style={{ marginTop: 6 }}>
          <span style={{ fontSize: 10.5, color: MUTED, fontFamily: font }}>lower</span>
          <span style={{ fontSize: 10.5, color: MUTED, fontFamily: font }}>│ study average</span>
          <span style={{ fontSize: 10.5, color: MUTED, fontFamily: font }}>higher</span>
        </div>
      </div>
      <p style={{ fontSize: 13, color: INK, fontFamily: font, marginTop: 8, lineHeight: 1.45 }}>
        Women with a profile like yours reported hot flashes <b style={{ color }}>{r.relative === "similar" ? "about as often as" : `${r.relative} than`}</b> the study average ({base}%).
        {r.outOfRange && <span style={{ color: MUTED }}> (The model was trained on ages 35–48.)</span>}
      </p>

      {/* Inputs */}
      <div className="flex flex-col gap-1.5" style={{ marginTop: 10 }}>
        <Toggle label="I smoke" on={!!wh.smoker} onChange={(v) => updateWomensHealth({ smoker: v })} hint={wh.smoker ? `${r.factors.find((f) => f.key === "smoker")!.oddsRatio}× odds · modifiable` : undefined} />
        <Toggle label="I've had hot flashes / night sweats before" on={priorSymptoms} onChange={(v) => updateWomensHealth({ priorMenoSymptoms: v })} hint={priorSymptoms ? `${r.factors.find((f) => f.key === "prior_symptoms")!.oddsRatio}× odds · strongest factor` : undefined} />
        <div className="flex items-center justify-between" style={{ padding: "8px 11px", borderRadius: 11, background: "var(--surface-2)" }}>
          <span style={{ fontSize: 12.5, color: INK, fontFamily: font }}>BMI (from your profile)</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: bmi >= 30 ? HEAT : INK, fontFamily: font }}>{bmi.toFixed(1)}{bmi >= 30 ? ` · ${r.factors.find((f) => f.key === "bmi30")!.oddsRatio}× odds · modifiable` : ""}</span>
        </div>
      </div>

      <button onClick={() => setLabsOpen((v) => !v)} style={{ marginTop: 8, border: "none", background: "transparent", color: HEAT, fontWeight: 700, fontSize: 12, fontFamily: font, padding: 0 }}>
        {r.usedLabs ? "✓ Using your lab values. Edit" : "+ Add FSH & estradiol from a blood test (sharper model)"}
      </button>
      <AnimatePresence initial={false}>
        {labsOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div className="flex gap-2" style={{ marginTop: 8 }}>
              <LabInput label="FSH (mIU/mL)" value={wh.labs?.fsh} onChange={(v) => updateWomensHealth({ labs: { ...wh.labs, fsh: v } })} />
              <LabInput label="Estradiol (pg/mL)" value={wh.labs?.estradiol} onChange={(v) => updateWomensHealth({ labs: { ...wh.labs, estradiol: v } })} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {r.factors.some((f) => f.present && f.modifiable) && (
        <p style={{ fontSize: 12, color: INK, fontFamily: font, marginTop: 10, padding: "8px 10px", borderRadius: 10, background: "oklch(0.60 0.10 148 / 0.10)" }}>
          🌱 {r.factors.filter((f) => f.present && f.modifiable).map((f) => f.label.toLowerCase()).join(" and ")} {r.factors.filter((f) => f.present && f.modifiable).length > 1 ? "are" : "is"} linked to more hot flashes, and {r.factors.filter((f) => f.present && f.modifiable).length > 1 ? "both are" : "it's"} something you can change. Your Glitch plan already targets this.
        </p>
      )}

      {whatIf.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: INK, fontFamily: font, lineHeight: 1.5 }}>
          {whatIf.map((w) => (
            <p key={w.label}>🔮 <b>What if</b> you {w.label}? The model's estimate moves from <b>{Math.round(w.from * 100)}%</b> to <b>{Math.round(w.to * 100)}%</b>. <span style={{ color: MUTED }}>(Association in a 2001 cohort, not a promise.)</span></p>
          ))}
        </div>
      )}

      <button onClick={() => setShowCard((v) => !v)} style={{ marginTop: 10, border: "none", background: "transparent", color: MUTED, fontWeight: 600, fontSize: 11.5, fontFamily: font, padding: 0 }}>
        {showCard ? "Hide" : "How this model works"} ▾
      </button>
      <AnimatePresence initial={false}>
        {showCard && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 12, background: "var(--surface-2)", fontSize: 11.5, color: INK, fontFamily: font, lineHeight: 1.55 }}>
              <p><b>Model:</b> logistic regression trained on {MODEL_CARD.trainedOn}.</p>
              <p><b>Accuracy:</b> cross-validated AUC {MODEL_CARD.aucBase} (profile) / {MODEL_CARD.aucLabs} (with labs).</p>
              <p><b>Held-out check ({r.usedLabs ? "with labs" : "profile"}):</b> AUC {lr.oofAuc.toFixed(2)} (95% CI {lr.oofAucCi95[0].toFixed(2)}–{lr.oofAucCi95[1].toFixed(2)}) vs {gbm.oofAuc.toFixed(2)} for gradient boosting and {ev.comparison.interceptOnly.cvAucMean.toFixed(2)} for guessing the average · Brier {ev.calibration.brier.toFixed(3)} (baseline {ev.calibration.brierBaseline.toFixed(3)}) · calibration slope {ev.calibration.slope.toFixed(2)}.</p>
              <p><b>Honest read:</b> most of the signal is one question, earlier symptoms. Its yes/no calls match that single question exactly (F1 0.61).</p>
              <p><b>Fairness:</b> {MODEL_CARD.excluded.join(" and ")} are in the dataset but deliberately not used. Held-out audit by race: {ev.fairness.race.summary} Full group breakdown in Model evidence.</p>
              <p><b>Limits:</b> {MODEL_CARD.caveat}</p>
              <p style={{ color: MUTED, marginTop: 4 }}>{MODEL_CARD.citation} · {MODEL_CARD.license}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Toggle({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} className="flex items-center justify-between"
      style={{ padding: "8px 11px", borderRadius: 11, border: on ? `1.5px solid ${HEAT}` : "1.5px solid transparent", background: on ? "oklch(0.63 0.17 35 / 0.07)" : "var(--surface-2)", textAlign: "left" }}>
      <span style={{ fontSize: 12.5, color: INK, fontFamily: font }}>{label}</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: on ? HEAT : MUTED, fontFamily: font }}>{on ? hint ?? "Yes" : "No"}</span>
    </button>
  );
}

function LabInput({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label style={{ flex: 1 }}>
      <span style={{ fontSize: 11, color: MUTED, fontFamily: font }}>{label}</span>
      <input type="number" inputMode="decimal" min={0} defaultValue={value ?? ""} onBlur={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        style={{ width: "100%", marginTop: 3, padding: "8px 10px", borderRadius: 10, border: "1.5px solid var(--line)", fontSize: 13, fontFamily: font }} />
    </label>
  );
}
