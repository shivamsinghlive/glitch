/**
 * Glitch — "Model evidence": the data science behind the app, in plain language.
 * Fairness audit + calibration (TSHS), detector stress tests (simulated ground truth) and the
 * NHANES comparison with US women of the same age.
 */
import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useHealthInsights } from "@/hooks/useHealthInsights";
import { useMenopauseDashboard } from "@/hooks/useMenopauseDashboard";
import { populationContext, NHANES_SOURCE } from "@/lib/populationContext";
import { AnimatePresence, motion } from "framer-motion";
import evidence from "@/lib/models/hotflashEvidence.json";
import detectors from "@/lib/models/detectorEvaluation.json";
import nhanes from "@/lib/models/nhanesReference.json";
import { bandFor } from "@/lib/populationContext";
import { CalibrationChart, CountUp, DisparityPanel, ScoresPanel, ErrorRateTable, FairnessBars, NightSweatLab, PercentileBand, SensorStress, StatTile } from "./EvidenceCharts";

const INK = "var(--ink)";
const MUTED = "var(--txt-muted)";
const HEAT = "oklch(0.63 0.17 35)";
const font = "'DM Sans', sans-serif";
const pct = (x: number) => `${Math.round(x * 100)}%`;
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

type Tab = "you" | "fair" | "groups" | "detect" | "scores";

export default function ModelEvidenceCard() {
  const { profile } = useApp();
  const h = useHealthInsights();
  const d = useMenopauseDashboard();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("you");
  if (!profile) return null;

  const lastBp = d?.bp[d.bp.length - 1];
  const sleepDays = h.days.slice(-14).map((x) => x.sleepHours).filter((x): x is number => x != null);
  const sleep = sleepDays.length ? sleepDays.reduce((a, b) => a + b, 0) / sleepDays.length : null;
  const band = bandFor(profile.age);
  const pop = populationContext({ age: profile.age, systolic: lastBp?.systolic, diastolic: lastBp?.diastolic, sleepHours: sleep });

  return (
    <div style={{ background: "var(--card-bg)", borderRadius: 20, padding: 16, boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" }}>
      <div className="flex items-center justify-between">
        <p style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: font }}>Model evidence</p>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "oklch(0.58 0.09 260 / 0.12)", color: "oklch(0.84 0.11 260)", fontFamily: font }}>DATA SCIENCE</span>
      </div>
      <p style={{ fontSize: 12, color: MUTED, fontFamily: font, marginTop: 4, lineHeight: 1.45 }}>How we checked that Glitch's numbers are fair and reliable, using real public data.</p>
      <div className="flex gap-2" style={{ marginTop: 10 }}>
        <StatTile value={<CountUp to={nhanes.bands.reduce((a, b) => a + b.nBp, 0) + 375} />} label="real women in the public data" />
        <StatTile value={<CountUp to={evidence.auc} decimals={2} />} label="risk model AUC (0.5 = guess)" />
        <StatTile value={<CountUp to={Math.round(detectors.nightSweat.operating.precision * 100)} suffix="%" />} label="flagged sweats that were real*" />
      </div>
      <button onClick={() => setOpen((v) => !v)} style={{ marginTop: 8, border: "none", background: "transparent", color: HEAT, fontWeight: 700, fontSize: 12, fontFamily: font, padding: 0 }}>
        {open ? "Hide ▴" : "Show the evidence ▾"}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 10 }}>
            {([["you", "You vs US"], ["fair", "Fairness"], ["groups", "Groups"], ["detect", "Detectors"], ["scores", "Scores"]] as [Tab, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{ flex: "1 1 30%", padding: "7px 0", borderRadius: 10, fontSize: 11.5, fontWeight: 700, fontFamily: font, border: tab === k ? `2px solid ${HEAT}` : "1.5px solid var(--line)", background: "var(--card-bg)", color: INK }}>{label}</button>
            ))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
              style={{ padding: "12px 12px", borderRadius: 14, background: "var(--surface-2)", fontSize: 12, color: INK, fontFamily: font, lineHeight: 1.55 }}>
              {tab === "you" && pop && band && (
                <>
                  <p><b>You vs women aged {pop.ageBand} in the US</b> <span style={{ color: MUTED }}>(NHANES 2017–18, {pop.n} women, survey-weighted)</span></p>
                  {lastBp && pop.systolicPercentile != null && <PercentileBand label="Systolic blood pressure" unit="mmHg" value={lastBp.systolic} table={band.systolicPercentiles} percentile={pop.systolicPercentile} />}
                  {sleep != null && pop.sleepPercentile != null && <PercentileBand label="Sleep per night" unit="h" value={sleep} table={band.sleepHoursPercentiles} percentile={pop.sleepPercentile} />}
                  {!lastBp && sleep == null && <p style={{ color: MUTED, marginTop: 6 }}>Log a blood pressure or connect WHOOP demo to see where you sit.</p>}
                  <p style={{ marginTop: 10 }}>{pct(pop.shareBpHigh)} of women your age have a reading at or above 130/80, and {pct(pop.shareShortSleep)} sleep under 6 hours.</p>
                  <p style={{ color: MUTED, marginTop: 4, fontSize: 10.5 }}>Track = 5th–95th percentile, shaded = middle half, tick = median. {NHANES_SOURCE.note}</p>
                </>
              )}
              {tab === "you" && !pop && <p>Add your age to see how you compare.</p>}
              {tab === "fair" && (
                <>
                  <p><b>We do not score anyone by race or education, and we audit by both.</b> Brier score {evidence.brier} vs {evidence.brierBaseline} for always guessing the average; AUC {evidence.auc} (95% range {evidence.aucBootstrap95[0]}–{evidence.aucBootstrap95[1]}).</p>
                  <div style={{ marginTop: 8 }}><CalibrationChart /></div>
                  <FairnessBars />
                  <ErrorRateTable />
                  <p style={{ marginTop: 8 }}>Adding race and education would have made the model <i>no better</i> (AUC {evidence.fairness.aucWithProtectedFeatures}), so leaving them out costs nothing.</p>
                </>
              )}
              {tab === "groups" && <DisparityPanel />}
              {tab === "scores" && <ScoresPanel />}
              {tab === "detect" && (
                <>
                  <NightSweatLab />
                  <SensorStress />
                  <p style={{ marginTop: 12, padding: "8px 10px", borderRadius: 10, background: "var(--card-bg)" }}><b>No flag is not reassurance.</b> The detector catches about {pct(detectors.nightSweat.operating.recall)} of real night sweats at the default setting. If you feel it was a bad night, it was.</p>
                  <p style={{ marginTop: 12 }}><b>Ovulation detector</b> <span style={{ color: MUTED }}>({detectors.ovulation.cycles} simulated cycles, {pct(detectors.ovulation.anovulatory / detectors.ovulation.cycles)} with no ovulation)</span></p>
                  <div className="flex gap-2" style={{ marginTop: 6 }}>
                    <StatTile value={<CountUp to={Math.round(detectors.ovulation.sensitivity * 100)} suffix="%" />} label="ovulations found" />
                    <StatTile value={<CountUp to={Math.round(detectors.ovulation.specificity * 100)} suffix="%" />} label="no-ovulation cycles rejected" />
                    <StatTile value={<CountUp to={Math.round(detectors.ovulation.within2Days * 100)} suffix="%" />} label="dated within 2 days" />
                  </div>
                  <p style={{ color: MUTED, marginTop: 8, fontSize: 10.5 }}>*Simulated ground truth, not clinical validation. The detector favours few false alarms over catching every case; slide the threshold to see the trade-off.</p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
