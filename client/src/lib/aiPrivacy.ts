/**
 * Glitch — what the AI is allowed to see, and a live record of what it was sent.
 *
 * Three modes, chosen by the user (default: chat only, privacy by default):
 *   off  — nothing leaves the device; the built-in rules still log and alert.
 *   chat — the coach sees only the messages the user types or says. No name, health data or photos.
 *   full — the coach also gets a health summary (see FULL_SHARES) and the app may send profile data for
 *          personalised plans and food-photo analysis.
 * The outbound log lives in memory only (cleared on reload) so the user can inspect exactly what was sent.
 */
export type AiMode = "off" | "chat" | "full";
export type AiScope = "chat" | "full" | "photo";

const KEY = "glitch.ai.mode";
let memoryMode: AiMode = "chat";
const listeners = new Set<() => void>();

export const FULL_SHARES = [
  "first name", "goal and life stage", "health conditions you listed", "today's meals",
  "WHOOP-derived scores (recovery, stress, energy, sleep, cycle phase)", "menopause stage, hot flashes and night-sweat counts, top trigger",
  "hormone and contraception details (only if you consented)", "supplements", "last check-in",
];

function read(): AiMode {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    if (v === "off" || v === "chat" || v === "full") return v;
  } catch { /* storage unavailable */ }
  return memoryMode;
}

export const getAiMode = (): AiMode => read();

export function setAiMode(mode: AiMode) {
  memoryMode = mode;
  try { globalThis.localStorage?.setItem(KEY, mode); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export class AiBlockedError extends Error {
  constructor(public mode: AiMode) { super(`AI blocked by privacy mode "${mode}"`); }
}

/** Thrown for a food photo in "chat" mode until the user agrees to send that one photo. */
export class AiConsentNeededError extends Error { constructor() { super("The user must agree to send this photo first"); } }

let photoConsent = false;
/** One-shot consent for the next photo. Photos are never covered by the "chat only" mode. */
export function grantPhotoConsent() { photoConsent = true; }

/** Throws unless the user's mode allows a call of this scope. */
export function assertAiAllowed(scope: AiScope) {
  const mode = getAiMode();
  if (mode === "off" || (mode === "chat" && scope === "full")) throw new AiBlockedError(mode);
  if (scope === "photo" && mode === "chat") {
    if (!photoConsent) throw new AiConsentNeededError();
    photoConsent = false; // consent covers one photo only
  }
}

export interface Outbound { at: string; kind: "chat" | "photo"; chars: number; text: string }
const log: Outbound[] = [];

/** Keep the last few payloads in memory so the privacy screen can show them verbatim. */
export function recordOutbound(kind: Outbound["kind"], messages: { role: string; content: string }[] | string) {
  const text = typeof messages === "string" ? messages : messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n");
  log.push({ at: new Date().toISOString(), kind, chars: text.length, text });
  while (log.length > 5) log.shift();
  listeners.forEach((l) => l());
}

export const getOutboundLog = (): readonly Outbound[] => log;
export function clearOutboundLog() { log.length = 0; listeners.forEach((l) => l()); }
export function subscribeAiPrivacy(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
