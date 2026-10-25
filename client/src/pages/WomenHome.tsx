/**
 * Glitch — "My body" home for every woman, routed by life stage:
 *  - cycling → CycleHome (no wearable needed; optional wearable view)
 *  - perimenopause / menopause → MenopauseHome
 *  - pregnancy, postpartum and other no-cycle stages → StageHome
 */
import { useState } from "react";
import { useApp, bodyKind } from "@/contexts/AppContext";
import CycleHome from "./CycleHome";
import MenopauseHome from "./MenopauseHome";
import StageHome from "./StageHome";

export default function WomenHome({ onTalk }: { onTalk: (prompt?: string) => void }) {
  const { profile } = useApp();
  const [wearable, setWearable] = useState(false);
  const kind = bodyKind(profile);
  if (kind === "peri" || kind === "menopause") return <MenopauseHome onTalk={onTalk} />;
  if (kind === "cycle") {
    if (!wearable) return <CycleHome onTalk={onTalk} onWearable={() => setWearable(true)} />;
    return (
      <>
        <button onClick={() => setWearable(false)} style={{ margin: "12px 16px 0", padding: "7px 12px", borderRadius: 999, border: "1.5px solid var(--line)", background: "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
          ← Back to my cycle
        </button>
        <MenopauseHome onTalk={onTalk} />
      </>
    );
  }
  return <StageHome onTalk={onTalk} />;
}
