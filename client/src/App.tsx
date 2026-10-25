/**
 * NutriSense AI — App Root
 * Female users: Home | Log | Fitness | Form Coach | Cycle | Progress
 * Other users:  Home | Log Food | Fitness | Form Coach | Progress
 */
import { useEffect, useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider, useApp, bodyKind } from "./contexts/AppContext";
import BottomNav from "./components/BottomNav";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import LogFood from "./pages/LogFood";
import Fitness from "./pages/Fitness";
import FormCoach from "./pages/FormCoach";
import WomensHealth from "./pages/WomensHealth";
import Progress from "./pages/Progress";
import MenopauseHome from "./pages/MenopauseHome";
import CoachChat, { CoachFab } from "./components/CoachChat";
import { ThemeSync, Confetti } from "./components/Fun";

function AppShell() {
  const { profile, hydrated } = useApp();
  const [activeTab, setActiveTab] = useState("home");
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachPrompt, setCoachPrompt] = useState<string | null>(null);
  const [coachListen, setCoachListen] = useState(false);
  // Home has two views for women: "My body" (hormones, sleep, HRV, symptoms) and "Food" (macros, supplements)
  const [homeView, setHomeViewState] = useState<"body" | "food">(() => {
    try { return localStorage.getItem("glitch.homeView") === "food" ? "food" : "body"; } catch { return "body"; }
  });
  const setHomeView = (v: "body" | "food") => { setHomeViewState(v); try { localStorage.setItem("glitch.homeView", v); } catch { /* storage unavailable */ } };
  const askCoach = (prompt: string) => { setCoachPrompt(prompt); setCoachOpen(true); };
  // Open the coach silent by default (mic off), matching every other page.
  // The user taps the mic inside the coach to start talking.
  const talk = (prompt?: string) => { if (prompt) askCoach(prompt); else setCoachOpen(true); };

  // Wait for encrypted saved data to be restored before deciding whether to onboard
  if (!hydrated) {
    return <div className="phone-shell" />;
  }

  if (!profile) {
    return (
      <div className="phone-shell">
        <DeviceChrome />
        <div style={{ height: "calc(var(--app-h) - var(--safe-top))", marginTop: "var(--safe-top)", overflowY: "auto", scrollbarWidth: "none" }}>
          <Onboarding onDone={() => setActiveTab("home")} />
        </div>
      </div>
    );
  }

  // Cycle tab covers life stages too (pregnancy, menopause…), so show it for all female profiles
  const isFemale = profile.biologicalSex === "female" && !!profile.womensHealth;
  const hasBodyHome = bodyKind(profile) !== "none";
  const menopauseMode = hasBodyHome && homeView === "body";

  const pages: Record<string, React.ReactNode> = {
    home: (
      <>
        {hasBodyHome && <HomeSwitch value={homeView} onChange={setHomeView} />}
        {menopauseMode ? <MenopauseHome onTalk={talk} /> : <Dashboard onAskCoach={askCoach} />}
      </>
    ),
    log:      <LogFood />,
    fitness:  <Fitness />,
    form:     <FormCoach />,
    cycle:    <WomensHealth />,
    progress: <Progress />,
  };

  return (
    <div className="phone-shell" style={{ boxShadow: "0 0 0 1px var(--surface-2), 0 24px 80px oklch(0.25 0.025 50 / 0.18)" }}>
      <DeviceChrome />
      {/* Content starts below the status bar / Dynamic Island */}
      <div style={{ overflowY: "auto", height: "calc(var(--app-h) - var(--safe-top))", marginTop: "var(--safe-top)", paddingBottom: "calc(84px + var(--safe-bottom))", scrollbarWidth: "none", background: "var(--app-bg)" }}>
        {pages[activeTab] ?? <Dashboard />}
      </div>
      <ThemeSync />
      <Confetti />
      <BottomNav active={activeTab} onChange={setActiveTab} isFemale={isFemale}  />
      {!coachOpen && activeTab !== "form" && !(menopauseMode && activeTab === "home") && <CoachFab onOpen={() => setCoachOpen(true)} />}
      <CoachChat open={coachOpen} onClose={() => { setCoachOpen(false); setCoachListen(false); }} initialPrompt={coachPrompt} onPromptUsed={() => setCoachPrompt(null)} autoListen={coachListen} />
    </div>
  );
}

/** iPhone 17 Pro chrome (status bar, Dynamic Island, home indicator); hidden on real phones via CSS. */
function DeviceChrome() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  return (
    <div className="device-chrome" aria-hidden>
      <div className="device-status">
        <span>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "")}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" /><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" /><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" /></svg>
          <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0L8 11.5Zm-4.2-4.3L2.2 5.6a8.2 8.2 0 0 1 11.6 0l-1.6 1.6a5.9 5.9 0 0 0-8.4 0ZM.6 4 0 3.4C4.4-1 11.6-1 16 3.4l-.6.6-1 1a10.5 10.5 0 0 0-12.8 0L.6 4Z" fill="currentColor" /></svg>
          <svg width="27" height="13" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="currentColor" opacity="0.4" fill="none" /><rect x="2" y="2" width="18" height="9" rx="2" fill="currentColor" /><rect x="24.5" y="4.5" width="2" height="4" rx="1" fill="currentColor" opacity="0.4" /></svg>
        </span>
      </div>
      <div className="device-island" />
      <div className="device-home" />
    </div>
  );
}

/** "My body" | "Food" segmented switch, pinned to the top of Home. */
function HomeSwitch({ value, onChange }: { value: "body" | "food"; onChange: (v: "body" | "food") => void }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, padding: "10px 16px 0", background: "var(--app-bg)" }}>
      <div role="tablist" aria-label="Home view" style={{ display: "flex", padding: 4, borderRadius: 999, background: "var(--surface-2)" }}>
        {([["body", "💓 My body"], ["food", "🥗 Food"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)}
            style={{ flex: 1, padding: "9px 0", borderRadius: 999, border: "none", fontSize: 14, fontWeight: 800, fontFamily: "'DM Sans', sans-serif", position: "relative", background: "transparent", color: value === id ? "var(--on-accent)" : "var(--ink-2)", zIndex: 1 }}>
            {value === id && <motion.span layoutId="home-switch" transition={{ type: "spring", stiffness: 420, damping: 32 }} style={{ position: "absolute", inset: 0, borderRadius: 999, background: "var(--accent)", zIndex: -1 }} />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Scale the desktop phone frame to the largest size that fits the window. */
function useFrameFit() {
  useEffect(() => {
    const FRAME_H = 874 + 26, FRAME_W = 402 + 26; // screen + bezel rings
    const fit = () => {
      const z = Math.min((window.innerHeight - 24) / FRAME_H, (window.innerWidth - 32) / FRAME_W, 1.3);
      document.documentElement.style.setProperty("--frame-zoom", String(Math.max(0.55, +z.toFixed(3))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
}

function App() {
  useFrameFit();
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <AppProvider>
            <Toaster position="top-center" richColors theme="dark" />
            <div style={{ minHeight: "100dvh", background: "var(--app-outer)", transition: "background 0.8s", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AppShell />
            </div>
          </AppProvider>
        </TooltipProvider>
        </MotionConfig>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
