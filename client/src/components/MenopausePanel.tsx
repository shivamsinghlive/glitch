/**
 * Glitch — Menopause hub (Cycle tab for peri/post-menopausal users)
 * Stage on the STRAW+10 timeline, one-tap hot-flash logging, WHOOP night-sweat nights, personal
 * triggers, recovery-adjusted strength/bone training, the Menopause Rating Scale and clinician points.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { Flame, Stethoscope } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useHealthInsights } from "@/hooks/useHealthInsights";
import { useMenopauseInsights } from "@/hooks/useMenopauseInsights";
import { MRS_ITEMS, MRS_OPTIONS, scoreMrs, type MenoStage } from "@/lib/menopause";
import HotflashRiskCard from "./HotflashRiskCard";
import ModelEvidenceCard from "./ModelEvidenceCard";

const INK = "var(--ink)";
const MUTED = "var(--txt-muted)";
const HEAT = "oklch(0.63 0.17 35)";
const COOL = "oklch(0.60 0.07 230)";
const SAGE = "oklch(0.60 0.10 148)";
const CARD_BG = "var(--card-bg)";
const font = "'DM Sans', sans-serif";
const card = { background: CARD_BG, borderRadius: 20, padding: 16, boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" };

const TIMELINE: { id: MenoStage; short: string }[] = [
  { id: "reproductive", short: "Cycles" },
  { id: "early_transition", short: "Early peri" },
  { id: "late_transition", short: "Late peri" },
  { id: "early_postmenopause", short: "Early post" },
  { id: "late_postmenopause", short: "Post" },
];

export default function MenopausePanel() {
  const { profile, addHotFlash, addMrs, updateWomensHealth, connectWhoopDemo } = useApp();
  const h = useHealthInsights();
  const m = useMenopauseInsights();
  const [intensity, setIntensity] = useState<1 | 2 | 3>(2);
  const [mrsOpen, setMrsOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [editingDate, setEditingDate] = useState(false);
  if (!m || !profile) return null;

  const idx = TIMELINE.findIndex((t) => t.id === m.stage.stage);

  function logFlash() {
    const hour = new Date().getHours();
    addHotFlash({ id: nanoid(), at: new Date().toISOString(), intensity, night: hour < 6 || hour >= 23 });
    toast.success(["", "Mild", "Moderate", "Severe"][intensity] + " hot flash logged 🔥");
  }

  const chart = m.warm.slice(-30).map((w) => ({
    label: new Date(`${w.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    delta: w.tempDelta, likely: w.likely,
  }));

  return (
    <div className="flex flex-col gap-4 px-4 pt-3">
      {/* Stage */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ ...card, background: "linear-gradient(150deg, oklch(0.63 0.17 35 / 0.12) 0%, var(--card-bg) 70%)" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, fontFamily: font, letterSpacing: 0.4 }}>WHERE YOU ARE</p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 21, fontWeight: 700, color: INK }}>{m.stage.label}</p>
        {m.stage.timing && m.stage.timing !== "typical" && (
          <span style={{ display: "inline-block", marginTop: 4, fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "oklch(0.63 0.17 35 / 0.15)", color: "oklch(0.84 0.18 35)", fontFamily: font }}>
            {m.stage.timing === "premature" ? "PREMATURE MENOPAUSE (BEFORE 40)" : "EARLY MENOPAUSE (BEFORE 45)"}
          </span>
        )}
        {idx >= 0 && (
          <div className="flex gap-1 mt-3">
            {TIMELINE.map((t, i) => (
              <div key={t.id} style={{ flex: 1 }}>
                <div style={{ height: 6, borderRadius: 999, background: i <= idx ? HEAT: "var(--surface-2)", opacity: i === idx ? 1 : i < idx ? 0.45 : 1 }} />
                <p style={{ fontSize: 9.5, color: i === idx ? INK : MUTED, fontWeight: i === idx ? 700 : 500, fontFamily: font, marginTop: 3, textAlign: "center" }}>{t.short}</p>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 12.5, color: INK, fontFamily: font, lineHeight: 1.5, marginTop: 10 }}>{m.stage.explanation}</p>
        {editingDate ? (
          <input type="date" autoFocus defaultValue={profile.womensHealth?.lastPeriodDate} max={new Date().toISOString().slice(0, 10)}
            onBlur={(e) => { if (e.target.value) updateWomensHealth({ lastPeriodDate: e.target.value }); setEditingDate(false); }}
            style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, border: "1.5px solid var(--line)", fontFamily: font, fontSize: 13 }} />
        ) : (
          <button onClick={() => setEditingDate(true)} style={{ marginTop: 8, border: "none", background: "transparent", color: HEAT, fontWeight: 700, fontSize: 12, fontFamily: font, padding: 0 }}>
            {profile.womensHealth?.lastPeriodDate ? "Update last period date" : "+ Add your last period date"}
          </button>
        )}
      </motion.div>

      {/* Hot flash quick log */}
      <div style={card}>
        <div className="flex items-center justify-between mb-2">
          <p style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: font }}>Hot flashes</p>
          {m.demoFlashes && <Demo />}
        </div>
        <div className="flex gap-3 mb-3">
          <Stat value={`${m.flashesToday}`} label="today" />
          <Stat value={`${m.flashesPerDay14}`} label="per day (14d)" />
          <Stat value={`${m.likelyWarm14}`} label="night-sweat nights (14d)" />
        </div>
        <div className="flex gap-1.5 mb-2">
          {([1, 2, 3] as const).map((i) => (
            <button key={i} onClick={() => setIntensity(i)} aria-pressed={intensity === i}
              style={{ flex: 1, padding: "7px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, fontFamily: font, border: intensity === i ? `2px solid ${HEAT}` : "1.5px solid var(--line)", background: intensity === i ? "oklch(0.63 0.17 35 / 0.08)" : CARD_BG, color: INK }}>
              {["", "Mild", "Moderate", "Severe"][i]}
            </button>
          ))}
        </div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={logFlash}
          style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: `linear-gradient(120deg, ${HEAT}, oklch(0.70 0.16 60))`, color: "white", fontWeight: 800, fontSize: 15, fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 18px oklch(0.63 0.17 35 / 0.3)" }}>
          <Flame size={18} /> Log a hot flash now
        </motion.button>
        <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font, marginTop: 6 }}>One tap in the moment. Glitch matches flashes against your meals, stress and sleep to find your triggers.</p>
      </div>

      <HotflashRiskCard hasLoggedFlashes={m.flashes.length > 0 && !m.demoFlashes} />
      <ModelEvidenceCard />

      {/* Warm nights */}
      <div style={card}>
        <p style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: font }}>Night sweats from WHOOP</p>
        <p style={{ fontSize: 11.5, color: MUTED, fontFamily: font, lineHeight: 1.45, marginTop: 3 }}>A guide, not a verdict. It catches under half of real night sweats, so no flag does not mean no sweat. Trust how you felt.</p>
        {!h.connected ? (
          <>
            <p style={{ fontSize: 12.5, color: MUTED, fontFamily: font, lineHeight: 1.5, margin: "6px 0 10px" }}>WHOOP measures your skin temperature and wake-ups every night. Glitch flags nights that run hot <i>and</i> broken: likely night sweats.</p>
            <button onClick={connectWhoopDemo} style={{ padding: "9px 14px", borderRadius: 12, border: "none", background: HEAT, color: "white", fontWeight: 700, fontSize: 12.5, fontFamily: font }}>Try with demo WHOOP data</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 11.5, color: MUTED, fontFamily: font, marginBottom: 6 }}>Skin temperature vs your normal, last 30 nights. <span style={{ color: HEAT, fontWeight: 700 }}>Orange</span> = warm + disrupted.</p>
            <div style={{ height: 120, marginLeft: -22 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} tickLine={false} axisLine={false} interval={6} />
                  <YAxis tick={{ fontSize: 10, fill: MUTED }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`} />
                  <Tooltip formatter={(v: number) => [`${v > 0 ? "+" : ""}${v.toFixed(2)} °C`, "vs normal"]} contentStyle={{ borderRadius: 10, fontSize: 12, fontFamily: font }} />
                  <ReferenceLine y={0.35} stroke={HEAT} strokeDasharray="3 3" />
                  <Bar dataKey="delta" radius={[3, 3, 0, 0]}>
                    {chart.map((c) => <Cell key={c.label} fill={c.likely ? HEAT : COOL} fillOpacity={c.likely ? 1 : 0.45} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font, marginTop: 4 }}>WHOOP reports one temperature per night, so this spots night-sweat <i>nights</i>, not individual flashes.</p>
          </>
        )}
      </div>

      {/* Triggers */}
      <div style={card}>
        <p style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: font, marginBottom: 6 }}>Your hot-flash triggers</p>
        {m.triggers.length ? (
          <div className="flex flex-col gap-1.5">
            {m.triggers.map((t) => (
              <div key={t.trigger} className="flex items-center justify-between" style={{ padding: "9px 11px", borderRadius: 12, background: "oklch(0.63 0.17 35 / 0.08)" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: INK, fontFamily: font }}>{t.label}</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: HEAT, fontFamily: font }}>{t.ratio}× more flashes</p>
              </div>
            ))}
            <p style={{ fontSize: 11, color: MUTED, fontFamily: font, marginTop: 2 }}>Based on {m.triggers[0].days}+ days with vs without each trigger. Try cutting one for two weeks and see if your count drops.</p>
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: MUTED, fontFamily: font, lineHeight: 1.5 }}>Log hot flashes and meals (photo or chat with Glitchy) for a week or two. Glitch will check alcohol, caffeine, spicy food, late meals, stress and warm nights for you.</p>
        )}
      </div>

      {/* Training */}
      <div style={card}>
        <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, fontFamily: font, letterSpacing: 0.4 }}>TODAY'S TRAINING</p>
        <p style={{ fontSize: 17, fontWeight: 800, color: INK, fontFamily: font, marginTop: 2 }}>{m.training.today.emoji} {m.training.today.focus}</p>
        {m.training.adjusted && (
          <p style={{ fontSize: 12, color: "oklch(0.84 0.12 230)", fontFamily: font, marginTop: 6, padding: "8px 10px", borderRadius: 10, background: "oklch(0.60 0.07 230 / 0.10)", lineHeight: 1.45 }}>↻ {m.training.adjusted}</p>
        )}
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {m.training.today.session.map((s) => <li key={s} style={{ fontSize: 13, color: INK, fontFamily: font, marginBottom: 3 }}>{s}</li>)}
        </ul>
        <p style={{ fontSize: 11.5, color: MUTED, fontFamily: font, marginTop: 6, lineHeight: 1.45 }}>Why: {m.training.today.why}</p>
        <div className="flex gap-1 mt-3">
          {m.training.week.map((d, i) => {
            const isToday = i === (new Date().getDay() + 6) % 7;
            return (
              <div key={d.day} style={{ flex: 1, textAlign: "center", padding: "6px 0", borderRadius: 10, background: isToday ? "oklch(0.63 0.17 35 / 0.12)" : "var(--surface-2)", border: isToday ? `1.5px solid ${HEAT}` : "1.5px solid transparent" }}>
                <p style={{ fontSize: 15 }}>{d.emoji}</p>
                <p style={{ fontSize: 9.5, fontWeight: 700, color: isToday ? INK : MUTED, fontFamily: font }}>{d.day}</p>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-1 mt-3">
          {m.training.nutrition.map((n) => <p key={n} style={{ fontSize: 12, color: INK, fontFamily: font }}>🥗 {n}</p>)}
        </div>
      </div>

      {/* Heart & bone */}
      {h.connected && (
        <div style={card}>
          <p style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: font, marginBottom: 8 }}>Heart & metabolic watch</p>
          <div className="flex gap-3">
            {h.trends.restingHr && <Stat value={`${h.trends.restingHr.end}`} label={`resting HR (${h.trends.restingHr.change > 0 ? "+" : ""}${h.trends.restingHr.change})`} good={h.trends.restingHr.change < 0} />}
            {h.vo2 && <Stat value={`${h.vo2.value}`} label={`VO₂max est. · ${h.vo2.category}`} good={["Good", "Excellent", "Superior"].includes(h.vo2.category)} />}
            {h.zone2.length > 0 && <Stat value={`${h.zone2[h.zone2.length - 2]?.minutes ?? 0}`} label="zone-2 min last week" good={(h.zone2[h.zone2.length - 2]?.minutes ?? 0) >= 150} />}
          </div>
          <p style={{ fontSize: 11, color: MUTED, fontFamily: font, marginTop: 8, lineHeight: 1.45 }}>Estrogen helps protect the heart, so after menopause resting heart rate, fitness and zone-2 time matter even more.</p>
        </div>
      )}

      {/* MRS */}
      <div style={card}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: font }}>Symptom check</p>
            <p style={{ fontSize: 11.5, color: MUTED, fontFamily: font }}>Menopause Rating Scale · 11 questions · 1 minute</p>
          </div>
          <button onClick={() => setMrsOpen((v) => !v)} style={{ padding: "8px 14px", borderRadius: 11, border: "none", background: HEAT, color: "white", fontWeight: 700, fontSize: 12.5, fontFamily: font, flexShrink: 0 }}>
            {mrsOpen ? "Close" : m.lastMrs ? "Retake" : "Start"}
          </button>
        </div>
        {m.lastMrs && !mrsOpen && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 13, color: INK, fontFamily: font }}>Last score <b>{m.lastMrs.total}/44</b> · <span style={{ color: m.lastMrs.severity === "severe" || m.lastMrs.severity === "moderate" ? HEAT : SAGE, fontWeight: 700 }}>{m.lastMrs.severity}</span></p>
            {[["Body", m.lastMrs.somatic, 16], ["Mind", m.lastMrs.psychological, 16], ["Urogenital", m.lastMrs.urogenital, 12]].map(([l, v, max]) => (
              <div key={l as string} className="flex items-center gap-2" style={{ marginTop: 6 }}>
                <span style={{ width: 74, fontSize: 11.5, color: MUTED, fontFamily: font }}>{l}</span>
                <div style={{ flex: 1, height: 7, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${((v as number) / (max as number)) * 100}%` }} style={{ height: "100%", background: HEAT, borderRadius: 999 }} />
                </div>
                <span style={{ width: 34, fontSize: 11.5, color: INK, fontFamily: font, textAlign: "right" }}>{v}/{max}</span>
              </div>
            ))}
            {m.lastMrs.top.length > 0 && <p style={{ fontSize: 11.5, color: MUTED, fontFamily: font, marginTop: 6 }}>Most bothersome: {m.lastMrs.top.join(", ")}</p>}
          </div>
        )}
        <AnimatePresence initial={false}>
          {mrsOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
              <p style={{ fontSize: 12, color: MUTED, fontFamily: font, margin: "10px 0 6px" }}>How much are these bothering you right now?</p>
              {MRS_ITEMS.map((item) => (
                <div key={item.id} style={{ marginBottom: 9 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, fontFamily: font, marginBottom: 4 }}>{item.text}</p>
                  <div className="flex gap-1">
                    {MRS_OPTIONS.map((o, v) => (
                      <button key={o} onClick={() => setAnswers((a) => ({ ...a, [item.id]: v }))} aria-pressed={answers[item.id] === v} title={o}
                        style={{ flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 10.5, fontWeight: 600, fontFamily: font, border: answers[item.id] === v ? `2px solid ${HEAT}` : "1.5px solid var(--line)", background: answers[item.id] === v ? "oklch(0.63 0.17 35 / 0.10)" : CARD_BG, color: INK }}>
                        {o.replace("Very severe", "V. severe")}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button disabled={MRS_ITEMS.some((i) => answers[i.id] == null)}
                onClick={() => { addMrs(scoreMrs(answers, new Date().toISOString().slice(0, 10))); setMrsOpen(false); setAnswers({}); }}
                style={{ width: "100%", padding: "10px", borderRadius: 12, border: "none", background: MRS_ITEMS.some((i) => answers[i.id] == null) ? "oklch(0.80 0.03 40)" : HEAT, color: "white", fontWeight: 700, fontSize: 13, fontFamily: font }}>
                See my score
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Clinician */}
      <div style={{ ...card, border: "1.5px solid oklch(0.60 0.07 230 / 0.35)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Stethoscope size={16} style={{ color: COOL }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: font }}>Bring this to your doctor</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {m.clinician.map((c) => <p key={c} style={{ fontSize: 12.5, color: INK, fontFamily: font, lineHeight: 1.45 }}>• {c}</p>)}
        </div>
        <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font, marginTop: 8 }}>Hormone therapy and other treatments are decisions for you and your clinician. Glitch gives you the data to have that conversation.</p>
      </div>
    </div>
  );
}

function Stat({ value, label, good }: { value: string; label: string; good?: boolean }) {
  return (
    <div style={{ flex: 1, padding: "8px 6px", borderRadius: 12, background: "var(--surface-2)", textAlign: "center" }}>
      <p style={{ fontSize: 19, fontWeight: 800, color: good == null ? INK : good ? SAGE : HEAT, fontFamily: font, lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: 9.5, color: MUTED, fontFamily: font, marginTop: 2 }}>{label}</p>
    </div>
  );
}

function Demo() {
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "oklch(0.75 0.12 75 / 0.18)", color: "oklch(0.84 0.12 75)", fontFamily: font }}>DEMO</span>;
}
