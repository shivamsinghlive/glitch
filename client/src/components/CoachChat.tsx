/**
 * Glitch — Glitchy, the conversational coach
 * Talk or type like you would to a friend. Glitchy logs meals from conversation, reads your mood
 * on-device (face via camera, tone via mic, plus your words) and adapts how it talks. The Perlin
 * mood orb shows what it's picking up. Camera frames and audio never leave the phone.
 */
import { useSyncExternalStore, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { nanoid } from "nanoid";
import { Camera, CameraOff, ExternalLink, Mic, Send, Trash2, Undo2, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import MoodOrb from "./MoodOrb";
import TalkingAvatar from "./TalkingAvatar";
import { useApp, ChatMessage, Meal, getCycleDay, getCyclePhase, tracksOvulation, bodyKind } from "@/contexts/AppContext";
import { useHealthInsights } from "@/hooks/useHealthInsights";
import { useFaceEmotion } from "@/hooks/useFaceEmotion";
import { useVoice } from "@/hooks/useVoice";
import { fuseMood, LABEL_EMOJI, LABEL_CENTROID, type MoodLabel, type MoodRead } from "@/lib/emotion";
import { buildSystemPrompt, parseCoachResponse, enforceBpSafety } from "@/lib/coachAgent";
import { getAiMode, setAiMode, subscribeAiPrivacy } from "@/lib/aiPrivacy";
import { evidenceBlock, evidenceForQuestion } from "@/lib/evidenceRag";
import { coachCompletion } from "@/lib/aiService";
import { LIFE_STAGES } from "@/lib/lifeStage";
import { useMenopauseInsights } from "@/hooks/useMenopauseInsights";
import { useNudges } from "@/hooks/useNudges";
import { hormoneSummary } from "@/lib/hormones";
import { bpCategory, BP_LABEL } from "@/lib/menopauseSignals";
import NudgeStrip from "./NudgeStrip";

const INK = "var(--ink)";
const MUTED = "var(--txt-muted)";
const ACCENT = "var(--accent)";
const font = "'DM Sans', sans-serif";

const SUGGESTIONS = [
  "I just had a coffee and a blueberry muffin",
  "I'm stressed and craving something sweet",
  "What should I eat for dinner?",
  "How's my body doing today?",
];

const GOAL_TEXT: Record<string, string> = {
  lose_weight: "lose weight sustainably", maintain: "stay healthy", build_muscle: "build muscle", manage_diabetes: "manage blood sugar / prediabetes",
};

export function CoachFab({ onOpen }: { onOpen: () => void }) {
  const { appraisalLog } = useApp();
  const last = appraisalLog[appraisalLog.length - 1];
  const v = last ? (last.input.mood - 3) / 2 : 0.2;
  return (
    <motion.button onClick={onOpen} aria-label="Talk to Glitchy, your coach" whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
      initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}
      style={{ position: "fixed", bottom: "calc(92px + var(--safe-bottom))", right: 16, zIndex: 60, width: 64, height: 64, borderRadius: "50%", border: "none", padding: 0, background: "var(--card-bg)", boxShadow: "0 8px 28px oklch(0.25 0.025 50 / 0.25)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <MoodOrb state={{ valence: v, arousal: 0.35 }} size={64} />
    </motion.button>
  );
}

export default function CoachChat({ open, onClose, initialPrompt, onPromptUsed, autoListen }: { open: boolean; onClose: () => void; initialPrompt?: string | null; onPromptUsed?: () => void; autoListen?: boolean }) {
  const app = useApp();
  const { profile, nutritionGoals, meals, chatMessages, addChatMessage, updateChatMessage, clearChat, addMeal, removeMeal, appraisalLog, supplements, addHotFlash, addBp, addMood, logPeriodStart } = app;
  const h = useHealthInsights();
  const meno = useMenopauseInsights();
  const nudges = useNudges();

  const [cameraOn, setCameraOn] = useState(false);
  // Replies are silent by default — tap the speaker on a message to hear it.
  // Hands-free mode is the exception: it speaks each reply so it can re-open the mic afterwards.
  const [handsFree, setHandsFree] = useState(false);
  const [wordTick, setWordTick] = useState(0);
  const handsFreeRef = useRef(false);
  handsFreeRef.current = handsFree && open;
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // id of the assistant message currently being read aloud (null when silent)
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [textRead, setTextRead] = useState<MoodRead | null>(null);
  const [voiceArousal, setVoiceArousal] = useState<number | null>(null);
  // User's own correction of the mood read; expires after 10 minutes
  const [selfMood, setSelfMood] = useState<{ label: MoodLabel; until: number } | null>(null);
  const [pickMood, setPickMood] = useState(false);
  const selfRead = selfMood && selfMood.until > Date.now() ? LABEL_CENTROID[selfMood.label] : null;
  const scrollRef = useRef<HTMLDivElement>(null);

  const face = useFaceEmotion(open && cameraOn);
  const voice = useVoice((text, arousal) => { if (arousal != null) setVoiceArousal(arousal); send(text, "voice", arousal); });

  const fused = useMemo(() => fuseMood(face.read, voiceArousal, textRead, selfRead), [face.read, voiceArousal, textRead, selfRead]);
  const orbMode = voice.listening ? "listening" : thinking ? "thinking" : speaking ? "speaking" : "idle";

  useEffect(() => {
    if (open && initialPrompt) { send(initialPrompt); onPromptUsed?.(); }
  }, [open, initialPrompt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && autoListen && voice.supported && !voice.listening) { setHandsFree(true); voice.start(); }
  }, [open, autoListen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [chatMessages.length, thinking, voice.interim]);
  useEffect(() => { if (!open) { setCameraOn(false); setHandsFree(false); voice.stop(); stopSpeaking(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function stopSpeaking() {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setSpeaking(false);
    setSpeakingId(null);
  }

  /** Read a message aloud. `id` lets each bubble show its own speaking state; pass null for hands-free replies. */
  function speak(text: string, id: string | null = null) {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find((v) => /Samantha|Google US English|Jenny|Aria/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
    u.rate = fused?.label === "tense" || fused?.label === "low" ? 0.95 : 1.05;
    u.onstart = () => { setSpeaking(true); setSpeakingId(id); };
    u.onboundary = () => setWordTick((x) => x + 1);
    u.onend = () => {
      setSpeaking(false);
      setSpeakingId(null);
      // Keep the conversation going without touching the screen
      if (handsFreeRef.current && voice.supported) setTimeout(() => { if (handsFreeRef.current) voice.start(); }, 450);
    };
    speechSynthesis.speak(u);
  }

  /** Bubble speaker button: toggle reading this message aloud. */
  function toggleSpeak(id: string, text: string) {
    if (speakingId === id) stopSpeaking();
    else speak(text, id);
  }

  function context(question = "") {
    const wh = profile?.womensHealth;
    const cycling = tracksOvulation(profile);
    const phase = cycling ? h.cycle?.currentPhase ?? getCyclePhase(getCycleDay(wh!.lastPeriodDate, wh!.cycleLength), wh!.cycleLength) : null;
    const lastCheck = appraisalLog[appraisalLog.length - 1];
    return buildSystemPrompt({
      minimal: getAiMode() !== "full",
      evidence: (() => { const ps = evidenceForQuestion(question); return ps.length ? evidenceBlock(ps) : undefined; })(),
      firstName: profile?.name.split(" ")[0] ?? "there",
      goal: GOAL_TEXT[profile?.goal ?? "maintain"],
      lifeStage: wh?.cycleStatus === "no" && wh.noCycleReason ? LIFE_STAGES[wh.noCycleReason].label : undefined,
      conditions: wh?.healthConditions.filter((c) => c !== "none"),
      calorieTarget: nutritionGoals?.calorieTarget,
      proteinTarget: nutritionGoals?.proteinTarget,
      todayMeals: meals.map((m) => ({ name: m.name, type: m.type, calories: m.calories, protein: m.protein })),
      body: h.connected ? { recovery: h.recovery?.raw, phase, stress: h.stress?.level, energy: h.energy?.score, sleep: h.today?.sleepPerformance } : (phase ? { phase } : undefined),
      mood: fused,
      menopause: meno && (bodyKind(profile) === "menopause" || bodyKind(profile) === "peri" || (profile?.age ?? 0) >= 40) && meno.stage.stage !== "reproductive"
        ? { stage: meno.stage.label, flashesToday: meno.flashesToday, nightSweatNights14: meno.likelyWarm14, topTrigger: meno.triggers[0]?.label }
        : null,
      hormones: hormoneSummary(wh?.hormones),
      nudges: nudges.map((n) => `${n.title}: ${n.body}`),
      supplements: supplements.map((s) => `${s.name} (${s.time})`),
      lastCheckIn: lastCheck ? `${lastCheck.stateLabel} (${new Date(lastCheck.at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })})` : null,
      localTime: new Date().toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" }),
    });
  }

  async function send(text: string, via: "voice" | "text" = "text", arousal: number | null = voiceArousal) {
    const t = text.trim();
    if (!t || thinking) return;
    setDraft("");
    if (via === "text") setHandsFree(false);
    const moodNow = fuseMood(face.read, arousal, textRead, selfRead);
    const userMsg: ChatMessage = { id: nanoid(), role: "user", text: t, at: new Date().toISOString(), via, mood: moodNow?.label };
    addChatMessage(userMsg);
    setThinking(true);

    const history = [...chatMessages, userMsg].slice(-8).map((m) => ({ role: m.role, content: m.text }));
    try {
      const raw = await coachCompletion([{ role: "system", content: context(t) }, ...history]);
      const res = parseCoachResponse(raw);
      if (res.moodRead) setTextRead(res.moodRead);

      const logged: NonNullable<ChatMessage["loggedMeals"]> = [];
      const removed: string[] = [];
      const chips: string[] = [];
      let moodLogged = false;
      for (const a of res.actions) {
        if (a.type === "log_meal") {
          const meal: Meal = {
            id: nanoid(), type: a.meal.type, name: a.meal.name,
            calories: Math.round(a.meal.calories), protein: Math.round(a.meal.protein), carbs: Math.round(a.meal.carbs),
            fats: Math.round(a.meal.fats), fiber: Math.round(a.meal.fiber ?? 0), omega3: 0,
            sugar: a.meal.sugar != null ? Math.round(a.meal.sugar) : undefined,
            time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), loggedAt: new Date().toISOString(),
          };
          addMeal(meal);
          logged.push({ id: meal.id, name: meal.name, calories: meal.calories, protein: meal.protein, type: meal.type });
        } else if (a.type === "remove_meal") {
          const target = [...meals].reverse().find((m) => m.name.toLowerCase().includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(m.name.toLowerCase()));
          if (target) { removeMeal(target.id); removed.push(target.name); }
        } else if (a.type === "log_hot_flash") {
          for (let k = 0; k < a.count; k++) addHotFlash({ id: nanoid(), at: new Date().toISOString(), intensity: a.intensity as 1 | 2 | 3, night: a.night });
          chips.push(`🔥 ${a.count > 1 ? `${a.count} hot flashes` : a.night ? "Night sweat" : "Hot flash"} logged · ${["", "mild", "moderate", "severe"][a.intensity]}`);
        } else if (a.type === "log_bp") {
          addBp({ at: new Date().toISOString(), systolic: a.systolic, diastolic: a.diastolic, pulse: a.pulse });
          chips.push(`🩺 BP ${a.systolic}/${a.diastolic} · ${BP_LABEL[bpCategory(a.systolic, a.diastolic)]}`);
        } else if (a.type === "log_period_start") {
          const dte = a.date && a.date <= new Date().toISOString().slice(0, 10) ? a.date : new Date().toISOString().slice(0, 10);
          logPeriodStart(dte);
          chips.push(`🩸 Period start logged · ${new Date(`${dte}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
        } else if (a.type === "log_mood") {
          moodLogged = true;
          addMood({ at: new Date().toISOString(), mood: a.mood, label: moodNow?.label, source: via });
          chips.push(`${["", "😞", "😕", "😐", "🙂", "😄"][a.mood]} Mood noted`);
        }
      }
      // Passive emotion tracking: if the user didn't state a mood, keep the sensed one (face/voice/text)
      const sensed = fuseMood(face.read, arousal, res.moodRead ?? textRead, selfRead);
      if (!moodLogged && sensed && sensed.label !== "neutral") {
        addMood({ at: new Date().toISOString(), mood: Math.max(1, Math.min(5, Math.round(3 + sensed.valence * 2))), label: sensed.label, source: via });
      }
      const reply = enforceBpSafety(res.reply, res.actions, bpCategory);
      const replyId = nanoid();
      addChatMessage({ id: replyId, role: "assistant", text: reply, at: new Date().toISOString(), mood: moodNow?.label, loggedMeals: logged.length ? logged : undefined, removedMeals: removed.length ? removed : undefined, chips: chips.length ? chips : undefined, sources: res.sources.length ? res.sources : undefined });
      // Silent by default — only speak automatically in hands-free mode so the mic can re-open.
      if (handsFreeRef.current) speak(reply, replyId);
    } catch (err) {
      console.warn("Coach chat failed:", err);
      addChatMessage({ id: nanoid(), role: "assistant", text: "I can't reach my brain right now (connection issue). Try again in a moment?", at: new Date().toISOString() });
    } finally {
      setThinking(false);
    }
  }

  function undo(m: ChatMessage) {
    m.loggedMeals?.forEach((lm) => removeMeal(lm.id));
    updateChatMessage(m.id, { undone: true });
    toast.success("Meal removed");
  }

  const hue = fused ? (fused.valence < 0 ? 230 + fused.valence * 30 : 160 - fused.valence * 120) : 150;

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="coach" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 260, damping: 30 }}
          role="dialog" aria-label="Glitchy coach"
          style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", justifyContent: "center", background: "oklch(0.20 0.02 50 / 0.35)" }}>
          <div style={{ width: "100%", height: "var(--app-h)", paddingTop: "var(--safe-top)", display: "flex", flexDirection: "column", background: `linear-gradient(180deg, hsl(${hue}, 45%, 19%) 0%, var(--app-bg) 42%)`, transition: "background 1.2s" }}>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ padding: "14px 14px 0" }}>
              <div className="flex gap-2">
                <IconToggle on={cameraOn} onClick={() => setCameraOn((v) => !v)} label={cameraOn ? "Turn camera off" : "Read my expression (on-device)"}>
                  {cameraOn ? <Camera size={17} /> : <CameraOff size={17} />}
                </IconToggle>
              </div>
              <div className="flex gap-2">
                {chatMessages.length > 0 && <IconToggle on={false} onClick={clearChat} label="Clear conversation"><Trash2 size={16} /></IconToggle>}
                <IconToggle on={false} onClick={onClose} label="Close coach"><X size={18} /></IconToggle>
              </div>
            </div>

            {/* Orb + mood */}
            <div className="flex flex-col items-center" style={{ position: "relative", paddingTop: 2 }}>
              {cameraOn && (
                <div style={{ position: "absolute", left: 14, top: 6, width: 78, height: 104, borderRadius: 16, overflow: "hidden", boxShadow: "0 6px 18px oklch(0.25 0.025 50 / 0.25)", background: "#222" }}>
                  <video ref={face.videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                  <span style={{ position: "absolute", bottom: 4, left: 4, right: 4, fontSize: 9, fontWeight: 700, color: "white", fontFamily: font, textAlign: "center", background: "rgba(0,0,0,0.45)", borderRadius: 6, padding: "2px 0" }}>
                    {face.status === "loading" ? "loading…" : face.status === "calibrating" ? "relax your face…" : face.status === "no_face" ? "no face" : face.status === "error" ? "camera blocked" : "on-device"}
                  </span>
                </div>
              )}
              <div style={{ position: "relative", width: 190, height: 178, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.85 }}>
                  <MoodOrb state={{ valence: fused?.valence ?? 0.1, arousal: fused?.arousal ?? 0.35, level: voice.level, mode: orbMode }} size={190} />
                </div>
                <TalkingAvatar mode={orbMode} wordTick={wordTick} micLevel={voice.level} userMood={fused?.label} size={138} />
              </div>
              <AnimatePresence mode="wait">
                <motion.button key={fused?.label ?? "none"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  onClick={() => setPickMood((v) => !v)} aria-expanded={pickMood} title="Tap to correct how I'm reading you"
                  style={{ fontSize: 12, fontWeight: 700, color: INK, fontFamily: font, marginTop: -4, padding: "4px 10px", borderRadius: 999, background: "var(--surface-2)", border: "none" }}>
                  {voice.listening ? "🎙️ Listening…" : thinking ? "💭 Thinking…" : fused ? `${LABEL_EMOJI[fused.label]} ${fused.sources[0] === "self" ? "You said" : "I'm reading"}: ${fused.label}${fused.sources[0] === "self" ? "" : ` · ${fused.sources.join(" + ")}`} ✎` : "Hi, I'm Glitchy 👋 How are you feeling? ✎"}
                </motion.button>
              </AnimatePresence>
              <AnimatePresence>
                {pickMood && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    className="flex flex-wrap justify-center gap-1" style={{ marginTop: 6, padding: "0 14px" }}>
                    <span style={{ width: "100%", textAlign: "center", fontSize: 11, color: MUTED, fontFamily: font }}>Not quite? I'm actually feeling…</span>
                    {(Object.keys(LABEL_EMOJI) as MoodLabel[]).map((l) => (
                      <button key={l} onClick={() => { setSelfMood({ label: l, until: Date.now() + 10 * 60_000 }); setPickMood(false); }}
                        style={{ padding: "5px 10px", borderRadius: 999, border: "1.5px solid var(--line)", background: "var(--card-bg)", fontSize: 12, fontFamily: font, color: INK }}>
                        {LABEL_EMOJI[l]} {l}
                      </button>
                    ))}
                    {cameraOn && <button onClick={() => { face.recalibrate(); setPickMood(false); }} style={{ padding: "5px 10px", borderRadius: 999, border: "none", background: "transparent", fontSize: 11.5, fontFamily: font, color: "var(--accent)", fontWeight: 700 }}>↻ Recalibrate camera</button>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 14px", scrollbarWidth: "none" }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: "center", padding: "10px 8px 14px" }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 700, color: INK }}>What's on your mind{profile ? `, ${profile.name.split(" ")[0]}` : ""}?</p>
                  <p style={{ fontSize: 12.5, color: MUTED, fontFamily: font, marginTop: 4 }}>Tell me what you ate and I'll log it. Vent, ask, plan. Turn on the camera and I'll adapt to how you're feeling.</p>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {chatMessages.map((m) => <Bubble key={m.id} m={m} onUndo={() => undo(m)} speaking={speakingId === m.id} onSpeak={() => toggleSpeak(m.id, m.text)} />)}
                {voice.listening && voice.interim && (
                  <div style={{ alignSelf: "flex-end", maxWidth: "82%", padding: "9px 13px", borderRadius: "18px 18px 4px 18px", background: "color-mix(in oklch, var(--accent) 50%, transparent)", color: "white", fontSize: 14, fontFamily: font, fontStyle: "italic" }}>{voice.interim}…</div>
                )}
                {thinking && <TypingDots />}
              </div>
            </div>

            {/* Proactive nudges */}
            {!thinking && chatMessages.length < 6 && (
              <div style={{ padding: "0 14px 8px" }}><NudgeStrip compact onAsk={(p) => send(p)} /></div>
            )}

            {/* Suggestions */}
            {chatMessages.length < 2 && !thinking && (
              <div className="flex gap-1.5 overflow-x-auto" style={{ padding: "0 14px 8px", scrollbarWidth: "none" }}>
                {SUGGESTIONS.map((s) => (
                  <motion.button key={s} whileTap={{ scale: 0.95 }} onClick={() => send(s)}
                    style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 999, border: "1.5px solid var(--line)", background: "var(--card-bg)", color: INK, fontSize: 12.5, fontFamily: font, whiteSpace: "nowrap" }}>
                    {s}
                  </motion.button>
                ))}
              </div>
            )}

            <AiSeesChip />

            {/* Composer */}
            <div className="flex items-end gap-2" style={{ padding: "8px 12px 12px", borderTop: "1px solid var(--line)", background: "var(--card-bg)" }}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} placeholder={voice.listening ? "Listening…" : "Message Glitchy…"}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
                aria-label="Message Glitchy"
                style={{ flex: 1, resize: "none", maxHeight: 110, padding: "11px 14px", borderRadius: 20, border: "1.5px solid var(--line)", background: "var(--card-bg)", fontSize: 14.5, fontFamily: font, color: INK, outline: "none" }} />
              {draft.trim() ? (
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => send(draft)} aria-label="Send" disabled={thinking}
                  style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: ACCENT, color: "var(--on-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Send size={18} />
                </motion.button>
              ) : (
                <motion.button whileTap={{ scale: 0.9 }} aria-label={voice.listening ? "Stop listening" : "Talk to Glitchy"}
                  onClick={() => {
                    if (!voice.supported) { toast.info("Voice input needs Chrome, Edge or Safari."); return; }
                    if (voice.listening) { setHandsFree(false); voice.stop(); } else { setHandsFree(true); stopSpeaking(); voice.start(); }
                  }}
                  animate={{ boxShadow: voice.listening ? `0 0 0 ${6 + voice.level * 14}px color-mix(in oklch, var(--accent) 25%, transparent)` : "0 0 0 0px transparent" }}
                  style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: voice.listening ? "oklch(0.55 0.15 30)" : ACCENT, color: "var(--on-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Mic size={19} />
                </motion.button>
              )}
            </div>
            <p style={{ fontSize: 10, color: MUTED, fontFamily: font, textAlign: "center", padding: "0 12px calc(8px + var(--safe-bottom))", background: "var(--card-bg)" }}>
              Camera & voice are analysed on your phone. The AI only gets the text you choose to share. Not medical advice.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Bubble({ m, onUndo, speaking, onSpeak }: { m: ChatMessage; onUndo: () => void; speaking: boolean; onSpeak: () => void }) {
  const mine = m.role === "user";
  const canSpeak = !mine && typeof speechSynthesis !== "undefined" && m.text.trim().length > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2 }}
      style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "84%" }}>
      <div style={{ padding: "9px 13px", borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: mine ? ACCENT: "var(--card-bg)", color: mine ? "var(--on-accent)" : INK, fontSize: 14, lineHeight: 1.45, fontFamily: font, boxShadow: mine ? "none" : "0 2px 8px oklch(0.25 0.025 50 / 0.06)" }}>
        {m.text}
      </div>
      {canSpeak && (
        <button onClick={onSpeak} aria-label={speaking ? "Stop reading aloud" : "Read this message aloud"} aria-pressed={speaking} title={speaking ? "Stop" : "Read aloud"}
          className="flex items-center gap-1" style={{ marginTop: 3, border: "none", background: "transparent", color: speaking ? "var(--accent)" : MUTED, fontSize: 11.5, fontWeight: 600, fontFamily: font, cursor: "pointer" }}>
          {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
          {speaking ? "Stop" : "Listen"}
        </button>
      )}
      {mine && m.via === "voice" && <p style={{ fontSize: 10, color: MUTED, fontFamily: font, textAlign: "right", marginTop: 2 }}>🎙️ voice{m.mood ? ` · ${LABEL_EMOJI[m.mood]} ${m.mood}` : ""}</p>}
      {m.loggedMeals?.map((lm) => (
        <div key={lm.id} className="flex items-center gap-2" style={{ marginTop: 6, padding: "9px 11px", borderRadius: 14, background: m.undone ? "var(--surface-2)" : "oklch(0.72 0.08 148 / 0.14)", border: "1px solid oklch(0.72 0.08 148 / 0.3)", opacity: m.undone ? 0.6 : 1 }}>
          <span style={{ fontSize: 18 }}>🍽️</span>
          <div className="flex-1">
            <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, fontFamily: font, textDecoration: m.undone ? "line-through" : "none" }}>{lm.name}</p>
            <p style={{ fontSize: 11, color: MUTED, fontFamily: font }}>{lm.type} · {lm.calories} kcal · {lm.protein} g protein {m.undone ? "· removed" : "· logged"}</p>
          </div>
        </div>
      ))}
      {m.loggedMeals && !m.undone && (
        <button onClick={onUndo} className="flex items-center gap-1" style={{ marginTop: 4, border: "none", background: "transparent", color: MUTED, fontSize: 11.5, fontWeight: 600, fontFamily: font }}>
          <Undo2 size={12} /> Undo
        </button>
      )}
      {m.removedMeals?.map((n) => <p key={n} style={{ fontSize: 11, color: MUTED, fontFamily: font, marginTop: 3 }}>🗑️ Removed “{n}”</p>)}
      {m.chips?.map((c) => (
        <div key={c} style={{ marginTop: 6, padding: "8px 11px", borderRadius: 12, background: "color-mix(in oklch, var(--accent) 10%, var(--card-bg))", border: "1px solid color-mix(in oklch, var(--accent) 25%, transparent)", fontSize: 12.5, fontWeight: 700, color: INK, fontFamily: font }}>{c}</div>
      ))}
      {m.sources && m.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: font, alignSelf: "center" }}>Sources:</span>
          {m.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" title={s.title}
              className="flex items-center gap-1"
              style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, border: "1px solid var(--line)", color: "var(--accent)", fontFamily: font, textDecoration: "none", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span> <ExternalLink size={9} style={{ flexShrink: 0 }} />
            </a>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1" style={{ alignSelf: "flex-start", padding: "12px 14px", borderRadius: "18px 18px 18px 4px", background: "var(--card-bg)" }}>
      {[0, 1, 2].map((i) => (
        <motion.span key={i} animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
          style={{ width: 7, height: 7, borderRadius: "50%", background: MUTED, display: "block" }} />
      ))}
    </div>
  );
}

function IconToggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <motion.button whileTap={{ scale: 0.9 }} onClick={onClick} aria-label={label} title={label} aria-pressed={on}
      style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: on ? "var(--accent)" : "var(--surface-2)", color: on ? "var(--on-accent)" : INK, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </motion.button>
  );
}

/** One-line, always-visible statement of what the AI can see, with a one-tap way to change it. */
function AiSeesChip() {
  const mode = useSyncExternalStore(subscribeAiPrivacy, getAiMode, getAiMode);
  const label = mode === "off" ? "AI is off. Nothing leaves this device." : mode === "chat" ? "The AI sees only what you say here." : "The AI also sees your health summary.";
  const action = mode === "chat" ? { text: "Share health summary", to: "full" as const } : mode === "full" ? { text: "Share less", to: "chat" as const } : { text: "Turn on", to: "chat" as const };
  return (
    <div className="flex items-center justify-between gap-2" style={{ padding: "6px 14px", background: "var(--card-bg)", borderTop: "1px solid var(--line)", fontSize: 11.5, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>
      <span>🔒 {label}</span>
      <button onClick={() => setAiMode(action.to)} style={{ border: "none", background: "transparent", color: "var(--ink)", fontWeight: 700, fontSize: 11.5, textDecoration: "underline", padding: 4 }}>{action.text}</button>
    </div>
  );
}
