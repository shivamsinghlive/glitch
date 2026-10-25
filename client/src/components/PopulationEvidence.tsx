/**
 * Glitch — what NHANES says about menopause and health in US women 40–59.
 * Aggregates come from scripts/analyze_nhanes_menopause.py (models/nhanesMenopause.json); no individual data.
 * Card: forest plot of age/BMI/smoking-adjusted differences (post vs pre, percentage points, 95% CI).
 * Sheet: full results, sensitivity checks, results by race/ethnicity, missing data, limitations and ethics.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import data from "@/lib/models/nhanesMenopause.json";
import validation from "@/lib/models/nhanesValidation.json";

const CARD = "var(--card-bg)";
const LINE = "var(--line)";
const TXT = "var(--ink)";
const MUT = "var(--txt-muted)";
const ACC = "var(--accent)";
const font = "'DM Sans', sans-serif";
const cap: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, letterSpacing: 0.8, color: MUT, textTransform: "uppercase" };

type Est = { n: number; nPre: number; nPost: number; suppressed: boolean; or?: number; orLo?: number; orHi?: number; diff?: number; diffLo?: number; diffHi?: number; adjPre?: number; adjPost?: number; p?: number; q?: number };
type Outcome = {
  key: string; label: string; kind: "binary" | "continuous"; definition: string; significant: boolean;
  crude: Record<"pre" | "post", { est: number; lo: number; hi: number }>;
  adjusted: Est; sensitivity: Record<"unadjusted" | "plusSocial" | "age45to55" | "noHormoneTherapy", Est | null>;
  byRace: Record<string, Est | null>; raceInteractionP: number | null;
};
const D = data as unknown as Omit<typeof data, "outcomes"> & { outcomes: Outcome[] };
const outcomes = D.outcomes;
const binary = outcomes.filter((o) => o.kind === "binary" && !o.adjusted.suppressed);
const pp = (x: number) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}`;
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const orTxt = (e: Est | null) => (!e || e.suppressed ? "—" : e.or != null ? `${e.or.toFixed(2)} (${e.orLo!.toFixed(2)}–${e.orHi!.toFixed(2)})` : `${e.diff!.toFixed(3)} (${e.diffLo!.toFixed(3)} to ${e.diffHi!.toFixed(3)})`);

export default function PopulationEvidence() {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  // "raw" vs "same age": the raw gap mixes in ageing; adjusting shows what's linked to menopause itself
  const [raw, setRaw] = useState(false);
  const est = (o: Outcome) => (raw ? o.sensitivity.unadjusted! : o.adjusted);
  const clear = (o: Outcome) => (raw ? est(o).diffLo! > 0 || est(o).diffHi! < 0 : o.significant);
  const bmd = outcomes.find((o) => o.key === "fn_bmd");
  // One fixed scale for both views so the dots visibly move when toggled
  const lo = Math.min(-0.1, ...binary.flatMap((o) => [o.adjusted.diffLo!, o.sensitivity.unadjusted!.diffLo!]));
  const hi = Math.max(0.1, ...binary.flatMap((o) => [o.adjusted.diffHi!, o.sensitivity.unadjusted!.diffHi!]));
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const shown = hover ? binary.find((o) => o.key === hover) : null;
  const bp = binary.find((o) => o.key === "hypertension");

  return (
    <div style={{ background: CARD, borderRadius: 22, padding: 16, marginTop: 10 }}>
      <div className="flex items-center justify-between">
        <span style={cap}>What {D.flow.analysed.toLocaleString()} US women show</span>
        <button onClick={() => setOpen(true)} style={{ border: "none", background: "transparent", color: MUT, fontSize: 11.5, textDecoration: "underline" }}>How we know</button>
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: 8, gap: 8 }}>
        <p style={{ fontSize: 12.5, color: MUT, lineHeight: 1.4 }}>After vs before menopause, {raw ? "raw" : "same age, BMI, smoking"}. Points difference, 95% CI.</p>
        <div className="flex" role="tablist" style={{ flexShrink: 0, background: "var(--surface-2)", borderRadius: 999, padding: 3 }}>
          {([["Raw", true], ["Same age", false]] as const).map(([t, v]) => (
            <button key={t} role="tab" aria-selected={raw === v} onClick={() => setRaw(v)}
              style={{ border: "none", borderRadius: 999, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, fontFamily: font, background: raw === v ? ACC : "transparent", color: raw === v ? "var(--on-accent)" : MUT }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Forest plot: one row per outcome; filled dot = holds after correcting for multiple tests */}
      <div style={{ position: "relative", marginTop: 12 }} role="img" aria-label="Adjusted differences after menopause with 95% confidence intervals">
        <div style={{ position: "absolute", left: `calc(40% + ${x(0) * 0.6}%)`, top: 0, bottom: 18, width: 1, background: MUT, opacity: 0.6 }} />
        {binary.map((o) => {
          const a = est(o);
          const strong = clear(o);
          return (
            <button key={o.key} onMouseEnter={() => setHover(o.key)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === o.key ? null : o.key)}
              className="flex items-center" style={{ width: "100%", height: 30, border: "none", background: hover === o.key ? "var(--surface-2)" : "transparent", borderRadius: 8, padding: 0, color: TXT, fontFamily: font }}>
              <span style={{ width: "40%", fontSize: 12.5, fontWeight: 700, textAlign: "left", paddingLeft: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
              <span style={{ position: "relative", width: "60%", height: "100%" }}>
                <span style={{ position: "absolute", top: "50%", height: 2, marginTop: -1, borderRadius: 2, left: `${x(a.diffLo!)}%`, width: `${x(a.diffHi!) - x(a.diffLo!)}%`, background: strong ? ACC : MUT, transition: "left .6s, width .6s" }} />
                <span style={{ position: "absolute", top: "50%", width: 10, height: 10, marginTop: -5, marginLeft: -5, left: `${x(a.diff!)}%`, borderRadius: "50%", background: strong ? ACC : CARD, border: `2px solid ${strong ? CARD : MUT}`, boxShadow: strong ? `0 0 0 2px ${ACC}` : "none", transition: "left .6s" }} />
              </span>
            </button>
          );
        })}
        <div className="flex" style={{ fontSize: 10, color: MUT, marginTop: 2 }}>
          <span style={{ width: "40%" }} />
          <span style={{ position: "relative", width: "60%", height: 14 }}>
            <span style={{ position: "absolute", left: 0 }}>{pp(lo)}</span>
            <span style={{ position: "absolute", left: `${x(0)}%`, transform: "translateX(-50%)" }}>0</span>
            <span style={{ position: "absolute", right: 0 }}>{pp(hi)} pts</span>
          </span>
        </div>
      </div>

      <p style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5, minHeight: 40 }}>
        {shown
          ? <><b>{shown.label}</b>: {pct(est(shown).adjPre!)} → {pct(est(shown).adjPost!)} ({pp(est(shown).diff!)} pts, CI {pp(est(shown).diffLo!)} to {pp(est(shown).diffHi!)}). {clear(shown) ? "Clear difference." : "Not clear: the interval includes no difference."} <span style={{ color: MUT }}>{shown.definition}.</span></>
          : raw && bp
            ? <>Raw, high blood pressure looks <b>{pp(bp.sensitivity.unadjusted!.diff!)} points</b> higher after menopause. Tap <b>Same age</b>: most of that gap is ageing, not menopause. Comparing like with like matters.</>
          : bmd && !bmd.adjusted.suppressed
            ? <>Bone density at the hip is <b>{Math.abs(bmd.adjusted.diff!).toFixed(3)} g/cm² lower</b> after menopause (CI {Math.abs(bmd.adjusted.diffHi!).toFixed(3)}–{Math.abs(bmd.adjusted.diffLo!).toFixed(3)}){bmd.significant ? ", the clearest signal in the data" : ""}. That's why Glitch puts strength and impact training first.</>
            : <>Tap a row for details.</>}
      </p>
      <div className="flex items-center gap-3" style={{ fontSize: 10.5, color: MUT, marginTop: 6 }}>
        <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: "50%", background: ACC }} /> {raw ? "CI excludes 0" : "clear after FDR correction"}</span>
        <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: "50%", border: `2px solid ${MUT}` }} /> not clear</span>
      </div>
      <p style={{ fontSize: 10, color: MUT, marginTop: 6 }}>NHANES 2013–2018 · CDC/NCHS · survey-weighted · association, not cause</p>

      <AnimatePresence>{open && <MethodsSheet onClose={() => setOpen(false)} />}</AnimatePresence>
    </div>
  );
}

function MethodsSheet({ onClose }: { onClose: () => void }) {
  const races = Object.keys(outcomes[0].byRace);
  const th: React.CSSProperties = { padding: "6px 4px", fontSize: 10.5, fontWeight: 800, color: MUT, textAlign: "left", borderBottom: `1px solid ${LINE}` };
  const td: React.CSSProperties = { padding: "6px 4px", fontSize: 11.5, borderBottom: `1px solid ${LINE}`, verticalAlign: "top" };
  const h: React.CSSProperties = { fontSize: 14, fontWeight: 800, marginTop: 18 };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <motion.div initial={{ y: 40 }} animate={{ y: 0 }}
        style={{ width: "100%", maxHeight: "92%", overflowY: "auto", background: "var(--app-bg)", color: TXT, borderRadius: "24px 24px 0 0", padding: 20, fontFamily: font }}>
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>How we know</h2>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", color: TXT, padding: 6 }}><X size={22} /></button>
        </div>
        <p style={{ fontSize: 13, color: MUT, lineHeight: 1.5, marginTop: 4 }}>{D.source}. {D.population}.</p>

        <p style={h}>Method</p>
        <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>{D.method}</p>
        <p style={{ fontSize: 12, color: MUT, marginTop: 6 }}>
          {D.flow.women40to59Examined.toLocaleString()} women examined → {D.flow.surgicalExcluded} surgical menopause and {D.flow.unknownStatusExcluded} unclear status excluded → {D.flow.analysed.toLocaleString()} analysed ({D.flow.pre.toLocaleString()} pre, {D.flow.post} post).
        </p>

        <p style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45, padding: "8px 10px", borderRadius: 10, background: "var(--surface-2)" }}>✓ <b>Cross-checked.</b> {validation.summary.verdict}</p>

        <p style={h}>Results</p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
          <thead><tr><th style={th}>Outcome</th><th style={th}>Before</th><th style={th}>After</th><th style={th}>Adjusted (OR / diff)</th><th style={th}>q</th></tr></thead>
          <tbody>{outcomes.map((o) => (
            <tr key={o.key}>
              <td style={{ ...td, fontWeight: 700 }}>{o.label}</td>
              <td style={td}>{o.kind === "binary" ? pct(o.crude.pre.est) : o.crude.pre.est.toFixed(2)}</td>
              <td style={td}>{o.kind === "binary" ? pct(o.crude.post.est) : o.crude.post.est.toFixed(2)}</td>
              <td style={td}>{orTxt(o.adjusted)}</td>
              <td style={{ ...td, fontWeight: o.significant ? 800 : 400 }}>{o.adjusted.q != null ? o.adjusted.q.toFixed(3) : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
        <p style={{ fontSize: 12, color: MUT, marginTop: 6, lineHeight: 1.45 }}>"Before/After" are raw survey-weighted rates. Raw gaps shrink once age is accounted for. Blood pressure, for example, looks much higher after menopause, but most of that gap is age.</p>

        <p style={h}>Does it survive other choices?</p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
          <thead><tr><th style={th}>Outcome</th><th style={th}>+ race, income, education</th><th style={th}>Ages 45–55</th><th style={th}>No hormone therapy</th></tr></thead>
          <tbody>{outcomes.map((o) => (
            <tr key={o.key}><td style={{ ...td, fontWeight: 700 }}>{o.label}</td><td style={td}>{orTxt(o.sensitivity.plusSocial)}</td><td style={td}>{orTxt(o.sensitivity.age45to55)}</td><td style={td}>{orTxt(o.sensitivity.noHormoneTherapy)}</td></tr>
          ))}</tbody>
        </table>

        <p style={h}>Does it hold for every group?</p>
        <p style={{ fontSize: 12, color: MUT, marginTop: 2 }}>Same model within each race/ethnicity group. Interaction p tests whether groups differ. Race is used only for this check, never to score you.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6, minWidth: 520 }}>
            <thead><tr><th style={th}>Outcome</th>{races.map((r) => <th key={r} style={th}>{r.replace(" (non-Hispanic)", "")}</th>)}<th style={th}>Interaction p</th></tr></thead>
            <tbody>{outcomes.map((o) => (
              <tr key={o.key}><td style={{ ...td, fontWeight: 700 }}>{o.label}</td>{races.map((r) => <td key={r} style={td}>{orTxt(o.byRace[r])}</td>)}<td style={td}>{o.raceInteractionP != null ? o.raceInteractionP.toFixed(2) : "—"}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p style={{ fontSize: 11.5, color: MUT, marginTop: 4 }}>{D.suppressionRule}</p>

        <p style={h}>Limitations</p>
        <ul style={{ paddingLeft: 18, marginTop: 4 }}>{D.limitations.map((l) => <li key={l} style={{ fontSize: 12.5, lineHeight: 1.45, marginBottom: 3 }}>{l}</li>)}</ul>
        <p style={h}>Data ethics</p>
        <ul style={{ paddingLeft: 18, marginTop: 4 }}>{D.ethics.map((l) => <li key={l} style={{ fontSize: 12.5, lineHeight: 1.45, marginBottom: 3 }}>{l}</li>)}</ul>
        <p style={{ fontSize: 11, color: MUT, marginTop: 12 }}>{D.license}</p>
      </motion.div>
    </motion.div>
  );
}
