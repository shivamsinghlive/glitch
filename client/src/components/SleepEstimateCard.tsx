/**
 * Glitch — "Your short-sleep nights vs women like you": Beta–Binomial estimate (lib/personalEstimate.ts)
 * with the NHANES short-sleep rate for her life stage as the prior and her logged sleep hours as the data.
 */
import { useApp } from "@/contexts/AppContext";
import InfoToggle from "./InfoToggle";
import { SLEEP_PRIOR_STRENGTH, shortSleepEstimate, stageShortSleepPrior } from "@/lib/personalEstimate";

type Stage = "cycling" | "pregnant" | "breastfeeding" | "post";
const STAGE_TEXT: Record<Stage, string> = { cycling: "women who have periods", pregnant: "pregnant women", breastfeeding: "breastfeeding mothers", post: "women after menopause" };
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function SleepEstimateCard({ stage }: { stage: Stage }) {
  const { cycleSymptomLog } = useApp();
  const hours = cycleSymptomLog.map((e) => e.sleepHours).filter((h): h is number => typeof h === "number" && h > 0);
  const prior = stageShortSleepPrior(stage);
  const e = shortSleepEstimate(prior, hours);
  const higher = e.lo > prior, lower = e.hi < prior;

  return (
    <div style={{ background: "var(--card-bg)", borderRadius: 22, padding: 16, marginTop: 14, fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: "var(--txt-muted)", textTransform: "uppercase" }}>Your sleep vs women like you</p>
      <div className="flex items-baseline gap-2" style={{ marginTop: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: "var(--ink)" }}>{pct(e.mean)}</span>
        <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>of your nights under 7 h</span>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 2 }}>
        {e.nights === 0 ? `Starting from ${STAGE_TEXT[stage]} (${pct(prior)}). Log your sleep to make it yours.`
          : higher ? `More than ${STAGE_TEXT[stage]} (${pct(prior)}). Worth protecting your sleep.`
          : lower ? `Better than ${STAGE_TEXT[stage]} (${pct(prior)}). Nice.`
          : `About the same as ${STAGE_TEXT[stage]} (${pct(prior)}).`}
      </p>
      <InfoToggle>
        <p><b>Estimate:</b> {pct(e.mean)} (95% credible interval {pct(e.lo)}–{pct(e.hi)}), from {e.shortNights} short nights out of {e.nights} logged.</p>
        <p><b>How much is you:</b> {pct(e.weight)} your own nights, {pct(1 - e.weight)} population.</p>
        <p><b>Model:</b> Beta–Binomial. Prior Beta({(SLEEP_PRIOR_STRENGTH * prior).toFixed(1)}, {(SLEEP_PRIOR_STRENGTH * (1 - prior)).toFixed(1)}) centred on the CDC NHANES 2013–2018 short-sleep rate for {STAGE_TEXT[stage]} ({pct(prior)}, survey-weighted), worth {SLEEP_PRIOR_STRENGTH} nights. Each night you log updates it.</p>
        <p><b>Caveat:</b> NHANES counts the share of women whose usual sleep is under 7 h; yours is the share of your nights. Close, not identical.</p>
      </InfoToggle>
    </div>
  );
}
