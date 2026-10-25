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
      <p style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font }}>Same accuracy for every group?</p>
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
      <p style={{ fontSize: 10.5, color: MUTED, fontFamily: font }}>Bars start at 0.5 (coin flip). Pale bar = fewer than 100 women, so treat it as a hint, not a verdict.</p>
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
