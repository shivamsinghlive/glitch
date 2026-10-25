/**
 * Glitch — Home for women with a menstrual cycle. No wearable needed.
 * Today's phase → advice from HER OWN patterns (n-of-1 test in lib/phasePatterns.ts, not textbook
 * averages) → 20-second check-in → her phase-by-metric pattern grid → a kind "welcome back" after a gap.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Mic, Watch } from "lucide-react";
import { useApp, getCycleDay, getCyclePhase, getNextPeriodDate, type CyclePhase } from "@/contexts/AppContext";
import { useTheme } from "@/components/Fun";
import DailyCheckIn from "@/components/DailyCheckIn";
import EvidenceSource from "@/components/EvidenceSource";
import LifeStagePopulation from "@/components/LifeStagePopulation";
import { adviceForToday, analyzePhasePatterns, daysSinceLastLog, describeFinding, PHASES, PHASE_LABEL, PHASE_METRICS } from "@/lib/phasePatterns";

const font = "'DM Sans', sans-serif";
const tile: React.CSSProperties = { background: "var(--card-bg)", borderRadius: 22, padding: 16, marginTop: 14 };
const cap: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: "var(--txt-muted)", textTransform: "uppercase" };
const PHASE_EMOJI: Record<CyclePhase, string> = { menstrual: "🩸", follicular: "🌱", ovulation: "✨", luteal: "🌙" };
const PHASE_SHORT: Record<CyclePhase, string> = { menstrual: "Period", follicular: "Follicular", ovulation: "Ovulation", luteal: "Luteal" };

export default function CycleHome({ onTalk, onWearable }: { onTalk: (prompt?: string) => void; onWearable: () => void }) {
  const { profile, cycleSymptomLog, loadDemoCheckIns } = useApp();
  const theme = useTheme();
  const wh = profile!.womensHealth!;
  const len = wh.cycleLength || 28;
  const day = getCycleDay(wh.lastPeriodDate, len);
  const phase = getCyclePhase(day, len);
  const phaseOf = (d: number) => getCyclePhase(d, len);
  const daysToPeriod = Math.max(0, Math.ceil((getNextPeriodDate(wh.lastPeriodDate, len).getTime() - Date.now()) / 86_400_000) % len);

  const report = useMemo(() => analyzePhasePatterns(cycleSymptomLog, phaseOf), [cycleSymptomLog, len]); // eslint-disable-line react-hooks/exhaustive-deps
  const advice = adviceForToday(phase, report);
  const gap = daysSinceLastLog(cycleSymptomLog);
  const first = profile!.name.split(" ")[0];
  const accent = theme.accent;

  return (
    <div style={{ background: "var(--app-bg)", minHeight: "100%", color: "var(--ink)", fontFamily: font, padding: "18px 16px 120px" }}>
      <div className="flex items-center justify-between">
        <div>
          <p style={{ ...cap, letterSpacing: 0.5 }}>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
          <p style={{ fontSize: 26, fontWeight: 800 }}>Hi {first} 👋</p>
        </div>
        <button onClick={onWearable} aria-label="Wearable view" style={{ padding: "7px 11px", borderRadius: 999, border: "1.5px solid var(--line)", background: "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
          <Watch size={14} /> Wearable
        </button>
      </div>

      {/* Phase hero */}
      <div style={{ ...tile, display: "flex", alignItems: "center", gap: 16 }}>
        <PhaseRing day={day} len={len} color={accent} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 20, fontWeight: 800 }}>{PHASE_EMOJI[phase]} {PHASE_SHORT[phase]}</p>
          <p style={{ fontSize: 13.5, color: "var(--txt-muted)", marginTop: 2 }}>Day {day} of ~{len} · period in ~{daysToPeriod || len} days</p>
          <p style={{ fontSize: 11.5, color: "var(--txt-muted)", marginTop: 6 }}>Estimated from your last period date. Your body may not follow the calendar exactly.</p>
        </div>
      </div>

      {/* Welcome back after a gap: self-compassion, not guilt */}
      {cycleSymptomLog.length > 0 && gap >= 5 && (
        <div style={{ ...tile, border: `1.5px solid color-mix(in oklch, ${accent} 45%, transparent)` }}>
          <p style={{ fontSize: 17, fontWeight: 800 }}>Welcome back, {first} 💛</p>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 6 }}>
            It's been {gap} days. That's not failing, that's life{phase === "luteal" || phase === "menstrual" ? `, and it lines up with your ${PHASE_LABEL[phase]}, when a lot of women find motivation harder` : ""}.
            One missed week doesn't erase what you've built. Start small today.
          </p>
          <div className="flex gap-2" style={{ marginTop: 10 }}>
            <motion.button whileTap={{ scale: 0.96 }} onClick={() => onTalk(`I missed ${gap} days of workouts and check-ins and I'm in my ${PHASE_LABEL[phase]}. Give me a gentle 10-minute restart for today, no guilt.`)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", background: accent, color: "var(--on-accent)", fontWeight: 800, fontSize: 13.5 }}>10-minute restart</motion.button>
            <motion.button whileTap={{ scale: 0.96 }} onClick={() => document.getElementById("checkin")?.scrollIntoView({ behavior: "smooth" })}
              style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "1.5px solid var(--line)", background: "transparent", color: "var(--ink)", fontWeight: 700, fontSize: 13.5 }}>Just check in</motion.button>
          </div>
        </div>
      )}

      {/* Today, from her own data */}
      <div style={tile}>
        <p style={cap}>Today for you</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
          {advice.map((a) => (
            <div key={a.title} className="flex gap-3">
              <span style={{ fontSize: 24 }}>{a.emoji}</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800 }}>{a.title}</p>
                <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 2 }}>{a.body} {a.evidenceId && <EvidenceSource id={a.evidenceId} />}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div id="checkin">
        <DailyCheckIn metrics={["energy", "mood", "cravings", "cramps", "sleepQuality", "workout"]} cycleDay={day} accent={accent} />
      </div>

      {/* Her pattern */}
      <div style={tile}>
        <div className="flex items-center justify-between">
          <p style={cap}>Your pattern by phase</p>
          <span style={{ fontSize: 11.5, color: "var(--txt-muted)" }}>{report.loggedDays} days logged</span>
        </div>
        {report.tested.length === 0 ? (
          <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 8 }}>
            Check in for a few weeks and Glitch will test whether your energy, mood, cravings or strength really change by phase, for you.
          </p>
        ) : (
          <>
            <PatternGrid report={report} accent={accent} />
            {report.significant.length > 0 ? (
              <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {report.significant.slice(0, 5).map((f) => (
                  <li key={f.metric + f.phase} style={{ fontSize: 13, lineHeight: 1.45 }}>
                    {f.harder ? "↘︎" : "↗︎"} {describeFinding(f)} <span style={{ color: "var(--txt-muted)", fontSize: 11 }}>q={f.qValue.toFixed(3)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 10 }}>Tested {report.tested.length} comparisons: no clear phase effect yet. That's a real answer, not a gap.</p>
            )}
            <p style={{ fontSize: 11, color: "var(--txt-muted)", marginTop: 8, lineHeight: 1.45 }}>
              Highlighted cells passed a permutation test with false-discovery-rate control (q &lt; 0.10) and differ by ≥ 0.5 points. Patterns in your logs, not proof of cause.
            </p>
          </>
        )}
        {report.loggedDays < 20 && (
          <button onClick={loadDemoCheckIns} style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, border: "1.5px dashed var(--line)", background: "transparent", color: "var(--ink)", fontSize: 12.5, fontWeight: 700 }}>
            Load 12 weeks of demo check-ins <span style={{ color: "var(--txt-muted)", fontWeight: 500 }}>(synthetic)</span>
          </button>
        )}
      </div>

      <LifeStagePopulation highlight="cycling" />
      <ResearchGap />

      <motion.button onClick={() => onTalk()} whileTap={{ scale: 0.9 }} aria-label="Talk to Glitchy"
        animate={{ boxShadow: ["0 0 0 0 color-mix(in oklch, var(--accent) 55%, transparent)", "0 0 0 16px color-mix(in oklch, var(--accent) 0%, transparent)"] }} transition={{ repeat: Infinity, duration: 1.8 }}
        style={{ position: "fixed", bottom: "calc(84px + var(--safe-bottom))", right: 16, width: 66, height: 66, borderRadius: "50%", border: "none", background: "var(--accent)", color: "var(--on-accent)", zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Mic size={30} />
      </motion.button>
    </div>
  );
}

function PhaseRing({ day, len, color }: { day: number; len: number; color: string }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg width={84} height={84} viewBox="0 0 84 84" role="img" aria-label={`Cycle day ${day} of ${len}`}>
      <circle cx={42} cy={42} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={9} />
      <circle cx={42} cy={42} r={r} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${(day / len) * c} ${c}`} transform="rotate(-90 42 42)" />
      <text x={42} y={47} textAnchor="middle" fontSize={20} fontWeight={800} fill="var(--ink)" fontFamily={font}>{day}</text>
    </svg>
  );
}

/** Metric × phase grid of her average (1–5). Cells that passed the test are filled. */
function PatternGrid({ report, accent }: { report: ReturnType<typeof analyzePhasePatterns>; accent: string }) {
  const metrics = PHASE_METRICS.filter((m) => report.tested.some((t) => t.metric === m.key));
  return (
    <div role="table" aria-label="Average check-in score by phase" style={{ display: "grid", gridTemplateColumns: `minmax(0, 1.3fr) repeat(4, minmax(0, 1fr))`, gap: 4, marginTop: 10, fontSize: 12 }}>
      <span />
      {PHASES.map((p) => <span key={p} style={{ textAlign: "center", fontWeight: 700, color: "var(--txt-muted)" }}>{PHASE_EMOJI[p]}<br />{PHASE_SHORT[p]}</span>)}
      {metrics.map((m) => (
        <div key={m.key} role="row" style={{ display: "contents" }}>
          <span style={{ fontWeight: 700, alignSelf: "center" }}>{m.label}</span>
          {PHASES.map((p) => {
            const t = report.tested.find((x) => x.metric === m.key && x.phase === p);
            const sig = t?.significant;
            const bg = !sig ? "var(--surface-2)" : t!.harder ? "color-mix(in oklch, oklch(0.68 0.21 25) 30%, transparent)" : `color-mix(in oklch, ${accent} 32%, transparent)`;
            return (
              <span key={p} role="cell" title={t ? `${describeFinding(t)}; p=${t.pValue.toFixed(3)}, q=${t.qValue.toFixed(3)}` : "not enough days"}
                style={{ textAlign: "center", padding: "7px 0", borderRadius: 8, background: bg, fontWeight: sig ? 800 : 500, color: t ? "var(--ink)" : "var(--txt-muted)" }}>
                {t ? t.phaseMean.toFixed(1) : "–"}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Why this app exists: women's bodies have been under-studied. Each line links its verified source. */
export function ResearchGap() {
  const rows: { emoji: string; text: string; id: string }[] = [
    { emoji: "🧪", text: "Biomedical research has long studied mostly males: in neuroscience, male-only animal studies outnumbered female-only 5.5 to 1.", id: "women-underrepresented-trials" },
    { emoji: "💊", text: "Women have adverse drug reactions nearly twice as often as men, partly because many drugs reach higher blood levels in women.", id: "women-adverse-drug-reactions" },
    { emoji: "😴", text: "Women clear the sleep drug zolpidem (Ambien) more slowly, and in 2013 the FDA halved the recommended dose for women.", id: "zolpidem-sex-dose" },
    { emoji: "🔬", text: "The rete ovarii, a small structure attached to the ovary, was long dismissed as a leftover. New mouse research suggests it's active; humans haven't been studied yet.", id: "rete-ovarii-function" },
  ];
  return (
    <div style={tile}>
      <p style={cap}>Why Glitch learns from you</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {rows.map((r) => (
          <p key={r.id} style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)" }}>{r.emoji} {r.text} <EvidenceSource id={r.id} /></p>
        ))}
      </div>
    </div>
  );
}
