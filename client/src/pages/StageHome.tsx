/**
 * Glitch — Home for pregnancy, postpartum and other no-cycle stages (menopause has its own home).
 * Stage guidance (LifeStagePanel) + daily mood/energy check-in + a gentle, evidence-linked prompt to
 * get support when low mood has lasted ~2 weeks. Never a diagnosis.
 */
import { motion } from "framer-motion";
import { Mic, Phone } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import DailyCheckIn from "@/components/DailyCheckIn";
import EvidenceSource from "@/components/EvidenceSource";
import LifeStagePanel from "@/components/LifeStagePanel";
import LifeStagePopulation from "@/components/LifeStagePopulation";
import SleepEstimateCard from "@/components/SleepEstimateCard";
import { ResearchGap } from "./CycleHome";

const font = "'DM Sans', sans-serif";
const tile: React.CSSProperties = { background: "var(--card-bg)", borderRadius: 22, padding: 16, marginTop: 14 };
const cap: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: "var(--txt-muted)", textTransform: "uppercase" };

/** Low-mood days (mood ≤ 2) among check-ins in the last 14 days. */
export function lowMoodDays(log: { date: string; mood: number }[], today = new Date()): { low: number; logged: number } {
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13);
  const recent = log.filter((e) => e.mood > 0 && new Date(e.date + "T00:00:00") >= cutoff);
  return { low: recent.filter((e) => e.mood <= 2).length, logged: recent.length };
}

export default function StageHome({ onTalk }: { onTalk: (prompt?: string) => void }) {
  const { profile, cycleSymptomLog } = useApp();
  const wh = profile!.womensHealth!;
  const stage = wh.noCycleReason ?? "other";
  const perinatal = stage === "pregnant" || stage === "postpartum";
  const mood = lowMoodDays(cycleSymptomLog);
  const persistentLow = mood.logged >= 5 && mood.low / mood.logged >= 0.5;

  return (
    <div style={{ background: "var(--app-bg)", minHeight: "100%", color: "var(--ink)", fontFamily: font, padding: "18px 16px 120px" }}>
      <p style={{ ...cap, letterSpacing: 0.5 }}>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
      <p style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>Hi {profile!.name.split(" ")[0]} 👋</p>

      <div style={{ margin: "0 -16px" }}><LifeStagePanel /></div>

      {perinatal && (
        <div style={tile}>
          <p style={cap}>{stage === "pregnant" ? "Moving during pregnancy" : "Moving after birth"}</p>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 6 }}>
            Guidelines recommend regular activity during pregnancy and after birth, adjusted to how you feel and cleared with your clinician. <EvidenceSource id="exercise-in-pregnancy-recommended" />
          </p>
        </div>
      )}

      <DailyCheckIn metrics={["mood", "energy", "sleepQuality", "sleepHours", "cravings"]} cycleDay={0} />
      {perinatal && <SleepEstimateCard stage={stage === "pregnant" ? "pregnant" : "breastfeeding"} />}

      {perinatal && (
        <div style={{ ...tile, border: persistentLow ? "1.5px solid oklch(0.77 0.17 55)" : undefined }}>
          <p style={cap}>Your mood matters too</p>
          {persistentLow ? (
            <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 6 }}>
              You've logged low mood on {mood.low} of your last {mood.logged} check-ins. That's worth talking about. Depression during pregnancy or after birth is common, it's not your fault, and it's treatable.
            </p>
          ) : (
            <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 6 }}>
              Up to about 1 in 7 women have depression during pregnancy or after birth. Glitch watches your check-ins and will gently say so if low mood keeps showing up.
            </p>
          )}
          <p style={{ fontSize: 12, color: "var(--txt-muted)", marginTop: 6 }}>
            Clinicians are advised to screen for depression and anxiety in pregnancy and postpartum, so it's okay to bring it up. <EvidenceSource id="perinatal-depression-common" /> <EvidenceSource id="postpartum-depression-screening" label="screening" />
          </p>
          <a href="tel:18338526262" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, padding: "11px 0", borderRadius: 12, background: persistentLow ? "var(--accent)" : "var(--surface-2)", color: persistentLow ? "var(--on-accent)" : "var(--ink)", fontWeight: 800, fontSize: 13.5, textDecoration: "none" }}>
            <Phone size={15} /> National Maternal Mental Health Hotline · 1-833-TLC-MAMA
          </a>
          <p style={{ fontSize: 11, color: "var(--txt-muted)", marginTop: 6, textAlign: "center" }}>Free, confidential, 24/7 call or text (US). In an emergency call 911.</p>
        </div>
      )}

      <LifeStagePopulation highlight={stage === "pregnant" ? "pregnant" : stage === "postpartum" ? "breastfeeding" : undefined} />
      <ResearchGap />

      <motion.button onClick={() => onTalk()} whileTap={{ scale: 0.9 }} aria-label="Talk to Glitchy"
        animate={{ boxShadow: ["0 0 0 0 color-mix(in oklch, var(--accent) 55%, transparent)", "0 0 0 16px color-mix(in oklch, var(--accent) 0%, transparent)"] }} transition={{ repeat: Infinity, duration: 1.8 }}
        style={{ position: "fixed", bottom: "calc(84px + var(--safe-bottom))", right: 16, width: 66, height: 66, borderRadius: "50%", border: "none", background: "var(--accent)", color: "var(--on-accent)", zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Mic size={30} />
      </motion.button>
    </div>
  );
}
