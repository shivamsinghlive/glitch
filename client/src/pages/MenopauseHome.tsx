/**
 * Glitch — "My body" home (WHOOP-inspired, glanceable). Adapts to the user's stage:
 *  - cycle: cycle-day ring, cycle-adjusted recovery, HRV, cycle timeline, skin-temp shift, cycle alerts
 *  - peri:  cycle timeline + hot flashes, night sweats, BP and menopause alerts
 *  - menopause: hot flashes, sleep, HRV, night temp, BP, mood
 * Minimal reading: rings, sparkline tiles, a sleep donut, one trend chart, alert pills and a mic.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Mic, Printer, X } from "lucide-react";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, Line, Area, ComposedChart } from "recharts";
import { useApp, bodyKind, getCycleDay, getCyclePhase, type CyclePhase } from "@/contexts/AppContext";
import { useMindInsights } from "@/hooks/useMindInsights";
import { useTheme } from "@/components/Fun";
import { cycleAlerts } from "@/lib/cycleAlerts";
import { useHealthInsights } from "@/hooks/useHealthInsights";
import { useMenopauseInsights } from "@/hooks/useMenopauseInsights";
import { useMenopauseDashboard } from "@/hooks/useMenopauseDashboard";
import { bpCategory, ETHNICITY_OPTIONS, SWAN_VMS_YEARS, SWAN_OVERALL_YEARS, type MenoAlert, type Ethnicity } from "@/lib/menopauseSignals";
import { suggestScreenings, CITATIONS } from "@/lib/boneHealth";
import { triggerEffect } from "@/lib/menopause";
import PopulationEvidence from "@/components/PopulationEvidence";
import EvidenceSource from "@/components/EvidenceSource";

// WHOOP-inspired palette (surfaces come from CSS tokens so light/dark both work)
const BG = "var(--app-bg)";
const CARD = "var(--card-bg)";
const LINE = "var(--line)";
const TXT = "var(--ink)";
const MUT = "var(--txt-muted)";
const GREEN = "oklch(0.80 0.19 150)";
const YELLOW = "oklch(0.86 0.17 95)";
const RED = "oklch(0.68 0.21 25)";
const PURPLE = "oklch(0.72 0.16 290)";
const ORANGE = "oklch(0.77 0.17 55)";
const TEAL = "oklch(0.80 0.13 190)";
const font = "'DM Sans', sans-serif";
const DAY = 86_400_000;
const tile: React.CSSProperties = { background: CARD, borderRadius: 22, padding: 16 };
const cap: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: MUT, textTransform: "uppercase" };
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export default function MenopauseHome({ onTalk }: { onTalk: (prompt?: string) => void }) {
  const { profile, connectWhoopDemo, updateWomensHealth, periodLog } = useApp();
  const mind = useMindInsights();
  const theme = useTheme();
  const h = useHealthInsights();
  const m = useMenopauseInsights();
  const d = useMenopauseDashboard();
  const [report, setReport] = useState(false);
  const [openAlert, setOpenAlert] = useState<string | null>(null);
  useAlertNotifications(d?.alerts ?? []);
  if (!profile || !m || !d) {
    return (
      <div style={{ background: "var(--app-bg)", minHeight: "100%", color: TXT, fontFamily: font, padding: "18px 16px 120px" }}>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ ...cap, letterSpacing: 0.5 }}>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
            <p style={{ fontSize: 26, fontWeight: 800 }}>Hi {profile?.name.split(" ")[0] ?? "there"} 👋</p>
          </div>
        </div>
        <div style={{ ...tile, marginTop: 16, textAlign: "center", padding: "28px 18px" }}>
          <p style={{ fontSize: 40, lineHeight: 1 }}>🌗</p>
          <p style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Setting up your body dashboard</p>
          <p style={{ fontSize: 13, color: MUT, marginTop: 6, lineHeight: 1.5 }}>
            Tell Glitchy a little about how you're feeling, or load demo WHOOP data, and your rings and insights will appear here.
          </p>
          <div className="flex flex-col gap-2" style={{ marginTop: 16 }}>
            <button onClick={() => onTalk()}
              style={{ padding: "12px 16px", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--on-accent)", fontWeight: 800, fontSize: 14, fontFamily: font }}>
              🎙️ Talk to Glitchy
            </button>
            <button onClick={connectWhoopDemo}
              style={{ padding: "12px 16px", borderRadius: 14, border: `1.5px dashed ${LINE}`, background: "transparent", color: TXT, fontWeight: 700, fontSize: 14, fontFamily: font }}>
              ⌚ Connect WHOOP <span style={{ color: "var(--accent)" }}>· demo</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const today = h.today;
  const fl7 = m.flashes.filter((f) => Date.now() - Date.parse(f.at) < 7 * DAY).length / 7;
  const hrvBase = (() => { const xs = h.days.slice(-31, -1).map((x) => x.hrv).filter((x): x is number => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; })();
  const hrvPct = today?.hrv && hrvBase ? Math.round(((today.hrv - hrvBase) / hrvBase) * 100) : null;
  const sleep = today?.sleepPerformance ?? null;
  const lastWarm = m.warm[m.warm.length - 1];
  const lastBp = d.bp[d.bp.length - 1];
  const bpCat = lastBp ? bpCategory(lastBp.systolic, lastBp.diastolic) : null;
  const lastMood = d.moods[d.moods.length - 1];
  const level = (good: boolean, ok: boolean) => (good ? GREEN : ok ? YELLOW : RED);

  // ── Stage ──
  const kind = bodyKind(profile) === "none" ? "menopause" : bodyKind(profile);
  const wh = profile.womensHealth!;
  const cycling = kind === "cycle" || kind === "peri";
  const cycleLen = wh.cycleLength || 28;
  const cycleDay = cycling && wh.lastPeriodDate ? getCycleDay(wh.lastPeriodDate, cycleLen) : null;
  const phase: CyclePhase | null = cycleDay ? h.cycle?.currentPhase ?? getCyclePhase(cycleDay, cycleLen) : null;
  const curWin = h.cycle ? h.cycle.windows.length - 1 : -1;
  const ovDay = curWin >= 0 && h.cycle!.ovulations[curWin]?.status === "confirmed" ? h.cycle!.ovulations[curWin].ovulationCycleDay ?? null : null;
  const cAlerts = cycling && wh.lastPeriodDate
    ? cycleAlerts({ lastPeriodDate: wh.lastPeriodDate, cycleLength: cycleLen, periodStarts: periodLog.map((p) => p.startDate), windows: h.cycle?.windows, ovulations: h.cycle?.ovulations, premenstrualDip: mind.premenstrual, age: profile.age })
    : [];
  // Regular cycles: keep only BP and mental-health flags from the menopause set
  const alerts = kind === "cycle" ? [...d.alerts.filter((a) => /^(bp-|mind-)/.test(a.id)), ...cAlerts] : kind === "peri" ? [...d.alerts, ...cAlerts] : d.alerts;
  const stageChip = kind === "menopause" ? (m.stage.stage === "unknown" ? "🌕 Menopause" : `🌗 ${m.stage.label}`) : kind === "peri" ? "🌗 Perimenopause" : `${theme.emoji} ${theme.label.replace(" phase", "")}`;
  const rec = h.recovery;

  return (
    <div style={{ background: "var(--app-bg)", minHeight: "100%", color: TXT, fontFamily: font, padding: "18px 16px 120px" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p style={{ ...cap, letterSpacing: 0.5 }}>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
          <p style={{ fontSize: 26, fontWeight: 800 }}>Hi {profile.name.split(" ")[0]} 👋</p>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ padding: "6px 11px", borderRadius: 999, background: "var(--surface-2)", fontSize: 12, fontWeight: 700 }}>{stageChip}</span>
          <IconBtn label="Doctor summary" onClick={() => setReport(true)}><FileText size={18} /></IconBtn>
        </div>
      </div>

      {!h.connected && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={connectWhoopDemo}
          style={{ ...tile, width: "100%", marginTop: 14, border: `1.5px dashed ${LINE}`, color: TXT, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          ⌚ Connect WHOOP <span style={{ color: "var(--accent)" }}>· demo</span>
        </motion.button>
      )}

      {/* Rings */}
      {kind === "cycle" ? (
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 16 }}>
        <Ring label="Cycle" value={cycleDay ? cycleDay / cycleLen : 0} color={theme.accent} big={cycleDay ? `${cycleDay}` : "—"} sub={phase ?? "day"} />
        <Ring label="Recovery" value={(rec?.raw ?? 0) / 100} color={rec ? level(rec.raw >= 67, rec.raw >= 34) : MUT} big={rec ? `${rec.raw}%` : "—"} sub={rec?.delta != null ? `${rec.delta >= 0 ? "+" : ""}${rec.delta} vs ${rec.phase ? "phase" : "usual"}` : ""} />
        <Ring label="HRV" value={today?.hrv && hrvBase ? Math.min(1, today.hrv / (hrvBase * 1.4)) : 0} color={hrvPct == null ? MUT : level(hrvPct >= -5, hrvPct >= -12)} big={today?.hrv ? `${Math.round(today.hrv)}` : "—"} sub={hrvPct == null ? "ms" : `${hrvPct > 0 ? "+" : ""}${hrvPct}%`} />
      </div>
      ) : (
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 16 }}>
        <Ring label="Hot flashes" value={Math.min(1, m.flashesToday / 10)} color={ORANGE} big={`${m.flashesToday}`} sub={`avg ${fl7.toFixed(1)}`} />
        <Ring label="Sleep" value={(sleep ?? 0) / 100} color={sleep == null ? MUT : level(sleep >= 85, sleep >= 70)} big={sleep == null ? "—" : `${sleep}%`} sub={today?.sleepHours ? `${today.sleepHours.toFixed(1)}h` : ""} />
        <Ring label="HRV" value={today?.hrv && hrvBase ? Math.min(1, today.hrv / (hrvBase * 1.4)) : 0} color={hrvPct == null ? MUT : level(hrvPct >= -5, hrvPct >= -12)} big={today?.hrv ? `${Math.round(today.hrv)}` : "—"} sub={hrvPct == null ? "ms" : `${hrvPct > 0 ? "+" : ""}${hrvPct}%`} />
      </div>
      )}

      {cycling && cycleDay && <CycleStrip day={cycleDay} length={cycleLen} ovulationDay={ovDay} lastPeriod={wh.lastPeriodDate} />}
      {kind !== "cycle" && <FlashTimeline flashes={m.flashes} />}

      {/* Alerts as pills */}
      {alerts.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {alerts.map((a) => (
              <button key={a.id} onClick={() => setOpenAlert(openAlert === a.id ? null : a.id)}
                style={{ flexShrink: 0, padding: "8px 13px", borderRadius: 999, border: `1.5px solid ${a.level === "urgent" ? RED : a.level === "watch" ? YELLOW : LINE}`, background: openAlert === a.id ? "var(--surface-2)" : "transparent", color: TXT, fontSize: 13, fontWeight: 700 }}>
                {a.icon} {shortTitle(a)}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {openAlert && (
              <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                style={{ overflow: "hidden", fontSize: 13.5, color: "#C9CCD3", lineHeight: 1.5, marginTop: 8, padding: "0 4px" }}>
                {alerts.find((a) => a.id === openAlert)?.detail}
                {(() => { const ev = alerts.find((a) => a.id === openAlert)?.evidenceId; return ev ? <> <EvidenceSource id={ev} /></> : null; })()}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Tiles */}
      {kind === "cycle" ? (
      <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
        <Tile label="Skin temp" icon="🌡️" value={lastWarm ? `${lastWarm.tempDelta > 0 ? "+" : ""}${lastWarm.tempDelta.toFixed(1)}°` : "—"}
          pill={phase === "luteal" ? { t: "Luteal rise", c: PURPLE } : phase === "ovulation" ? { t: "Ovulation", c: ORANGE } : phase ? { t: phase[0].toUpperCase() + phase.slice(1), c: TEAL } : null}
          spark={m.warm.slice(-cycleLen).map((w) => w.tempDelta)} color={TEAL} />
        <Tile label="Sleep" icon="😴" value={sleep != null ? `${sleep}` : "—"} unit="%"
          pill={sleep != null ? { t: sleep >= 85 ? "Great" : sleep >= 70 ? "OK" : "Low", c: level(sleep >= 85, sleep >= 70) } : null}
          spark={h.days.slice(-14).map((x) => x.sleepPerformance ?? NaN)} color={PURPLE} />
        <Tile label="Mood" icon={lastMood ? ["", "😞", "😕", "😐", "🙂", "😄"][lastMood.mood] : "🧠"} value={d.mind.avgMood7 != null ? `${d.mind.avgMood7}` : "—"} unit="/5"
          pill={{ t: d.mind.level === "reach_out" ? "Reach out" : d.mind.level === "watch" ? "Watch" : "Steady", c: d.mind.level === "reach_out" ? RED : d.mind.level === "watch" ? YELLOW : GREEN }}
          spark={d.moods.slice(-14).map((x) => x.mood)} color={PURPLE} />
        <Tile label="Resting HR" icon="❤️" value={today?.restingHr ? `${today.restingHr}` : "—"} unit="bpm"
          pill={phase === "luteal" ? { t: "Luteal ↑ normal", c: YELLOW } : h.trends.restingHr ? { t: `${h.trends.restingHr.change > 0 ? "▲" : "▼"} ${Math.abs(h.trends.restingHr.change)}`, c: h.trends.restingHr.change <= 0 ? GREEN : YELLOW } : null}
          spark={h.days.slice(-14).map((x) => x.restingHr ?? NaN)} color={RED} />
      </div>
      ) : (
      <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
        <Tile label="Night temp" icon="🌡️" value={lastWarm ? `${lastWarm.tempDelta > 0 ? "+" : ""}${lastWarm.tempDelta.toFixed(1)}°` : "—"}
          pill={lastWarm ? (lastWarm.likely ? { t: "Possible sweat", c: RED } : { t: "Normal", c: GREEN }) : null}
          spark={m.warm.slice(-14).map((w) => w.tempDelta)} color={lastWarm?.likely ? RED : TEAL} />
        <Tile label="Blood pressure" icon="🩺" value={lastBp ? `${lastBp.systolic}/${lastBp.diastolic}` : "—"}
          pill={bpCat ? { t: bpCat === "normal" ? "Normal" : bpCat === "elevated" ? "Elevated" : bpCat === "stage1" ? "High · 1" : bpCat === "stage2" ? "High · 2" : "Very high", c: bpCat === "normal" ? GREEN : bpCat === "elevated" || bpCat === "stage1" ? YELLOW : RED } : { t: "Say it", c: MUT }}
          spark={d.bp.slice(-10).map((b) => b.systolic)} color={bpCat === "normal" ? GREEN : bpCat ? YELLOW : MUT} />
        <Tile label="Mood" icon={lastMood ? ["", "😞", "😕", "😐", "🙂", "😄"][lastMood.mood] : "🧠"} value={d.mind.avgMood7 != null ? `${d.mind.avgMood7}` : "—"} unit="/5"
          pill={{ t: d.mind.level === "reach_out" ? "Reach out" : d.mind.level === "watch" ? "Watch" : "Steady", c: d.mind.level === "reach_out" ? RED : d.mind.level === "watch" ? YELLOW : GREEN }}
          spark={d.moods.slice(-14).map((x) => x.mood)} color={PURPLE} />
        <Tile label="Resting HR" icon="❤️" value={today?.restingHr ? `${today.restingHr}` : "—"} unit="bpm"
          pill={h.trends.restingHr ? { t: `${h.trends.restingHr.change > 0 ? "▲" : "▼"} ${Math.abs(h.trends.restingHr.change)}`, c: h.trends.restingHr.change <= 0 ? GREEN : YELLOW } : null}
          spark={h.days.slice(-14).map((x) => x.restingHr ?? NaN)} color={RED} />
      </div>
      )}

      {today?.deepMinutes != null && <SleepDonut light={today.lightMinutes ?? 0} deep={today.deepMinutes ?? 0} rem={today.remMinutes ?? 0} awake={today.awakeMinutes ?? 0} wakeUps={today.disturbances ?? null} />}

      <TrendCard days={h.days} flashes={m.flashes} warm={m.warm} bp={d.bp} moods={d.moods} hrvBase={hrvBase}
        metrics={kind === "cycle" ? ["temp", "recovery", "hrv", "mood"] : ["temp", "flashes", "hrv", "bp", "mood"]} />

      {kind !== "cycle" && <ResearchStrip ethnicity={profile.womensHealth?.ethnicity} onSet={(e) => updateWomensHealth({ ethnicity: e })} />}
      {kind !== "cycle" && <PopulationEvidence />}

      {/* Floating mic */}
      <motion.button onClick={() => onTalk()} whileTap={{ scale: 0.9 }} aria-label="Talk to Glitchy"
        animate={{ boxShadow: ["0 0 0 0 color-mix(in oklch, var(--accent) 55%, transparent)", "0 0 0 16px color-mix(in oklch, var(--accent) 0%, transparent)"] }} transition={{ repeat: Infinity, duration: 1.8 }}
        style={{ position: "fixed", bottom: "calc(84px + var(--safe-bottom))", right: 16, width: 66, height: 66, borderRadius: "50%", border: "none", background: "var(--accent)", color: "var(--on-accent)", zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Mic size={30} />
      </motion.button>

      <AnimatePresence>{report && <DoctorReport onClose={() => setReport(false)} />}</AnimatePresence>
    </div>
  );
}

function shortTitle(a: MenoAlert) {
  const t = a.title;
  if (/Very high blood/.test(t)) return "BP very high";
  if (/Blood pressure/.test(t)) return "BP high";
  if (/night sweats/i.test(t)) return t.replace(/^(Possible )?night sweats /i, "Sweats? ").replace(" of the last ", "/").replace(" nights", "");
  if (/Broken sleep/.test(t)) return t.replace(" of 7 nights", "/7");
  if (/hot flashes a day/.test(t)) return "Frequent flashes";
  if (/before 40/.test(t)) return "Early (<40)";
  if (/Early menopause/.test(t)) return "Early (<45)";
  if (/Late perimenopause/.test(t)) return "Late peri";
  if (/mood both|Mental/.test(t)) return "Mind check";
  if (/Mood dips before/.test(t)) return "PMS mood dip";
  if (/days late/.test(t)) return t.replace("Period ", "").replace(" days late", "d late");
  if (/Cycle length is shifting/.test(t)) return "Cycle shifting";
  if (/No ovulation/.test(t)) return "No ovulation";
  return t.slice(0, 18);
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} aria-label={label} title={label} style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: "var(--surface-2)", color: TXT, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</button>;
}

function Ring({ label, value, color, big, sub }: { label: string; value: number; color: string; big: string; sub: string }) {
  const size = 100, sw = 9, r = (size - sw) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ ...tile, padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)", filter: `drop-shadow(0 0 6px ${color})` }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LINE} strokeWidth={sw} />
          <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={c}
            initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0.02, value)) }} transition={{ duration: 1.1, ease: [0.23, 1, 0.32, 1] }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{big}</span>
          <span style={{ fontSize: 12.5, color: MUT, marginTop: 3 }}>{sub}</span>
        </div>
      </div>
      <p style={{ ...cap, marginTop: 8, fontSize: 11.5 }}>{label}</p>
    </div>
  );
}

function Spark({ data, color, h = 34 }: { data: number[]; color: string; h?: number }) {
  const pts = data.filter((x) => Number.isFinite(x));
  if (pts.length < 2) return <div style={{ height: h }} />;
  const min = Math.min(...pts), max = Math.max(...pts), w = 120;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, h - 4 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = `g${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block" }} aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Tile({ label, icon, value, unit, pill, spark, color }: { label: string; icon: string; value: string; unit?: string; pill: { t: string; c: string } | null; spark: number[]; color: string }) {
  return (
    <motion.div whileTap={{ scale: 0.98 }} style={{ ...tile, display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="flex items-center justify-between">
        <span style={{ ...cap, fontSize: 11.5 }}>{label}</span>
        <span style={{ fontSize: 16 }}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: MUT }}>{unit}</span>}
      </div>
      {pill && <span style={{ alignSelf: "flex-start", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, color: BG, background: pill.c }}>{pill.t}</span>}
      <Spark data={spark} color={color} />
    </motion.div>
  );
}

function FlashTimeline({ flashes }: { flashes: { at: string; intensity: number; night?: boolean }[] }) {
  const todayStr = new Date().toDateString();
  const today = flashes.filter((f) => new Date(f.at).toDateString() === todayStr);
  const nowFrac = (new Date().getHours() * 60 + new Date().getMinutes()) / 1440;
  return (
    <div style={{ ...tile, marginTop: 10, padding: "12px 14px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span style={{ ...cap, fontSize: 11.5 }}>Today's flashes</span>
        <span style={{ fontSize: 12, color: MUT }}>🔥 {today.length}</span>
      </div>
      <div style={{ position: "relative", height: 26 }}>
        <div style={{ position: "absolute", top: 12, left: 0, right: 0, height: 2, background: LINE, borderRadius: 2 }} />
        <div style={{ position: "absolute", top: 12, left: 0, width: `${nowFrac * 100}%`, height: 2, background: "#3A3E49", borderRadius: 2 }} />
        {today.map((f, i) => {
          const t = new Date(f.at), frac = (t.getHours() * 60 + t.getMinutes()) / 1440, s = 8 + f.intensity * 4;
          return <motion.span key={`${f.at}-${i}`} initial={{ scale: 0 }} animate={{ scale: 1 }} title={t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            style={{ position: "absolute", left: `calc(${frac * 100}% - ${s / 2}px)`, top: 13 - s / 2, width: s, height: s, borderRadius: "50%", background: f.night ? PURPLE : ORANGE, boxShadow: `0 0 8px ${f.night ? PURPLE : ORANGE}` }} />;
        })}
      </div>
      <div className="flex justify-between" style={{ fontSize: 11.5, color: MUT }}><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span></div>
    </div>
  );
}

function SleepDonut({ light, deep, rem, awake, wakeUps }: { light: number; deep: number; rem: number; awake: number; wakeUps: number | null }) {
  const data = [{ k: "Deep", v: deep, c: "oklch(0.55 0.17 280)" }, { k: "REM", v: rem, c: PURPLE }, { k: "Light", v: light, c: "oklch(0.82 0.08 280)" }, { k: "Awake", v: awake, c: ORANGE }];
  const asleep = (deep + rem + light) / 60;
  return (
    <div style={{ ...tile, marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="v" innerRadius={40} outerRadius={56} paddingAngle={3} stroke="none" startAngle={90} endAngle={-270}>
              {data.map((s) => <Cell key={s.k} fill={s.c} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 22, fontWeight: 800 }}>{asleep.toFixed(1)}h</span>
          <span style={{ fontSize: 10.5, color: MUT }}>asleep</span>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ ...cap, fontSize: 11.5, marginBottom: 6 }}>Last night</p>
        {data.map((s) => (
          <div key={s.k} className="flex items-center justify-between" style={{ marginBottom: 4 }}>
            <span className="flex items-center gap-2" style={{ fontSize: 13 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: s.c }} />{s.k}</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{Math.floor(s.v / 60) ? `${Math.floor(s.v / 60)}h ` : ""}{s.v % 60}m</span>
          </div>
        ))}
        {wakeUps != null && <p style={{ fontSize: 12, color: MUT, marginTop: 4 }}>⏰ {wakeUps} wake-ups</p>}
      </div>
    </div>
  );
}

type Metric = "flashes" | "temp" | "hrv" | "bp" | "mood" | "recovery";
function TrendCard({ days, flashes, warm, bp, moods, hrvBase, metrics }: {
  metrics: Metric[];
  days: { date: string; hrv: number | null; recovery?: number | null }[]; flashes: { at: string }[]; warm: { date: string; tempDelta: number; likely: boolean }[];
  bp: { at: string; systolic: number; diastolic: number }[]; moods: { at: string; mood: number }[]; hrvBase: number | null;
}) {
  const [metric, setMetric] = useState<Metric>(metrics[0]);
  const dates = useMemo(() => Array.from({ length: 28 }, (_, i) => isoDay(Date.now() - (27 - i) * DAY)), []);
  const label = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const warmBy = new Map(warm.map((w) => [w.date, w]));
  const hrvBy = new Map(days.map((x) => [x.date, x.hrv]));
  const recBy = new Map(days.map((x) => [x.date, x.recovery ?? null]));
  const bpBy = new Map(bp.map((b) => [b.at.slice(0, 10), b]));
  const moodBy = new Map<string, number>(); moods.forEach((x) => moodBy.set(x.at.slice(0, 10), x.mood));
  const data = dates.map((dte) => ({
    l: label(dte),
    flashes: flashes.filter((f) => f.at.slice(0, 10) === dte).length,
    temp: warmBy.get(dte)?.tempDelta ?? null,
    sweat: warmBy.get(dte)?.likely ? warmBy.get(dte)!.tempDelta : null,
    hrv: hrvBy.get(dte) ?? null,
    recovery: recBy.get(dte) ?? null,
    sys: bpBy.get(dte)?.systolic ?? null, dia: bpBy.get(dte)?.diastolic ?? null,
    mood: moodBy.get(dte) ?? null,
  }));
  const allChips: [Metric, string, string][] = [["temp", metrics.includes("flashes") ? "🌡️ Night temp" : "🌡️ Skin temp", TEAL], ["recovery", "⚡ Recovery", GREEN], ["flashes", "🔥 Flashes", ORANGE], ["hrv", "💓 HRV", GREEN], ["bp", "🩺 BP", RED], ["mood", "🧠 Mood", PURPLE]];
  const chips = allChips.filter((c) => metrics.includes(c[0]));
  const color = chips.find((c) => c[0] === metric)![2];
  const axis = { tick: { fontSize: 10.5, fill: MUT }, tickLine: false, axisLine: false };
  const tip = { contentStyle: { background: "var(--surface-2)", border: "none", borderRadius: 12, color: TXT, fontSize: 12.5 }, labelStyle: { color: MUT } };

  return (
    <div style={{ ...tile, marginTop: 10 }}>
      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none", marginBottom: 10 }}>
        {chips.map(([id, t, c]) => (
          <button key={id} onClick={() => setMetric(id)} aria-pressed={metric === id}
            style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 999, border: "none", fontSize: 12.5, fontWeight: 700, background: metric === id ? c : "var(--surface-2)", color: metric === id ? BG : TXT }}>{t}</button>
        ))}
      </div>
      <div style={{ height: 180, marginLeft: -18 }}>
        <ResponsiveContainer width="100%" height="100%">
          {metric === "bp" ? (
            <ComposedChart data={data}>
              <XAxis dataKey="l" interval={6} {...axis} /><YAxis domain={[60, 160]} width={36} {...axis} /><Tooltip {...tip} />
              <ReferenceLine y={130} stroke={YELLOW} strokeDasharray="4 4" /><ReferenceLine y={80} stroke={YELLOW} strokeDasharray="4 4" strokeOpacity={0.5} />
              <Line dataKey="sys" name="Systolic" stroke={RED} strokeWidth={2.5} connectNulls dot={{ r: 3, fill: RED }} type="monotone" />
              <Line dataKey="dia" name="Diastolic" stroke="oklch(0.78 0.12 25)" strokeWidth={2} connectNulls dot={{ r: 2 }} type="monotone" />
            </ComposedChart>
          ) : (
            <ComposedChart data={data}>
              <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.45} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="l" interval={6} {...axis} />
              <YAxis width={36} domain={metric === "mood" ? [1, 5] : ["auto", "auto"]} allowDecimals={metric !== "flashes"} {...axis} tickFormatter={(v) => (metric === "temp" ? `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}` : `${Math.round(v)}`)} />
              <Tooltip {...tip} />
              {metric === "temp" && <ReferenceLine y={0.35} stroke={RED} strokeDasharray="4 4" />}
              {metric === "hrv" && hrvBase && <ReferenceLine y={hrvBase} stroke={MUT} strokeDasharray="4 4" />}
              <Area type="monotone" dataKey={metric} name={chips.find((c) => c[0] === metric)![1]} stroke={color} strokeWidth={2.5} fill="url(#trendFill)" connectNulls dot={false} />
              {metric === "temp" && metrics.includes("flashes") && <Line dataKey="sweat" name="Possible night sweat" stroke="none" dot={{ r: 5, fill: RED, stroke: BG, strokeWidth: 2 }} isAnimationActive={false} />}
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 11.5, color: MUT, marginTop: 4 }}>
        {metric === "temp" ? (metrics.includes("flashes") ? "🔴 = possible night sweat (warm skin + broken sleep; an estimate, not validated)" : "Rises ~0.3° after ovulation and stays up until your period") : metric === "bp" ? "Dashed = 130/80" : metric === "hrv" ? "Dashed = your usual" : "Last 4 weeks"}
      </p>
    </div>
  );
}

function ResearchStrip({ ethnicity, onSet }: { ethnicity?: Ethnicity | "prefer_not"; onSet: (e: Ethnicity | "prefer_not") => void }) {
  const [pick, setPick] = useState(false);
  const mine = SWAN_VMS_YEARS.find((r) => r.key === ethnicity);
  const max = 12;
  return (
    <div style={{ ...tile, marginTop: 10 }}>
      <div className="flex items-center justify-between">
        <span style={{ ...cap, fontSize: 11.5 }}>How long hot flashes last</span>
        <button onClick={() => setPick((v) => !v)} style={{ border: "none", background: "transparent", color: MUT, fontSize: 11.5, textDecoration: "underline" }}>{ethnicity ? "change" : "add yours"}</button>
      </div>
      {/* Dot scale: one dot per group on a 0–12 year line; yours glows */}
      <div style={{ position: "relative", height: 74, marginTop: 10 }}>
        <div style={{ position: "absolute", top: 34, left: 0, right: 0, height: 2, background: LINE }} />
        <div style={{ position: "absolute", top: 26, left: `${(SWAN_OVERALL_YEARS / max) * 100}%`, width: 1, height: 18, background: MUT }} />
        {SWAN_VMS_YEARS.map((r, i) => {
          const isMine = r.key === ethnicity;
          const up = i % 2 === 0;
          const s = isMine ? 16 : 11;
          return (
            <div key={r.group} style={{ position: "absolute", left: `${(r.years / max) * 100}%`, top: 0, height: 74, transform: "translateX(-50%)" }}>
              {up && <p style={{ fontSize: 10, color: isMine ? TXT : MUT, fontWeight: isMine ? 800 : 500, whiteSpace: "nowrap", textAlign: "center" }}>{r.key === "black" ? "Black" : r.group.split(" ")[0]}</p>}
              <span style={{ position: "absolute", top: 35 - s / 2, left: "50%", marginLeft: -s / 2, width: s, height: s, borderRadius: "50%", background: isMine ? ORANGE : "#4A4E5A", boxShadow: isMine ? `0 0 10px ${ORANGE}` : "none" }} />
              {!up && <p style={{ position: "absolute", top: 50, left: "50%", transform: "translateX(-50%)", fontSize: 10, color: isMine ? TXT : MUT, fontWeight: isMine ? 800 : 500, whiteSpace: "nowrap" }}>{r.key === "black" ? "Black" : r.group.split(" ")[0]}</p>}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between" style={{ fontSize: 10, color: MUT }}><span>0 yrs</span><span>avg {SWAN_OVERALL_YEARS}</span><span>12 yrs</span></div>
      {mine && <p style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>Women like you: <span style={{ color: ORANGE }}>~{mine.years} years</span></p>}
      <AnimatePresence>
        {pick && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
              {[...ETHNICITY_OPTIONS.map((o) => [o.id, o.label] as const), ["prefer_not", "Prefer not to say"] as const].map(([id, l]) => (
                <button key={id} onClick={() => { onSet(id as Ethnicity | "prefer_not"); setPick(false); }}
                  style={{ padding: "6px 11px", borderRadius: 999, border: "none", fontSize: 12, fontWeight: 600, background: ethnicity === id ? ORANGE : "var(--surface-2)", color: ethnicity === id ? BG : TXT }}>{l}</button>
              ))}
            </div>
            <p style={{ fontSize: 10.5, color: MUT, marginTop: 6 }}>Optional · research context only · never used to score you</p>
          </motion.div>
        )}
      </AnimatePresence>
      <p style={{ fontSize: 10, color: "#5D626D", marginTop: 6 }}>SWAN · Avis et al., JAMA Intern Med 2015 · group medians, not a prediction for you <EvidenceSource id="swan-vms-duration-by-ethnicity" label="PubMed" /></p>
    </div>
  );
}

function useAlertNotifications(alerts: MenoAlert[]) {
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    let sent: string[] = [];
    try { sent = JSON.parse(localStorage.getItem("glitch.notified") ?? "[]"); } catch { /* storage unavailable */ }
    const fresh = alerts.filter((a) => a.level !== "info" && !sent.includes(a.id));
    for (const a of fresh) new Notification(`Glitch: ${a.title}`, { body: a.detail, tag: a.id });
    if (fresh.length) try { localStorage.setItem("glitch.notified", JSON.stringify([...sent, ...fresh.map((a) => a.id)].slice(-200))); } catch { /* ignore */ }
  }, [alerts]);
}

function DoctorReport({ onClose }: { onClose: () => void }) {
  const { profile } = useApp();
  const h = useHealthInsights();
  const m = useMenopauseInsights()!;
  const d = useMenopauseDashboard()!;
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "denied");
  const screenings = suggestScreenings(profile?.age ?? 0);
  const short = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const weeks = [3, 2, 1, 0].map((w) => {
    const end = Date.now() - w * 7 * DAY, start = end - 7 * DAY;
    const inW = (iso: string) => { const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00Z` : iso); return t > start && t <= end; };
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const bp = d.bp.filter((b) => inW(b.at));
    return {
      label: `${short(start + DAY)}–${short(end)}`,
      flashes: (m.flashes.filter((f) => inW(f.at) && !f.night).length / 7).toFixed(1),
      sweats: m.warm.filter((x) => x.likely && inW(x.date)).length,
      wake: avg(d.frag.filter((f) => inW(f.date) && f.wakeUps != null).map((f) => f.wakeUps!))?.toFixed(0) ?? "—",
      hrv: avg(h.days.filter((x) => inW(x.date) && x.hrv != null).map((x) => x.hrv!))?.toFixed(0) ?? "—",
      bp: bp.length ? `${Math.round(avg(bp.map((b) => b.systolic))!)}/${Math.round(avg(bp.map((b) => b.diastolic))!)}` : "—",
      mood: avg(d.moods.filter((x) => inW(x.at)).map((x) => x.mood))?.toFixed(1) ?? "—",
    };
  });
  const cell: React.CSSProperties = { padding: "8px 6px", borderBottom: "1px solid #e5e0d8", fontSize: 13, textAlign: "center" };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <motion.div initial={{ y: 40 }} animate={{ y: 0 }} className="print-area"
        style={{ width: "100%", maxHeight: "92%", overflowY: "auto", background: "white", borderRadius: "24px 24px 0 0", padding: 20, fontFamily: font, color: "#222" }}>
        <div className="flex items-center justify-between no-print">
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5" style={{ padding: "10px 16px", borderRadius: 999, border: "none", background: "#111", color: "white", fontWeight: 700, fontSize: 14 }}><Printer size={16} /> Print / PDF</button>
            {perm === "default" && <button onClick={() => Notification.requestPermission().then(setPerm)} style={{ padding: "10px 14px", borderRadius: 999, border: "1.5px solid #ddd", background: "white", fontWeight: 700, fontSize: 13 }}>🔔 Alerts</button>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", padding: 6 }}><X size={22} /></button>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 14 }}>Menopause symptom summary</h2>
        <p style={{ fontSize: 13, color: "#777" }}>{profile?.name}, {profile?.age} · {m.stage.label}{m.stage.timing && m.stage.timing !== "typical" ? ` (${m.stage.timing})` : ""} · {new Date().toLocaleDateString()}</p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead><tr style={{ background: "#f6f1ea" }}>{["Week", "Flashes /day", "Night sweats", "Wake-ups", "HRV", "BP", "Mood"].map((t) => <th key={t} style={{ ...cell, fontSize: 11.5, fontWeight: 800 }}>{t}</th>)}</tr></thead>
          <tbody>{weeks.map((w) => (
            <tr key={w.label}><td style={{ ...cell, textAlign: "left", fontWeight: 700 }}>{w.label}</td><td style={cell}>{w.flashes}</td><td style={cell}>{w.sweats}</td><td style={cell}>{w.wake}</td><td style={cell}>{w.hrv}</td><td style={cell}>{w.bp}</td><td style={cell}>{w.mood}</td></tr>
          ))}</tbody>
        </table>
        {m.triggers.length > 0 && <p style={{ fontSize: 13, marginTop: 12 }}><b>Possible triggers (from my logs; association, not proof of cause):</b> {m.triggers.map((t) => `${t.label}: ${triggerEffect(t)}, ${t.days} vs ${t.withoutDays} days, q = ${t.qValue.toFixed(3)}`).join("; ")}</p>}
        {m.triggersUnclear.length > 0 && <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>Tested, no clear link yet: {m.triggersUnclear.map((t) => t.label).join(", ")}.</p>}
        {d.alerts.length > 0 && <p style={{ fontSize: 13, marginTop: 6 }}><b>Flags:</b> {d.alerts.map((a) => a.title).join("; ")}</p>}
        <p style={{ fontSize: 13, marginTop: 10, fontWeight: 800 }}>Questions for my doctor</p>
        <ul style={{ paddingLeft: 18, marginTop: 4 }}>{m.clinician.map((c) => <li key={c} style={{ fontSize: 13, marginBottom: 4, lineHeight: 1.45 }}>{c}</li>)}</ul>
        {screenings.length > 0 && (
          <>
            <p style={{ fontSize: 13, marginTop: 10, fontWeight: 800 }}>Recommended screenings</p>
            <ul style={{ paddingLeft: 18, marginTop: 4 }}>{screenings.map((s) => (
              <li key={s.name} style={{ fontSize: 13, marginBottom: 4, lineHeight: 1.45 }}>
                <b>{s.name}</b> — {s.reason} <a className="no-print" href={CITATIONS[s.citationKey].url} target="_blank" rel="noreferrer" style={{ color: "#0a66c2" }}>(source)</a>
              </li>
            ))}</ul>
          </>
        )}
        <p style={{ fontSize: 11, color: "#888", marginTop: 10 }}>WHOOP (sleep, skin temperature, HRV), home BP and voice check-ins via Glitch. Night sweats inferred from nightly skin temperature + sleep disruption. Not a diagnosis.</p>
      </motion.div>
    </motion.div>
  );
}

// ── Cycle timeline (phases as segments, today + ovulation markers) ──
const PHASE_COLOR: Record<CyclePhase, string> = {
  menstrual: "oklch(0.70 0.17 10)", follicular: "oklch(0.76 0.13 165)", ovulation: "oklch(0.80 0.16 55)", luteal: "oklch(0.70 0.14 320)",
};
function CycleStrip({ day, length, ovulationDay, lastPeriod }: { day: number; length: number; ovulationDay: number | null; lastPeriod: string }) {
  const ov = ovulationDay ?? length - 14;
  const segs: [CyclePhase, number, number][] = [["menstrual", 1, 5], ["follicular", 6, ov - 2], ["ovulation", ov - 1, ov + 1], ["luteal", ov + 2, length]];
  const next = new Date(Date.parse(`${lastPeriod}T12:00:00Z`) + length * DAY);
  const inDays = Math.max(0, length - day + 1);
  const pct = (d: number) => ((d - 1) / length) * 100;
  return (
    <div style={{ ...tile, marginTop: 10, padding: "12px 14px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <span style={{ ...cap, fontSize: 11.5 }}>Cycle · day {day} of {length}</span>
        <span style={{ fontSize: 12, color: MUT }}>🩸 in {inDays}d · {next.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
      </div>
      <div style={{ position: "relative", height: 26 }}>
        <div className="flex" style={{ position: "absolute", top: 8, left: 0, right: 0, height: 10, borderRadius: 999, overflow: "hidden", gap: 2 }}>
          {segs.map(([ph, a, b]) => <span key={ph} style={{ width: `${((b - a + 1) / length) * 100}%`, background: PHASE_COLOR[ph], opacity: day >= a && day <= b ? 1 : 0.35 }} />)}
        </div>
        <span title={ovulationDay ? "Ovulation (confirmed)" : "Ovulation (estimated)"} style={{ position: "absolute", left: `calc(${pct(ov)}% - 6px)`, top: 7, width: 12, height: 12, borderRadius: "50%", border: `2px solid ${TXT}`, background: ovulationDay ? PHASE_COLOR.ovulation : "transparent" }} />
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ position: "absolute", left: `calc(${pct(day)}% - 2px)`, top: 0, width: 4, height: 26, borderRadius: 2, background: TXT, boxShadow: `0 0 8px ${TXT}` }} />
      </div>
      <div className="flex justify-between" style={{ fontSize: 10.5, color: MUT, marginTop: 4 }}>
        <span>Period</span><span>Follicular</span><span>{ovulationDay ? "Ovulated ✓" : "Ovulation"}</span><span>Luteal</span>
      </div>
    </div>
  );
}
