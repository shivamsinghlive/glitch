/**
 * Glitch — the visual layer of "Model evidence".
 * Animated percentile bands, calibration curve, fairness bars, and a live night-sweat lab where
 * dragging the threshold re-scores simulated nights. Series colours are validated tokens (--viz-1/2);
 * outcomes are always shape + letter as well as colour.
 */
import { useEffect, useMemo, useState } from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import evidence from "@/lib/models/hotflashEvidence.json";
import detectors from "@/lib/models/detectorEvaluation.json";
import disparities from "@/lib/models/disparities.json";
import { simulateNights } from "@/lib/detectorEvaluation";
import { warmNights } from "@/lib/menopause";

const INK = "var(--ink)";
const MUTED = "var(--txt-muted)";
const font = "'DM Sans', sans-serif";
const V1 = "var(--viz-1)";
const V2 = "var(--viz-2)";

/** Number that counts up when it appears. */
export function CountUp({ to, decimals = 0, suffix = "", prefix = "" }: { to: number; decimals?: number; suffix?: string; prefix?: string }) {
  const mv = useMotionValue(0);
  const [text, setText] = useState(`${prefix}${(0).toFixed(decimals)}${suffix}`);
  useEffect(() => {
    const c = animate(mv, to, { duration: 1.1, ease: "easeOut", onUpdate: (v) => setText(`${prefix}${decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString()}${suffix}`) });
    return () => c.stop();
  }, [to, decimals, suffix, prefix, mv]);
  return <>{text}</>;
}

export function StatTile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div style={{ flex: 1, padding: "10px 6px", borderRadius: 14, background: "var(--surface-2)", textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: INK, fontFamily: font, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 10, color: MUTED, fontFamily: font, marginTop: 2, lineHeight: 1.25 }}>{label}</div>
    </div>
  );
}

/** One row: where `value` sits inside the US women's distribution (p5–p95 track, p25–p75 core, median tick). */
export function PercentileBand({ label, unit, value, table, percentile }: { label: string; unit: string; value: number; table: Record<string, number>; percentile: number }) {
  const lo = table["5"], hi = table["95"];
  const span = hi - lo || 1;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  return (
    <div style={{ marginTop: 12 }}>
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font }}>{label}</span>
        <span style={{ fontSize: 11.5, color: MUTED, fontFamily: font }}>you: <b style={{ color: INK }}>{value.toFixed(unit === "h" ? 1 : 0)} {unit}</b> · {percentile}th percentile</span>
      </div>
      <div style={{ position: "relative", height: 34, marginTop: 6 }} role="img" aria-label={`${label}: ${value} ${unit}, ${percentile}th percentile of US women your age`}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 14, height: 6, borderRadius: 3, background: "var(--line)" }} />
        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7 }} style={{ originX: 0, position: "absolute", left: `${pos(table["25"])}%`, width: `${pos(table["75"]) - pos(table["25"])}%`, top: 12, height: 10, borderRadius: 5, background: `color-mix(in oklab, ${V1} 30%, transparent)` }} />
        <div style={{ position: "absolute", left: `${pos(table["50"])}%`, top: 8, width: 2, height: 18, background: MUTED, opacity: 0.7 }} title={`median ${table["50"]}`} />
        <motion.div initial={{ left: "0%", opacity: 0 }} animate={{ left: `${pos(value)}%`, opacity: 1 }} transition={{ type: "spring", stiffness: 90, damping: 14, delay: 0.25 }}
          style={{ position: "absolute", top: 7, width: 20, height: 20, marginLeft: -10, borderRadius: "50%", background: V1, border: "3px solid var(--card-bg)", boxShadow: `0 0 0 2px ${V1}, 0 0 18px ${V1}` }} />
        <span style={{ position: "absolute", left: 0, top: 26, fontSize: 9.5, color: MUTED, fontFamily: font }}>{lo}</span>
        <span style={{ position: "absolute", left: `${pos(table["50"])}%`, top: 26, transform: "translateX(-50%)", fontSize: 9.5, color: MUTED, fontFamily: font }}>median {table["50"]}</span>
        <span style={{ position: "absolute", right: 0, top: 26, fontSize: 9.5, color: MUTED, fontFamily: font }}>{hi}</span>
      </div>
    </div>
  );
}

const tick = { fontSize: 10, fill: "var(--txt-muted)", fontFamily: font };

/** Predicted vs observed hot-flash rate by risk quintile; the dashed diagonal is perfect calibration. */
export function CalibrationChart() {
  const data = evidence.calibration.map((c) => ({ predicted: c.predicted, observed: c.observed }));
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font }}>Does "40% risk" really mean 40%?</p>
      <div style={{ height: 170, marginTop: 4 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 18, left: -8 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
            <XAxis type="number" dataKey="predicted" domain={[0, 0.7]} ticks={[0, 0.2, 0.4, 0.6]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={tick} axisLine={false} tickLine={false} label={{ value: "model said", position: "insideBottom", offset: -10, style: tick }} />
            <YAxis type="number" domain={[0, 0.7]} ticks={[0, 0.2, 0.4, 0.6]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={tick} axisLine={false} tickLine={false} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 0.7, y: 0.7 }]} stroke="var(--txt-muted)" strokeDasharray="4 4" ifOverflow="hidden" />
            <Tooltip formatter={(v: number, n: string) => [`${Math.round(v * 100)}%`, n === "observed" ? "actually had hot flashes" : n]} labelFormatter={(l: number) => `Model said ${Math.round(l * 100)}%`} />
            <Line type="monotone" dataKey="observed" stroke={V1} strokeWidth={2.5} dot={{ r: 5, fill: V1, stroke: "var(--card-bg)", strokeWidth: 2 }} activeDot={{ r: 7 }} isAnimationActive animationDuration={1200} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font }}>Points on the dashed line mean perfectly honest probabilities. Five groups of 75 women each.</p>
    </div>
  );
}

/** Subgroup AUC bars against the 0.5 coin-flip line. Single hue; the label carries identity. */
export function FairnessBars() {
  const rows = evidence.fairness.groups.filter((g) => g.auc != null);
  const scale = (a: number) => Math.max(0, (a - 0.5) / 0.3) * 100; // 0.5 → 0, 0.8 → 100
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font }}>Does it rank women equally well?</p>
      <div style={{ position: "relative", marginTop: 6 }}>
        {rows.map((g, i) => (
          <div key={g.group} className="flex items-center gap-2" style={{ margin: "5px 0" }}>
            <span style={{ width: 118, fontSize: 10.5, color: INK, fontFamily: font, lineHeight: 1.2 }}>{g.group}<span style={{ color: MUTED }}> · n={g.n}</span></span>
            <div style={{ flex: 1, height: 14, position: "relative" }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${scale(g.auc!)}%` }} transition={{ duration: 0.8, delay: 0.1 * i }}
                style={{ height: 14, borderRadius: "0 4px 4px 0", background: V1, opacity: g.n < 100 ? 0.45 : 1 }} />
            </div>
            <b style={{ width: 34, fontSize: 11.5, color: INK, fontFamily: font, textAlign: "right" }}>{g.auc}</b>
          </div>
        ))}
        <div style={{ position: "absolute", left: 126, top: 0, bottom: 0, width: 1, background: MUTED, opacity: 0.6 }} />
      </div>
      <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font }}>AUC measures ranking. Bars start at 0.5 (coin flip). Pale bar = fewer than 100 women: a hint, not a verdict.</p>
      <details style={{ marginTop: 6 }}>
        <summary style={{ fontSize: 10.5, color: MUTED, fontFamily: font, cursor: "pointer" }}>Show as a table</summary>
        <table style={{ width: "100%", fontSize: 10.5, color: INK, fontFamily: font, marginTop: 4 }}>
          <thead><tr style={{ color: MUTED, textAlign: "left" }}><th>Group</th><th>n</th><th>AUC</th><th>Predicted</th><th>Observed</th></tr></thead>
          <tbody>{evidence.fairness.groups.map((g) => <tr key={g.group}><td>{g.group}</td><td>{g.n}</td><td>{g.auc ?? "—"}</td><td>{Math.round(g.meanPredicted * 100)}%</td><td>{Math.round(g.observedRate * 100)}%</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

/** Live lab: drag the temperature threshold and watch the simulated nights re-score. */
export function NightSweatLab() {
  const sweep = detectors.nightSweat.sweep;
  const [idx, setIdx] = useState(sweep.findIndex((s) => s.threshold === detectors.nightSweat.operating.threshold));
  const sim = useMemo(() => simulateNights(1, 56, 21), []);
  const row = sweep[idx];
  const threshold = row.threshold;

  const cells = useMemo(() => {
    const flags = new Map(warmNights(sim.days, { tempThreshold: threshold }).map((w) => [w.date, w.likely]));
    return sim.days.flatMap((d, i) => {
      if (!flags.has(d.date)) return [];
      const flagged = flags.get(d.date)!, real = sim.truth[i];
      const kind = flagged && real ? "hit" : flagged ? "false" : real ? "miss" : "quiet";
      return [{ id: d.date, kind }];
    });
  }, [sim, threshold]);
  const count = (k: string) => cells.filter((c) => c.kind === k).length;

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font }}>Night-sweat lab</p>
      <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font, marginTop: 2 }}>Drag the slider: how warm (above your own baseline) must a night be to count?</p>
      <label className="flex items-center gap-2" style={{ marginTop: 8 }}>
        <input type="range" min={0} max={sweep.length - 1} step={1} value={idx} onChange={(e) => setIdx(Number(e.target.value))} aria-label="Temperature threshold" style={{ flex: 1, accentColor: "var(--viz-2)" }} />
        <b style={{ width: 52, fontSize: 12, color: INK, fontFamily: font }}>+{threshold.toFixed(2)} °C</b>
      </label>

      <div className="flex gap-2" style={{ marginTop: 8 }}>
        <StatTile value={<>{Math.round(row.precision * 100)}%</>} label="flagged nights that were real" />
        <StatTile value={<>{Math.round(row.recall * 100)}%</>} label="real sweats caught" />
        <StatTile value={<>{(row.falseAlarmRate * 100).toFixed(1)}%</>} label="normal nights falsely flagged" />
      </div>

      <div style={{ height: 150, marginTop: 10 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sweep} margin={{ top: 14, right: 10, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="threshold" type="number" domain={[0.15, 0.6]} ticks={[0.2, 0.3, 0.4, 0.5, 0.6]} tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => `+${v}`} />
            <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={tick} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => `${Math.round(v * 100)}%`} labelFormatter={(l: number) => `Threshold +${l} °C`} />
            <ReferenceLine x={row.threshold} stroke="var(--ink)" strokeOpacity={0.5} />
            <Legend verticalAlign="top" height={20} iconType="plainline" wrapperStyle={{ fontSize: 10.5, fontFamily: font, color: "var(--txt-muted)" }} />
            <Line name="Precision (when it flags, it's right)" dataKey="precision" stroke={V1} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 6 }} />
            <Line name="Recall (sweats caught)" dataKey="recall" stroke={V2} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p style={{ fontSize: 11, fontWeight: 700, color: INK, fontFamily: font, marginTop: 8 }}>One simulated woman, {cells.length} nights</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 3, marginTop: 4 }} role="img" aria-label={`${count("hit")} sweats caught, ${count("miss")} missed, ${count("false")} false alarms`}>
        {cells.map((c, i) => (
          <motion.div key={c.id} layout initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i * 0.012, 0.5), type: "spring", stiffness: 260, damping: 18 }}
            title={{ hit: "Real sweat, caught", miss: "Real sweat, missed", false: "False alarm", quiet: "Normal night" }[c.kind]}
            style={{
              aspectRatio: "1", borderRadius: 5, display: "grid", placeItems: "center", fontSize: 9, fontWeight: 800, fontFamily: font,
              background: c.kind === "hit" ? V2 : c.kind === "false" ? "var(--txt-muted)" : "var(--line)",
              border: c.kind === "miss" ? `1.5px dashed ${V2}` : "1.5px solid transparent",
              color: c.kind === "hit" ? "#fff" : c.kind === "false" ? "var(--card-bg)" : V2,
              boxShadow: c.kind === "hit" ? `0 0 10px color-mix(in oklab, ${V2} 60%, transparent)` : "none",
            }}>
            {{ hit: "✓", miss: "✕", false: "!", quiet: "" }[c.kind]}
          </motion.div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1" style={{ marginTop: 6, fontSize: 10.5, color: MUTED, fontFamily: font }}>
        <span>✓ caught {count("hit")}</span><span>✕ missed {count("miss")}</span><span>! false alarm {count("false")}</span><span>blank = normal night</span>
      </div>
    </div>
  );
}

/** The harder fairness question: at one fixed cutoff, do the errors fall evenly? Honest answer: no. */
export function ErrorRateTable() {
  const f = evidence.fairness;
  const rows = f.groups;
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font }}>But at one cutoff, errors are not equal</p>
      <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font, marginTop: 2 }}>Cutoff: flag if predicted risk is above the study average ({pctOf(f.decisionThreshold)}).</p>
      <div style={{ overflowX: "auto", marginTop: 6 }}>
        <table style={{ width: "100%", minWidth: 300, fontSize: 11, color: INK, fontFamily: font, borderCollapse: "collapse" }}>
          <thead><tr style={{ color: MUTED, textAlign: "left" }}><th scope="col">Group</th><th scope="col">Flagged</th><th scope="col">Real cases caught</th><th scope="col">False alarms</th></tr></thead>
          <tbody>{rows.map((g) => (
            <tr key={g.group} style={{ borderTop: "1px solid var(--line)" }}>
              <td style={{ padding: "4px 0" }}>{g.group}</td><td>{pctOf(g.flagRate)}</td><td>{g.tpr != null ? pctOf(g.tpr) : "—"}</td><td>{g.fpr != null ? pctOf(g.fpr) : "—"}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: INK, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}>
        Women in the African American group had hot flashes more often in this study ({pctOf(rows[1].observedRate)} vs {pctOf(rows[0].observedRate)}), so a fair-looking model still flags them more, and also raises more false alarms (a {Math.round(f.aucGapMax.raceFpr * 100)}-point gap). When base rates differ, ranking, calibration and error rates cannot all be equal. We chose well-calibrated probabilities, and we never use the flag to gate care, deny anything or label anyone.
      </p>
    </div>
  );
}
const pctOf = (x: number) => `${Math.round(x * 100)}%`;

/** Would the night-sweat detector survive a sensor that reads wrong, or is noisier, for some users? */
export function SensorStress() {
  const rows = detectors.sensorRobustness;
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font }}>If the sensor is worse for some users</p>
      <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font, marginTop: 2 }}>Skin-temperature accuracy across skin tones is untested, so we simulated it.</p>
      <div style={{ marginTop: 6 }}>
        {rows.map((r, i) => (
          <div key={r.scenario} className="flex items-center gap-2" style={{ margin: "4px 0" }}>
            <span style={{ width: 128, fontSize: 10.5, color: INK, fontFamily: font }}>{r.scenario}</span>
            <div style={{ flex: 1, height: 12 }}>
              <motion.div initial={{ width: 0 }} whileInView={{ width: `${r.precision * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.06 }} style={{ height: 12, borderRadius: "0 4px 4px 0", background: V1 }} />
            </div>
            <b style={{ width: 34, fontSize: 11, color: INK, fontFamily: font, textAlign: "right" }}>{pctOf(r.precision)}</b>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font, marginTop: 4 }}>Bars show how often a flagged night is a real sweat. A constant offset changes nothing, because each woman is compared with her own baseline. Extra noise does hurt: 3× noise cuts it to {pctOf(rows[rows.length - 1].precision)}.</p>
    </div>
  );
}

/** Who does this affect? Group differences, measured with race and ethnicity (never used to score a person). */
export function DisparityPanel() {
  const t = disparities.tshs, n = disparities.nhanes.groups;
  const maxBp = Math.max(...n.map((g) => g.highBp + g.highBpCi), 0.7);
  const or = t.oddsRatioAfricanAmerican;
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font }}>We measure by race and ethnicity, so differences can't hide</p>
      <p style={{ fontSize: 11, color: MUTED, fontFamily: font, marginTop: 2, lineHeight: 1.45 }}>We never score a person by race. We use it to find who is affected most. Groups stand in for income, access to care, stress and discrimination, not biology.</p>

      <p style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font, marginTop: 12 }}>Blood pressure at or above 130/80, women 35–79</p>
      <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font }}>NHANES 2017–18, age-standardised so groups are comparable.</p>
      <div style={{ marginTop: 6 }}>
        {[...n].sort((a, b) => b.highBp - a.highBp).map((g, i) => (
          <div key={g.group} className="flex items-center gap-2" style={{ margin: "5px 0" }}>
            <span style={{ width: 128, fontSize: 10.5, color: INK, fontFamily: font, lineHeight: 1.2 }}>{g.group}<span style={{ color: MUTED }}> · n={g.nBp}</span></span>
            <div style={{ flex: 1, height: 13 }}>
              <motion.div initial={{ width: 0 }} whileInView={{ width: `${(g.highBp / maxBp) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.06 }}
                style={{ height: 13, borderRadius: "0 4px 4px 0", background: V1, opacity: g.smallSample ? 0.4 : 1 }} />
            </div>
            <b style={{ width: 66, fontSize: 11, color: INK, fontFamily: font, textAlign: "right" }}>{Math.round(g.highBp * 100)}% ±{Math.round(g.highBpCi * 100)}</b>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: INK, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}>
        Sleeping under 6 hours: {n.filter((g) => !g.smallSample).sort((a, b) => b.shortSleep - a.shortSleep).slice(0, 2).map((g) => `${g.group} ${Math.round(g.shortSleep * 100)}%`).join(", ")} vs {(() => { const w = n.find((g) => g.group.startsWith("White"))!; return `${w.group} ${Math.round(w.shortSleep * 100)}%`; })()}. Pale bar = fewer than 100 women.
      </p>

      <p style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font, marginTop: 12 }}>Hot flashes in the TSHS study (n={t.n})</p>
      <p style={{ fontSize: 11.5, color: INK, fontFamily: font, marginTop: 3, lineHeight: 1.5 }}>
        {t.groups[0].group}: {Math.round(t.groups[0].prevalence * 100)}% reported hot flashes ({Math.round(t.groups[0].ci[0] * 100)}–{Math.round(t.groups[0].ci[1] * 100)}%), vs {Math.round(t.groups[1].prevalence * 100)}% ({Math.round(t.groups[1].ci[0] * 100)}–{Math.round(t.groups[1].ci[1] * 100)}%) for everyone else. Odds ratio <b>{or.crude.or}</b> ({or.crude.ci[0]}–{or.crude.ci[1]}).
        After accounting for {t.adjustedFor.join(", ")}, it falls to <b>{or.adjusted.or}</b> ({or.adjusted.ci[0]}–{or.adjusted.ci[1]}), which is not statistically significant.
      </p>
      <p style={{ fontSize: 11, color: MUTED, fontFamily: font, marginTop: 4, lineHeight: 1.45 }}>
        What this means: the gap is mostly carried by earlier symptoms, weight and smoking, which is why the risk model works without race. Those factors can themselves reflect unequal conditions, so we report the gap instead of explaining it away.
      </p>
      <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font, marginTop: 6, lineHeight: 1.45 }}>
        Not studied: regions. Neither dataset records where people live. Intervals for NHANES are approximate.
      </p>
    </div>
  );
}

// ── Scores and error analysis ────────────────────────────────

interface Conf { tp: number; fp: number; fn: number; tn: number }
interface Scores { accuracy: number; precision: number; recall: number; specificity: number; f1: number; mcc: number }

function ConfusionGrid({ c, yes, no }: { c: Conf; yes: string; no: string }) {
  const cell = (n: number, label: string, good: boolean) => (
    <td style={{ padding: "8px 6px", borderRadius: 10, background: good ? "color-mix(in oklab, var(--viz-1) 18%, var(--card-bg))" : "color-mix(in oklab, var(--viz-2) 20%, var(--card-bg))", textAlign: "center", verticalAlign: "middle" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: INK, fontFamily: font }}>{n.toLocaleString()}</div>
      <div style={{ fontSize: 10, color: INK, fontFamily: font, lineHeight: 1.25 }}>{label}</div>
    </td>
  );
  const head = { fontSize: 10, color: MUTED, fontFamily: font, fontWeight: 600, textAlign: "center" as const };
  return (
    <table aria-label="Confusion matrix: what it said against what was true" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 4, marginTop: 6 }}>
      <thead><tr><td style={{ width: 54 }} /><th scope="col" style={head}>Really {yes}</th><th scope="col" style={head}>Really {no}</th></tr></thead>
      <tbody>
        <tr><th scope="row" style={{ ...head, textAlign: "left" }}>Said {yes}</th>{cell(c.tp, "hit (true positive)", true)}{cell(c.fp, "false alarm (false positive)", false)}</tr>
        <tr><th scope="row" style={{ ...head, textAlign: "left" }}>Said {no}</th>{cell(c.fn, "miss (false negative)", false)}{cell(c.tn, "correctly quiet (true negative)", true)}</tr>
      </tbody>
    </table>
  );
}

function Pill({ k, v }: { k: string; v: string }) {
  return <span style={{ padding: "3px 8px", borderRadius: 999, background: "var(--card-bg)", fontSize: 10.5, color: INK, fontFamily: font }}><span style={{ color: MUTED }}>{k} </span><b>{v}</b></span>;
}

function ScoreCard({ title, tag, tagColor, conf, scores, yes, no, baseline, errors }: { title: string; tag: string; tagColor: string; conf: Conf; scores: Scores; yes: string; no: string; baseline: string; errors: string[] }) {
  return (
    <section style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
      <div className="flex items-center justify-between gap-2">
        <h3 style={{ fontSize: 12.5, fontWeight: 700, color: INK, fontFamily: font }}>{title}</h3>
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "var(--card-bg)", color: tagColor, fontFamily: font, whiteSpace: "nowrap" }}>{tag}</span>
      </div>
      <ConfusionGrid c={conf} yes={yes} no={no} />
      <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
        <Pill k="Accuracy" v={pc(scores.accuracy)} /><Pill k="Precision" v={pc(scores.precision)} /><Pill k="Recall" v={pc(scores.recall)} /><Pill k="F1" v={scores.f1.toFixed(2)} /><Pill k="MCC" v={scores.mcc.toFixed(2)} />
      </div>
      <p style={{ fontSize: 11, color: INK, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}><b>Against a dumb baseline:</b> {baseline}</p>
      <p style={{ fontSize: 11, fontWeight: 700, color: INK, fontFamily: font, marginTop: 6 }}>Where it goes wrong</p>
      <ul style={{ margin: "2px 0 0", paddingLeft: 16, fontSize: 11, color: INK, fontFamily: font, lineHeight: 1.5 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
    </section>
  );
}
const pc = (x: number) => `${Math.round(x * 100)}%`;

export function ScoresPanel() {
  const hf = evidence.classification, hm = hf.model, hb = hf.baselines;
  const ea = evidence.errorAnalysis;
  const sc = detectors.scorecards, ns = sc.nightSweat, ov = sc.ovulation, tr = sc.triggers, rt = sc.retrieval, pl = sc.planner;
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font }}>How to read these scores</p>
      <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11, color: INK, fontFamily: font, lineHeight: 1.55 }}>
        <li><b>False alarm (false positive):</b> it said yes, but the answer was no. Causes worry for nothing.</li>
        <li><b>Miss (false negative):</b> it said no, but the answer was yes. Can falsely reassure.</li>
        <li><b>Precision:</b> when it says yes, how often is it right. <b>Recall:</b> of the real yeses, how many it catches.</li>
        <li><b>F1:</b> one number balancing both. <b>MCC:</b> 0 means no better than chance, 1 is perfect.</li>
        <li><b>Accuracy can mislead:</b> if only 1 in 4 nights is a sweat, always saying "no" is 75% accurate and useless. So we compare with a dumb baseline.</li>
      </ul>

      <ScoreCard title="Hot-flash risk model" tag="REAL · TSHS · n=375" tagColor="var(--viz-1)" yes="flag" no="no flag"
        conf={hm} scores={hm}
        baseline={`always saying "no" gets ${pc(hb.alwaysNo.accuracy)} accuracy but catches no one (F1 0, MCC 0). Our model: F1 ${hm.f1}, MCC ${hm.mcc}. The single question "have you had symptoms before?" scores almost the same (AUC ${hb.priorSymptomsOnly.auc} vs ${hm.auc}).`}
        errors={[
          `Most of the model's signal comes from one question: earlier symptoms. Every miss (${ea.missed.n}) is a woman with no earlier symptoms; every false alarm (${ea.falseAlarms.n}) is a woman with earlier symptoms.`,
          `Smoking and BMI add little (BMI 30+ in ${Math.round(ea.falseAlarms.bmi30 * 100)}% of false alarms vs ${Math.round(ea.correctNegatives.bmi30 * 100)}% of correct negatives).`,
          `Treat the number as a rough gauge. Cross-validated, small cohort of 375 women from 2001.`,
        ]} />

      <ScoreCard title="Night-sweat detector" tag="SIMULATED · 6,780 nights" tagColor="var(--viz-2)" yes="sweat" no="normal"
        conf={ns.combined} scores={ns.combined}
        baseline={`always "normal" is ${pc(ns.alwaysNo.accuracy)} accurate but finds nothing. Warm skin alone: F1 ${ns.tempOnly.f1}, ${pc(ns.tempOnly.falseAlarmRate)} false alarms. Broken sleep alone: F1 ${ns.disruptionOnly.f1}, ${pc(ns.disruptionOnly.falseAlarmRate)} false alarms. Both together: F1 ${ns.combined.f1}, ${pc(ns.combined.falseAlarmRate)} false alarms.`}
        errors={[
          `${pc(ns.misses.tempRiseTooSmall)} of the ${ns.misses.n} misses were real sweats where skin temperature barely rose, so the detector never saw them.`,
          `${pc(ns.falseAlarms.warmButNotSweat)} of the ${ns.falseAlarms.n} false alarms were warm nights that weren't sweats (alcohol, illness, a hot room). Temperature can't tell them apart.`,
          `We chose few false alarms over catching everything. Broken sleep alone catches more (recall ${pc(ns.disruptionOnly.recall)}) but cries wolf ${pc(ns.disruptionOnly.falseAlarmRate)} of the time.`,
        ]} />

      <ScoreCard title="Ovulation detector" tag="SIMULATED · 1,000 cycles" tagColor="var(--viz-2)" yes="ovulated" no="no ovulation"
        conf={ov.detection} scores={ov.detection}
        baseline={`always saying "ovulated" gets F1 ${ov.alwaysDetect.f1} only because ${pc(1 - ov.anovulatoryShare)} of cycles ovulate. It rejects 0% of non-ovulatory cycles (MCC 0). Ours rejects ${pc(ov.detection.specificity)} (MCC ${ov.detection.mcc}).`}
        errors={[
          `Misses depend on the size of the temperature rise: ${pc(ov.missByRise[0].missRate)} missed when the rise is under 0.3 °C, ${pc(ov.missByRise[1].missRate)} at 0.3–0.4 °C, ${pc(ov.missByRise[2].missRate)} at 0.4 °C or more.`,
          `When it detects ovulation, it is off by ${ov.timing.meanErrorDays} days on average, and tends to say ${ov.timing.biasDays > 0 ? "late" : "early"} by ${Math.abs(ov.timing.biasDays)} days. Within 2 days ${pc(ov.timing.within2)}.`,
          `${ov.falsePositives} cycles with no ovulation were wrongly "confirmed".`,
        ]} />

      <section style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between gap-2"><h3 style={{ fontSize: 12.5, fontWeight: 700, color: INK, fontFamily: font }}>Trigger finder</h3><span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "var(--card-bg)", color: "var(--viz-2)", fontFamily: font }}>SIMULATED · {tr.simulations} users</span></div>
        <p style={{ fontSize: 11, color: INK, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}>If a user has <b>no real trigger</b>, a simple "{">"}1.5× more flashes" rule still reports a false trigger for <b>{pc(tr.falseTriggerRate.naive)}</b> of users. With our permutation test and multiple-comparison correction that falls to <b>{pc(tr.falseTriggerRate.corrected)}</b>.</p>
        <p style={{ fontSize: 11, color: INK, fontFamily: font, marginTop: 4, lineHeight: 1.5 }}>The price is caution. Real triggers found: {tr.power.map((p) => `${p.effect} ${pc(p.corrected)} (simple rule ${pc(p.naive)})`).join("; ")}. A mild trigger (1.5×) is often missed in 60 days.</p>
      </section>

      <section style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between gap-2"><h3 style={{ fontSize: 12.5, fontWeight: 700, color: INK, fontFamily: font }}>Evidence retrieval (RAG)</h3><span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "var(--card-bg)", color: MUTED, fontFamily: font }}>{rt.questions} hand-labelled questions</span></div>
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
          <Pill k="Right passage first" v={pc(rt.hitAt1)} /><Pill k="In top 3" v={pc(rt.hitAt3)} /><Pill k="Precision@3" v={pc(rt.precisionAt3)} /><Pill k="Recall@3" v={pc(rt.recallAt3)} /><Pill k="MRR" v={rt.mrr.toFixed(2)} />
        </div>
        <p style={{ fontSize: 11, color: INK, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}><b>Against picking 3 at random:</b> top-3 hit rate {pc(rt.randomBaseline.hitAt3)}, precision {pc(rt.randomBaseline.precisionAt3)}. Small talk gets no evidence attached ({rt.offTopic.correctlyEmpty} of {rt.offTopic.messages} correct).</p>
        <p style={{ fontSize: 11, color: MUTED, fontFamily: font, marginTop: 4, lineHeight: 1.5 }}>Honest limit: the questions were written by us, and we fixed one vocabulary gap after seeing it, so treat this as a sanity check, not a benchmark. Retrieval finds relevant text; it does not check that the text is applied correctly to a person.</p>
      </section>

      <section style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between gap-2"><h3 style={{ fontSize: 12.5, fontWeight: 700, color: INK, fontFamily: font }}>Plan builder</h3><span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "var(--card-bg)", color: MUTED, fontFamily: font }}>{pl.plans.toLocaleString()} random choices tested</span></div>
        <p style={{ fontSize: 11, color: INK, fontFamily: font, marginTop: 6, lineHeight: 1.5 }}>Asked for equipment you don't have: <b>{pl.equipmentViolations}</b>. Training days left empty: <b>{pl.emptyDays}</b>. Bone-health plans with 2–3 strength days: <b>{pl.boneStrengthRule.satisfied} of {pl.boneStrengthRule.plans}</b>. Exercises with a citation: <b>{pc(pl.citedShare)}</b>. Plans that include something from a style you chose: <b>{pc(pl.plansWithStyleMatch)}</b> ({pc(pl.styleMatchShare)} of all exercises, because goals sometimes need strength you didn't pick).</p>
      </section>
    </div>
  );
}
