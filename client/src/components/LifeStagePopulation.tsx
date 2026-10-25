/**
 * Glitch — "What 4,163 US women show": NHANES 2013–2018 survey-weighted prevalence by life stage
 * (scripts/analyze_nhanes_lifestages.py → models/nhanesLifeStages.json). Dot = estimate, whisker =
 * design-based 95% CI, dashed line = cycling women (reference). The user's own stage is highlighted.
 * Point: population averages barely separate the stages, so Glitch learns each woman's own pattern.
 */
import { useState } from "react";
import data from "@/lib/models/nhanesLifeStages.json";

type StageKey = "cycling" | "pregnant" | "breastfeeding" | "post";
type Cell = { n: number; est?: number; lo?: number; hi?: number; suppressed: boolean };
type Adj = { suppressed: boolean; or?: number; orLo?: number; orHi?: number; q?: number; significant?: boolean };
type Outcome = { key: string; label: string; kind: string; crude: Record<StageKey, Cell>; adjusted: Partial<Record<StageKey, Adj>> };

const font = "'DM Sans', sans-serif";
const OUTCOMES = (data.outcomes as unknown as Outcome[]).filter((o) => o.kind === "binary");
const STAGES = data.stages as { key: StageKey; label: string }[];
const SHORT: Record<StageKey, string> = { cycling: "Cycling", pregnant: "Pregnant", breastfeeding: "Breastfeeding", post: "Post-menopause" };

export default function LifeStagePopulation({ highlight }: { highlight?: StageKey }) {
  const [key, setKey] = useState(OUTCOMES.find((o) => o.key === "short_sleep")?.key ?? OUTCOMES[0].key);
  const o = OUTCOMES.find((x) => x.key === key)!;
  const cells = STAGES.map((s) => ({ s, c: o.crude[s.key], a: o.adjusted[s.key] }));
  const max = Math.min(1, Math.max(0.2, ...cells.map(({ c }) => (c.suppressed ? 0 : c.hi ?? 0))) * 1.1);
  const x = (v: number) => `${(v / max) * 100}%`;
  const ref = o.crude.cycling;

  return (
    <div style={{ background: "var(--card-bg)", borderRadius: 22, padding: 16, marginTop: 14, fontFamily: font }}>
      <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: "var(--txt-muted)", textTransform: "uppercase" }}>What 4,163 US women show</p>
      <p style={{ fontSize: 12, color: "var(--txt-muted)", marginTop: 2 }}>CDC NHANES 2013–2018, women 20–59, survey-weighted</p>

      <div role="tablist" aria-label="Outcome" className="flex gap-1.5 flex-wrap" style={{ marginTop: 10 }}>
        {OUTCOMES.map((x) => (
          <button key={x.key} role="tab" aria-selected={x.key === key} onClick={() => setKey(x.key)}
            style={{ padding: "6px 11px", borderRadius: 999, border: x.key === key ? "1.5px solid var(--accent)" : "1.5px solid var(--line)", background: x.key === key ? "color-mix(in oklch, var(--accent) 14%, transparent)" : "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 700 }}>
            {x.label}
          </button>
        ))}
      </div>

      <div role="table" aria-label={`${o.label} by life stage`} style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {cells.map(({ s, c, a }) => {
          const mine = s.key === highlight;
          const tip = c.suppressed ? `${SHORT[s.key]}: too few women to report reliably (n=${c.n})`
            : `${SHORT[s.key]}: ${(c.est! * 100).toFixed(0)}% (95% CI ${(c.lo! * 100).toFixed(0)}–${(c.hi! * 100).toFixed(0)}%), n=${c.n}${a && !a.suppressed && a.or ? ` · adjusted OR vs cycling ${a.or.toFixed(2)} (${a.orLo!.toFixed(2)}–${a.orHi!.toFixed(2)}), q=${a.q?.toFixed(2) ?? "–"}` : ""}`;
          return (
            <div key={s.key} role="row" title={tip} style={{ display: "grid", gridTemplateColumns: "92px minmax(0, 1fr) 44px", alignItems: "center", gap: 8 }}>
              <span role="rowheader" style={{ fontSize: 12.5, fontWeight: mine ? 800 : 600, color: mine ? "var(--ink)" : "var(--ink-2)" }}>{SHORT[s.key]}{mine ? " · you" : ""}</span>
              <div role="cell" style={{ position: "relative", height: 22 }}>
                {!ref.suppressed && <span aria-hidden style={{ position: "absolute", left: x(ref.est!), top: 0, bottom: 0, borderLeft: "1.5px dashed var(--line)" }} />}
                {!c.suppressed && (
                  <>
                    <span aria-hidden style={{ position: "absolute", left: x(c.lo!), width: `calc(${x(c.hi!)} - ${x(c.lo!)})`, top: 10, height: 2, borderRadius: 2, background: mine ? "var(--accent)" : "var(--txt-muted)" }} />
                    <span aria-hidden style={{ position: "absolute", left: `calc(${x(c.est!)} - 6px)`, top: 5, width: 12, height: 12, borderRadius: "50%", background: mine ? "var(--accent)" : "var(--txt-muted)", boxShadow: "0 0 0 2px var(--card-bg)" }} />
                  </>
                )}
              </div>
              <span role="cell" style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", color: "var(--ink)" }}>{c.suppressed ? "n/a" : `${(c.est! * 100).toFixed(0)}%`}</span>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: "var(--txt-muted)", marginTop: 8 }}>Dot = estimate · line = 95% CI · dashed = cycling women. Tap or hover a row for adjusted odds ratios.</p>

      <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 10 }}>
        <b style={{ color: "var(--ink)" }}>What it means:</b> after adjusting for age and smoking and correcting for multiple comparisons, no stage clearly differed from cycling women on depression or sleep. The strongest hint: breastfeeding women report short sleep more often (OR 1.9, q = 0.06). Averages barely tell stages apart, let alone individual women, which is why Glitch learns your own pattern.
      </p>
      <p style={{ fontSize: 11, color: "var(--txt-muted)", marginTop: 6 }}>Cross-sectional, so associations only. Breastfeeding stands in for postpartum (NHANES has no postpartum flag).</p>
    </div>
  );
}
