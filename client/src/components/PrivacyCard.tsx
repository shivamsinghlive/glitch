/**
 * Glitch — Your data & privacy controls
 * Shows where data lives and gives the user export, disconnect and delete-everything controls.
 */
import { useSyncExternalStore } from "react";
import { Download, Lock, Trash2, Unplug } from "lucide-react";
import { FULL_SHARES, clearOutboundLog, getAiMode, getOutboundLog, setAiMode, subscribeAiPrivacy, type AiMode } from "@/lib/aiPrivacy";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const INK = "var(--ink)";
const MUTED = "var(--txt-muted)";
const font = "'DM Sans', sans-serif";

export default function PrivacyCard() {
  const { whoop, disconnectWhoop, exportMyData, deleteAllMyData } = useApp();
  const row = { display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--card-bg)", width: "100%", textAlign: "left" as const };

  return (
    <div style={{ background: "var(--card-bg)", borderRadius: 22, padding: 16, boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)" }}>
      <div className="flex items-center gap-2 mb-1">
        <Lock size={16} style={{ color: "oklch(0.84 0.12 148)" }} />
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, color: INK }}>Your data & privacy</p>
      </div>
      <p style={{ fontSize: 12, color: MUTED, fontFamily: font, lineHeight: 1.5, marginBottom: 12 }}>
        Everything you log is encrypted (AES-256) on this device with a key that can't leave it. Form Coach video and your voice audio are analysed on-device. Only the AI coach's text goes to a server, and you choose how much of it (below).
      </p>
      <AiControls />
      <div className="flex flex-col gap-2" style={{ marginTop: 12 }}>
        <button style={row} onClick={() => { exportMyData(); toast.success("Your data was downloaded as JSON"); }}>
          <Download size={16} style={{ color: INK }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: INK, fontFamily: font }}>Export all my data</span>
        </button>
        {whoop && (
          <button style={row} onClick={() => { disconnectWhoop(); toast.success("WHOOP disconnected and its data removed"); }}>
            <Unplug size={16} style={{ color: INK }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: INK, fontFamily: font }}>Disconnect WHOOP {whoop.source === "demo" ? "(demo)" : ""}</span>
          </button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button style={{ ...row, borderColor: "oklch(0.62 0.15 30 / 0.4)" }}>
              <Trash2 size={16} style={{ color: "oklch(0.84 0.17 30)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.84 0.17 30)", fontFamily: font }}>Delete everything</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete all your data?</AlertDialogTitle>
              <AlertDialogDescription>
                This erases your profile, logs, cycle history and WHOOP data from this device, and destroys the encryption key. It can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteAllMyData()}>Delete everything</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

const MODES: { id: AiMode; title: string; body: string }[] = [
  { id: "off", title: "AI off", body: "Nothing leaves your device. Built-in rules still log and alert." },
  { id: "chat", title: "Chat only (default)", body: "The coach sees only the messages you say or type. No name, health data or photos." },
  { id: "full", title: "Chat + health summary", body: `Also shares: ${FULL_SHARES.join(", ")}. Enables personalised plans and food-photo analysis.` },
];

function AiControls() {
  const mode = useSyncExternalStore(subscribeAiPrivacy, getAiMode, getAiMode);
  const sent = useSyncExternalStore(subscribeAiPrivacy, () => getOutboundLog().length, () => 0);
  const log = getOutboundLog();
  return (
    <div style={{ marginBottom: 4 }}>
      <p id="ai-mode-label" style={{ fontSize: 13, fontWeight: 700, color: INK, fontFamily: font, marginBottom: 6 }}>What the AI coach can see</p>
      <div role="radiogroup" aria-labelledby="ai-mode-label" className="flex flex-col gap-1.5">
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setAiMode(m.id)}
            style={{ textAlign: "left", padding: "9px 11px", borderRadius: 12, background: "var(--card-bg)", border: mode === m.id ? "2px solid var(--accent)" : "1.5px solid var(--line)" }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: INK, fontFamily: font }}>{mode === m.id ? "● " : "○ "}{m.title}</span>
            <span style={{ display: "block", fontSize: 11.5, color: MUTED, fontFamily: font, lineHeight: 1.45, marginTop: 2 }}>{m.body}</span>
          </button>
        ))}
      </div>
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 12, color: MUTED, fontFamily: font, cursor: "pointer" }}>See exactly what was sent this session ({sent})</summary>
        {log.length === 0 ? (
          <p style={{ fontSize: 11.5, color: MUTED, fontFamily: font, marginTop: 6 }}>Nothing has been sent since you opened the app.</p>
        ) : (
          <div style={{ marginTop: 6 }}>
            {[...log].reverse().map((o) => (
              <pre key={o.at} tabIndex={0} aria-label={`Sent at ${new Date(o.at).toLocaleTimeString()}`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 140, overflow: "auto", fontSize: 10.5, color: INK, background: "var(--surface-2)", padding: 8, borderRadius: 8, marginBottom: 6, fontFamily: "ui-monospace, monospace" }}>
                {new Date(o.at).toLocaleTimeString()} · {o.kind} · {o.chars} characters{"\n\n"}{o.text.slice(0, 1800)}{o.text.length > 1800 ? "\n…" : ""}
              </pre>
            ))}
            <button onClick={clearOutboundLog} style={{ border: "none", background: "transparent", color: MUTED, fontSize: 11.5, textDecoration: "underline", padding: 2 }}>Clear this list</button>
          </div>
        )}
      </details>
    </div>
  );
}
