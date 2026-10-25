/**
 * NutriSense AI — App Context (AI-powered + Women's Health)
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { LIFE_STAGES, type NoCycleReason } from "@/lib/lifeStage";
import { ovulationTrackingAllowed, type HormoneContext } from "@/lib/hormones";
import type { WhoopData } from "@/lib/whoop/types";
import { generateDemoWhoop, demoSeedFrom } from "@/lib/whoop/demoData";
import { dataStore, downloadJson } from "@/lib/dataStore";
import type { CheckInInput, StrategyId, Mismatch } from "@/lib/appraisal";
import type { ScreenerResult } from "@/lib/mentalHealth";
import type { MoodLabel } from "@/lib/emotion";
import type { HotFlash, MrsResult } from "@/lib/menopause";
import type { BpReading, Ethnicity } from "@/lib/menopauseSignals";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  /** Mood read when the user sent it (assistant messages: the tone it adapted to) */
  mood?: MoodLabel;
  via?: "voice" | "text";
  /** Meals this assistant turn logged (shown as cards with Undo) */
  loggedMeals?: { id: string; name: string; calories: number; protein: number; type: Meal["type"] }[];
  removedMeals?: string[];
  /** Other things this turn logged (hot flashes, BP, mood) */
  chips?: string[];
  /** Source citations backing any advice in this reply (rendered as small clickable links) */
  sources?: { title: string; url: string }[];
  undone?: boolean;
}

export interface AppraisalEntry {
  id: string;
  at: string;                 // ISO timestamp
  input: CheckInInput;
  stateLabel: string;
  mismatch: Mismatch;
  primary: StrategyId;
  alternative: StrategyId;
  /** Strategy the user tried and whether it helped (feedback for the learner) */
  tried?: StrategyId;
  helped?: boolean;
}
import {
  generateNutritionGoals,
  generateExercisePlan,
  NutritionGoals,
  Exercise,
} from "@/lib/aiService";
import { planWeek, type PlanInput } from "@/lib/planner";
import { isBoneHealthCohort } from "@/lib/boneHealth";
import type { Passage } from "@/lib/evidenceRag";

export type FitnessGoal =
  | "lose_weight"
  | "maintain"
  | "build_muscle"
  | "manage_diabetes";

export type Equipment = "none" | "dumbbells" | "resistance_bands" | "full_gym" | "kettlebells" | "pull_up_bar";
export type WorkoutStyle = "calisthenics" | "weight_training" | "yoga" | "running" | "hiit" | "pilates";
export type BiologicalSex = "female" | "male" | "prefer_not_to_say";
export type CycleStatus = "yes" | "no" | "irregular";
export type PmsSymptom = "mood_swings" | "bloating" | "cravings" | "fatigue" | "headaches" | "anxiety" | "acne" | "breast_tenderness" | "sleep_disturbances";
export type HealthCondition = "pcos" | "endometriosis" | "heavy_periods" | "irregular_cycles" | "none";
export type CyclePhase = "menstrual" | "follicular" | "ovulation" | "luteal";

export interface WomensHealthProfile {
  cycleStatus: CycleStatus;
  lastPeriodDate: string;       // ISO date string
  cycleLength: number;          // days, default 28
  commonSymptoms: PmsSymptom[];
  healthConditions: HealthCondition[];
  /** Why there's no current cycle (only when cycleStatus is "no") */
  noCycleReason?: NoCycleReason;
  dueDate?: string;             // when pregnant
  /** Legacy flag (older saved profiles); superseded by `hormones` */
  hormonalContraception?: boolean;
  /** Contraception / fertility / hormone therapy — only stored with consent */
  hormones?: HormoneContext;
  /** Menopause risk-factor inputs (hot-flash model) */
  smoker?: boolean;
  priorMenoSymptoms?: boolean;
  labs?: { fsh?: number; estradiol?: number };
  /** Self-identified, optional, consented. Used only for research context (SWAN), never scoring */
  ethnicity?: Ethnicity | "prefer_not";
  /** For people still having periods: regular cycles vs perimenopause (cycle changes + symptoms) */
  lifePhase?: "reproductive" | "perimenopause" | "unsure";
}

/** Which "My body" home a profile gets. */
export type BodyKind = "cycle" | "peri" | "menopause" | "none";

/** Perimenopause, whether or not periods have stopped. */
export function isPerimenopausal(p: UserProfile | null): boolean {
  const wh = p?.womensHealth;
  if (!wh) return false;
  if (wh.noCycleReason === "perimenopause") return true;
  // "Not sure" at 40+ while still cycling: show perimenopause tools too (they're harmless if not needed)
  return wh.cycleStatus !== "no" && (wh.lifePhase === "perimenopause" || (wh.lifePhase === "unsure" && p!.age >= 40));
}

export function bodyKind(p: UserProfile | null): BodyKind {
  const wh = p?.womensHealth;
  if (!p || p.biologicalSex !== "female" || !wh) return "none";
  if (wh.cycleStatus === "no" && wh.noCycleReason === "menopause") return "menopause";
  if (isPerimenopausal(p)) return "peri";
  if (wh.cycleStatus !== "no") return "cycle";
  return "none"; // pregnancy, postpartum etc. use their own life-stage screens
}

export interface MoodEntry { at: string; mood: number; label?: string; source: "voice" | "text" | "tap" }

export interface UserProfile {
  name: string;
  age: number;
  weight: number;
  height: number;
  goal: FitnessGoal;
  equipment: Equipment[];
  workoutStyles: WorkoutStyle[];
  biologicalSex: BiologicalSex;
  womensHealth?: WomensHealthProfile;
}

export interface Meal {
  id: string;
  type: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  name: string;
  imageUrl?: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  omega3: number;
  time: string;
  loggedAt?: string;    // ISO timestamp (used for "hours since last meal")
  sugar?: number;       // grams, when known (chat estimates it)
}

export interface WeightEntry {
  date: string;
  weight: number;
}

export interface WellnessEntry {
  date: string;
  mood: number;
  energy: number;
  stress: number;
  sleepHours: number;
  cravings: string[];
  notes: string;
}

export interface CycleSymptomEntry {
  date: string;
  cycleDay: number;
  mood: number;       // 1-5
  energy: number;     // 1-5
  stress: number;     // 1-5
  bloating: number;   // 1-5
  cramps: number;     // 1-5
  cravings: number;   // 1-5
  sleepQuality: number; // 1-5
  notes: string;
}

export interface PeriodEntry {
  startDate: string;
  endDate?: string;
}

export interface Supplement {
  id: string;
  name: string;
  dose: string;
  time: string;
  emoji: string;
}

export type { Exercise };

// ── Weekly Workout Plan ──────────────────────────────────────
export interface WorkoutExercise extends Exercise {
  id: string;           // Unique ID for this exercise in the plan
  dayOfWeek: number;    // 0=Monday, 6=Sunday
  completed: boolean;   // Exercise-level completion
  customNotes?: string; // User can add personal notes
  /** Planner category (strength, impact, cardio, balance, mobility) */
  kind?: string;
}

export interface WeeklyWorkoutPlan {
  id: string;
  daysPerWeek: number;  // 1-7
  exercises: WorkoutExercise[];
  createdAt: string;
  lastUpdated: string;
  cyclePhaseAtCreation?: CyclePhase; // For female users
  /** What the plan was built from, so the UI can show it and the user can see it changed with their choices */
  basis?: { goal: string; equipment: string[]; styles: string[]; boneCohort: boolean };
  /** Evidence passages the plan is grounded in (retrieved by BM25, see lib/evidence.ts) */
  evidence?: Passage[];
  notes?: string[];
}

// ── Cycle utility functions ──────────────────────────────────
export function getCycleDay(lastPeriodDate: string, cycleLength = 28, today = new Date()): number {
  const start = new Date(lastPeriodDate);
  // Blank/invalid dates (e.g. unknown last period from the menopause flows) → day 1, never NaN.
  if (Number.isNaN(start.getTime())) return 1;
  const len = cycleLength > 0 ? cycleLength : 28;
  const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, (((diff % len) + len) % len) + 1);
}

/** True when temperature-based ovulation detection makes sense (cycling, and no ovulation-suppressing hormones). */
export function tracksOvulation(p: UserProfile | null): boolean {
  return hasActiveCycle(p) && ovulationTrackingAllowed(p!.womensHealth!.hormones, p!.womensHealth!.hormonalContraception);
}

/** True when the profile has an active menstrual cycle we can track. */
export function hasActiveCycle(p: UserProfile | null): boolean {
  const wh = p?.womensHealth;
  return !!wh && p!.biologicalSex === "female" && wh.cycleStatus !== "no";
}

export function getCyclePhase(cycleDay: number, cycleLength = 28): CyclePhase {
  const menstrualEnd = 5;
  const follicularEnd = Math.round(cycleLength * 0.43);
  const ovulationEnd = Math.round(cycleLength * 0.57);
  if (cycleDay <= menstrualEnd) return "menstrual";
  if (cycleDay <= follicularEnd) return "follicular";
  if (cycleDay <= ovulationEnd) return "ovulation";
  return "luteal";
}

export function getNextPeriodDate(lastPeriodDate: string, cycleLength = 28): Date {
  const start = new Date(lastPeriodDate);
  return new Date(start.getTime() + cycleLength * 24 * 60 * 60 * 1000);
}

export function getOvulationDate(lastPeriodDate: string, cycleLength = 28): Date {
  const start = new Date(lastPeriodDate);
  return new Date(start.getTime() + Math.round(cycleLength * 0.5) * 24 * 60 * 60 * 1000);
}

// ── App State ────────────────────────────────────────────────
export interface AppState {
  profile: UserProfile | null;
  nutritionGoals: NutritionGoals | null;
  nutritionLoading: boolean;
  exercisePlan: Exercise[];
  exerciseLoading: boolean;
  weeklyWorkoutPlan: WeeklyWorkoutPlan | null;
  weeklyPlanLoading: boolean;
  meals: Meal[];
  steps: number;
  streak: number;
  weightLog: WeightEntry[];
  wellnessLog: WellnessEntry[];
  cycleSymptomLog: CycleSymptomEntry[];
  periodLog: PeriodEntry[];
  supplements: Supplement[];
  completedExercises: string[];
  whoop: WhoopData | null;
  appraisalLog: AppraisalEntry[];
  screenerLog: ScreenerResult[];
  chatMessages: ChatMessage[];
  /** Meals from previous days (today's live in `meals`) */
  mealHistory: Meal[];
  hotFlashLog: HotFlash[];
  mrsLog: MrsResult[];
  supplementTaken: { supplementId: string; at: string }[];
  bpLog: BpReading[];
  moodLog: MoodEntry[];
}

interface AppContextType extends AppState {
  setProfile: (p: UserProfile) => void;
  addMeal: (m: Meal) => void;
  setSteps: (s: number) => void;
  toggleExercise: (id: string) => void;
  addWeightEntry: (e: WeightEntry) => void;
  addWellnessEntry: (e: WellnessEntry) => void;
  addCycleSymptomEntry: (e: CycleSymptomEntry) => void;
  logPeriodStart: (date: string) => void;
  addSupplement: (s: Supplement) => void;
  removeSupplement: (id: string) => void;
  refreshExercisePlan: () => void;
  generateWeeklyPlan: (daysPerWeek: number) => Promise<void>;
  /** Change the choices a plan is built from (goal, equipment, styles, body numbers). Plans and targets update; logs are kept. */
  updatePreferences: (patch: Partial<Pick<UserProfile, "goal" | "equipment" | "workoutStyles" | "weight" | "height" | "age">>) => void;
  updateWeeklyPlan: (plan: WeeklyWorkoutPlan) => void;
  toggleExerciseCompletion: (exerciseId: string) => void;
  addCustomExerciseToDay: (dayOfWeek: number, exercise: WorkoutExercise) => void;
  removeExerciseFromDay: (exerciseId: string) => void;
  editExerciseInPlan: (exerciseId: string, updates: Partial<WorkoutExercise>) => void;
  /** False until saved data has been decrypted and restored */
  hydrated: boolean;
  connectWhoopDemo: () => void;
  setWhoopData: (d: WhoopData) => void;
  disconnectWhoop: () => void;
  exportMyData: () => void;
  deleteAllMyData: () => Promise<void>;
  addAppraisal: (e: AppraisalEntry) => void;
  rateAppraisal: (id: string, tried: StrategyId, helped: boolean) => void;
  addScreener: (r: ScreenerResult) => void;
  addChatMessage: (m: ChatMessage) => void;
  updateChatMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearChat: () => void;
  removeMeal: (id: string) => void;
  addHotFlash: (f: HotFlash) => void;
  removeHotFlash: (id: string) => void;
  addMrs: (r: MrsResult) => void;
  updateWomensHealth: (patch: Partial<WomensHealthProfile>) => void;
  markSupplementTaken: (supplementId: string) => void;
  undoSupplementTaken: (supplementId: string) => void;
  addBp: (r: BpReading) => void;
  addMood: (m: MoodEntry) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [nutritionGoals, setNutritionGoals] = useState<NutritionGoals | null>(null);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [exercisePlan, setExercisePlan] = useState<Exercise[]>([]);
  const [exerciseLoading, setExerciseLoading] = useState(false);
  const [weeklyWorkoutPlan, setWeeklyWorkoutPlanState] = useState<WeeklyWorkoutPlan | null>(null);
  const [weeklyPlanLoading, setWeeklyPlanLoading] = useState(false);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [steps, setStepsState] = useState(0);
  const [streak, setStreak] = useState(0);
  const [weightLog, setWeightLog] = useState<WeightEntry[]>([]);
  const [wellnessLog, setWellnessLog] = useState<WellnessEntry[]>([]);
  const [cycleSymptomLog, setCycleSymptomLog] = useState<CycleSymptomEntry[]>([]);
  const [periodLog, setPeriodLog] = useState<PeriodEntry[]>([]);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [completedExercises, setCompleted] = useState<string[]>([]);
  const [whoop, setWhoop] = useState<WhoopData | null>(null);
  const [appraisalLog, setAppraisalLog] = useState<AppraisalEntry[]>([]);
  const [screenerLog, setScreenerLog] = useState<ScreenerResult[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [mealHistory, setMealHistory] = useState<Meal[]>([]);
  const [hotFlashLog, setHotFlashLog] = useState<HotFlash[]>([]);
  const [mrsLog, setMrsLog] = useState<MrsResult[]>([]);
  const [supplementTaken, setSupplementTaken] = useState<{ supplementId: string; at: string }[]>([]);
  const [bpLog, setBpLog] = useState<BpReading[]>([]);
  const [moodLog, setMoodLog] = useState<MoodEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  /** Latest chosen days per week, readable inside callbacks without re-creating them */
  const weeklyDaysRef = useRef(4);

  const fetchExercisePlan = useCallback(async (p: UserProfile) => {
    setExerciseLoading(true);
    try {
      const phase = hasActiveCycle(p) && p.womensHealth?.lastPeriodDate
        ? getCyclePhase(getCycleDay(p.womensHealth.lastPeriodDate, p.womensHealth.cycleLength), p.womensHealth.cycleLength)
        : undefined;
      const plan = await generateExercisePlan({
        age: p.age, weight: p.weight, height: p.height, goal: p.goal,
        equipment: p.equipment, workoutStyles: p.workoutStyles,
        cyclePhase: phase, daysPerWeek: weeklyDaysRef.current, boneCohort: planInputFor(p, 4).boneCohort,
      });
      setExercisePlan(plan);
    } catch (err) {
      console.error("Exercise plan generation failed:", err);
    } finally {
      setExerciseLoading(false);
    }
  }, []);

  const setProfile = useCallback(async (p: UserProfile) => {
    setProfileState(p);
    setMeals([]); setCompleted([]); setStreak(0); setStepsState(0);
    setNutritionLoading(true); setExerciseLoading(true);
    try {
      const phase = hasActiveCycle(p) && p.womensHealth?.lastPeriodDate
        ? getCyclePhase(getCycleDay(p.womensHealth.lastPeriodDate, p.womensHealth.cycleLength), p.womensHealth.cycleLength)
        : undefined;
      const [goals, plan] = await Promise.all([
        generateNutritionGoals(nutritionInputFor(p, weeklyDaysRef.current)),
        generateExercisePlan({ age: p.age, weight: p.weight, height: p.height, goal: p.goal, equipment: p.equipment, workoutStyles: p.workoutStyles, cyclePhase: phase, daysPerWeek: weeklyDaysRef.current, boneCohort: planInputFor(p, 4).boneCohort }),
      ]);
      setNutritionGoals(goals);
      setExercisePlan(plan);
    } catch (err) {
      console.error("AI personalization failed:", err);
    } finally {
      setNutritionLoading(false); setExerciseLoading(false);
    }
  }, []);

  const addMeal = useCallback((m: Meal) => {
    setMeals((prev) => [...prev, m]);
    setStreak((s) => s + (meals.length === 0 ? 1 : 0));
  }, [meals.length]);

  const setSteps = useCallback((s: number) => setStepsState(s), []);

  const toggleExercise = useCallback((id: string) => {
    setCompleted((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const addWeightEntry = useCallback((e: WeightEntry) => {
    setWeightLog((prev) => [...prev, e]);
  }, []);

  const addWellnessEntry = useCallback((e: WellnessEntry) => {
    setWellnessLog((prev) => [...prev, e]);
  }, []);

  const addCycleSymptomEntry = useCallback((e: CycleSymptomEntry) => {
    setCycleSymptomLog((prev) => [...prev.filter((x) => x.date !== e.date), e]);
  }, []);

  const logPeriodStart = useCallback((date: string) => {
    setPeriodLog((prev) => [...prev.filter((p) => p.startDate !== date), { startDate: date }]);
    // Keep the profile's "last period" in sync so phase and predictions move forward
    setProfileState((prev) => {
      const wh = prev?.womensHealth;
      if (!prev || !wh || date <= wh.lastPeriodDate) return prev;
      return { ...prev, womensHealth: { ...wh, lastPeriodDate: date } };
    });
  }, []);

  const addSupplement = useCallback((s: Supplement) => {
    setSupplements((prev) => [...prev, s]);
  }, []);

  const removeSupplement = useCallback((id: string) => {
    setSupplements((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const refreshExercisePlan = useCallback(() => {
    if (profile) fetchExercisePlan(profile);
  }, [profile, fetchExercisePlan]);

  const buildWeekly = useCallback((p: UserProfile, daysPerWeek: number): WeeklyWorkoutPlan => {
    const phase = p.womensHealth?.lastPeriodDate && hasActiveCycle(p)
      ? getCyclePhase(getCycleDay(p.womensHealth.lastPeriodDate, p.womensHealth.cycleLength), p.womensHealth.cycleLength)
      : undefined;
    const input = planInputFor(p, daysPerWeek, phase);
    const week = planWeek(input);
    const stamp = Date.now();
    const exercises: WorkoutExercise[] = week.days.flatMap((d) =>
      d.exercises.map((e, i) => ({ ...e, id: `${d.dayOfWeek}-${i}-${e.id}-${stamp}`, dayOfWeek: d.dayOfWeek, completed: false })));
    return {
      id: `plan-${stamp}`, daysPerWeek, exercises, createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString(),
      cyclePhaseAtCreation: phase as CyclePhase | undefined,
      basis: { goal: p.goal, equipment: p.equipment, styles: p.workoutStyles, boneCohort: input.boneCohort },
      evidence: week.evidence, notes: week.notes,
    };
  }, []);

  const generateWeeklyPlan = useCallback(async (daysPerWeek: number) => {
    if (!profile) return;
    weeklyDaysRef.current = daysPerWeek;
    setWeeklyPlanLoading(true);
    try {
      setWeeklyWorkoutPlanState(buildWeekly(profile, daysPerWeek));
      // Training days change the energy estimate, so the food targets follow
      setNutritionGoals(await generateNutritionGoals(nutritionInputFor(profile, daysPerWeek)));
    } catch (err) {
      console.error("Weekly plan generation failed:", err);
    } finally {
      setWeeklyPlanLoading(false);
    }
  }, [profile, buildWeekly]);

  const updatePreferences = useCallback((patch: Partial<Pick<UserProfile, "goal" | "equipment" | "workoutStyles" | "weight" | "height" | "age">>) => {
    if (!profile) return;
    const next: UserProfile = { ...profile, ...patch };
    setProfileState(next);
    const days = weeklyWorkoutPlan?.daysPerWeek ?? weeklyDaysRef.current;
    setWeeklyWorkoutPlanState(buildWeekly(next, days));
    generateNutritionGoals(nutritionInputFor(next, days)).then(setNutritionGoals).catch(() => undefined);
  }, [profile, weeklyWorkoutPlan, buildWeekly]);

  const updateWeeklyPlan = useCallback((plan: WeeklyWorkoutPlan) => {
    setWeeklyWorkoutPlanState(plan);
  }, []);

  const toggleExerciseCompletion = useCallback((exerciseId: string) => {
    setWeeklyWorkoutPlanState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((ex) =>
          ex.id === exerciseId ? { ...ex, completed: !ex.completed } : ex
        ),
        lastUpdated: new Date().toISOString(),
      };
    });
  }, []);

  const addCustomExerciseToDay = useCallback((dayOfWeek: number, exercise: WorkoutExercise) => {
    setWeeklyWorkoutPlanState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: [...prev.exercises, { ...exercise, dayOfWeek, id: `${dayOfWeek}-custom-${Date.now()}` }],
        lastUpdated: new Date().toISOString(),
      };
    });
  }, []);

  const removeExerciseFromDay = useCallback((exerciseId: string) => {
    setWeeklyWorkoutPlanState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: prev.exercises.filter((ex) => ex.id !== exerciseId),
        lastUpdated: new Date().toISOString(),
      };
    });
  }, []);

  const editExerciseInPlan = useCallback((exerciseId: string, updates: Partial<WorkoutExercise>) => {
    setWeeklyWorkoutPlanState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((ex) =>
          ex.id === exerciseId ? { ...ex, ...updates } : ex
        ),
        lastUpdated: new Date().toISOString(),
      };
    });
  }, []);

  // ── Persistence (encrypted, see lib/dataStore.ts) ──────────
  type Snapshot = Omit<AppState, "nutritionLoading" | "exerciseLoading" | "weeklyPlanLoading" | "whoop"> & {
    whoop: WhoopData | { source: "demo" } | null;
    savedOn: string;
  };

  useEffect(() => {
    // Demo helper: open the app with ?reset to wipe all local data and start fresh
    const reset = new URLSearchParams(window.location.search).has("reset");
    const start = reset
      ? dataStore.clear().then(() => {
          try { Object.keys(localStorage).filter((k) => k.startsWith("glitch.")).forEach((k) => localStorage.removeItem(k)); } catch { /* storage unavailable */ }
          window.history.replaceState(null, "", window.location.pathname);
        })
      : Promise.resolve();
    start.then(() => dataStore.load<Snapshot>()).then((snap) => {
      if (snap?.profile) {
        setProfileState(snap.profile);
        setNutritionGoals(snap.nutritionGoals);
        setExercisePlan(snap.exercisePlan ?? []);
        setWeeklyWorkoutPlanState(snap.weeklyWorkoutPlan);
        // `meals` is today's log; anything from an earlier day moves to history
        const today = localDay(new Date());
        const sameDay = (m: Meal) => (m.loggedAt ? localDay(new Date(m.loggedAt)) : snap.savedOn) === today;
        setMeals((snap.meals ?? []).filter(sameDay));
        setMealHistory([...(snap.mealHistory ?? []), ...(snap.meals ?? []).filter((m) => !sameDay(m))]);
        setStepsState(snap.steps ?? 0);
        setStreak(snap.streak ?? 0);
        setWeightLog(snap.weightLog ?? []);
        setWellnessLog(snap.wellnessLog ?? []);
        setCycleSymptomLog(snap.cycleSymptomLog ?? []);
        setPeriodLog(snap.periodLog ?? []);
        setSupplements(snap.supplements ?? []);
        setCompleted(snap.completedExercises ?? []);
        setAppraisalLog(snap.appraisalLog ?? []);
        setScreenerLog(snap.screenerLog ?? []);
        setChatMessages(snap.chatMessages ?? []);
        setHotFlashLog(snap.hotFlashLog ?? []);
        setMrsLog(snap.mrsLog ?? []);
        // Keep ~2 weeks of supplement history
        setSupplementTaken((snap.supplementTaken ?? []).filter((t) => Date.now() - Date.parse(t.at) < 14 * 86_400_000));
        setBpLog(snap.bpLog ?? []);
        setMoodLog(snap.moodLog ?? []);
        // Demo data is regenerated rather than stored — it's deterministic and large
        if (snap.whoop?.source === "demo") setWhoop(buildDemo(snap.profile));
        else if (snap.whoop) setWhoop(snap.whoop as WhoopData);
      }
      setHydrated(true);
    }).catch((err) => {
      // Never get stuck on a blank shell: on any load/reset failure, boot into onboarding.
      console.warn("Startup failed, starting fresh:", err);
      setHydrated(true);
    });
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated || !profile) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const snap: Snapshot = {
        profile, nutritionGoals, exercisePlan, weeklyWorkoutPlan, meals, steps, streak, weightLog,
        wellnessLog, cycleSymptomLog, periodLog, supplements, completedExercises, appraisalLog, screenerLog, mealHistory, hotFlashLog, mrsLog, supplementTaken, bpLog, moodLog,
        chatMessages: chatMessages.slice(-60),
        savedOn: localDay(new Date()),
        whoop: whoop?.source === "demo" ? { source: "demo" } : whoop,
      };
      dataStore.save(snap);
    }, 400);
  }, [hydrated, profile, nutritionGoals, exercisePlan, weeklyWorkoutPlan, meals, steps, streak, weightLog,
      wellnessLog, cycleSymptomLog, periodLog, supplements, completedExercises, appraisalLog, screenerLog, chatMessages, mealHistory, hotFlashLog, mrsLog, supplementTaken, bpLog, moodLog, whoop]);

  // ── WHOOP ──────────────────────────────────────────────────
  const connectWhoopDemo = useCallback(() => {
    if (profile) setWhoop(buildDemo(profile));
  }, [profile]);
  const setWhoopData = useCallback((d: WhoopData) => setWhoop(d), []);
  const disconnectWhoop = useCallback(() => setWhoop(null), []);

  // ── Privacy controls ───────────────────────────────────────
  const exportMyData = useCallback(() => {
    downloadJson(`glitch-my-data-${new Date().toISOString().slice(0, 10)}.json`, {
      exportedAt: new Date().toISOString(),
      profile, nutritionGoals, meals, weightLog, wellnessLog, cycleSymptomLog, periodLog, supplements,
      mealHistory, weeklyWorkoutPlan, appraisalLog, screenerLog, chatMessages, hotFlashLog, mrsLog, bpLog, moodLog, whoop,
    });
  }, [profile, nutritionGoals, meals, mealHistory, weightLog, wellnessLog, cycleSymptomLog, periodLog, supplements, weeklyWorkoutPlan, appraisalLog, screenerLog, chatMessages, hotFlashLog, mrsLog, bpLog, moodLog, whoop]);

  // ── Appraisal check-ins ────────────────────────────────────
  const addAppraisal = useCallback((e: AppraisalEntry) => setAppraisalLog((prev) => [...prev, e]), []);
  const rateAppraisal = useCallback((id: string, tried: StrategyId, helped: boolean) => {
    setAppraisalLog((prev) => prev.map((e) => (e.id === id ? { ...e, tried, helped } : e)));
  }, []);

  const deleteAllMyData = useCallback(async () => {
    await dataStore.clear();
    window.location.reload();
  }, []);
  const addScreener = useCallback((r: ScreenerResult) => setScreenerLog((prev) => [...prev.filter((x) => x.date !== r.date), r]), []);

  // ── Coach chat ─────────────────────────────────────────────
  const addChatMessage = useCallback((m: ChatMessage) => setChatMessages((prev) => [...prev, m]), []);
  const updateChatMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setChatMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);
  const clearChat = useCallback(() => setChatMessages([]), []);
  const removeMeal = useCallback((id: string) => setMeals((prev) => prev.filter((m) => m.id !== id)), []);

  // ── Menopause ──────────────────────────────────────────────
  const addHotFlash = useCallback((f: HotFlash) => setHotFlashLog((prev) => [...prev, f]), []);
  const removeHotFlash = useCallback((id: string) => setHotFlashLog((prev) => prev.filter((f) => f.id !== id)), []);
  const addMrs = useCallback((r: MrsResult) => setMrsLog((prev) => [...prev.filter((x) => x.date !== r.date), r]), []);
  const markSupplementTaken = useCallback((supplementId: string) => setSupplementTaken((prev) => [...prev, { supplementId, at: new Date().toISOString() }]), []);
  const undoSupplementTaken = useCallback((supplementId: string) => {
    setSupplementTaken((prev) => {
      const idx = prev.map((t) => t.supplementId).lastIndexOf(supplementId);
      return idx < 0 ? prev : prev.filter((_, i) => i !== idx);
    });
  }, []);
  const addBp = useCallback((r: BpReading) => setBpLog((prev) => [...prev, r]), []);
  const addMood = useCallback((m: MoodEntry) => setMoodLog((prev) => [...prev, m].slice(-500)), []);
  const updateWomensHealth = useCallback((patch: Partial<WomensHealthProfile>) => {
    setProfileState((prev) => (prev?.womensHealth ? { ...prev, womensHealth: { ...prev.womensHealth, ...patch } } : prev));
  }, []);

  return (
    <AppContext.Provider value={{
      profile, nutritionGoals, nutritionLoading, exercisePlan, exerciseLoading,
      weeklyWorkoutPlan, weeklyPlanLoading,
      meals, steps, streak, weightLog, wellnessLog, cycleSymptomLog, periodLog,
      supplements, completedExercises, whoop, hydrated,
      connectWhoopDemo, setWhoopData, disconnectWhoop, exportMyData, deleteAllMyData,
      appraisalLog, addAppraisal, rateAppraisal, screenerLog, addScreener,
      chatMessages, addChatMessage, updateChatMessage, clearChat, removeMeal, mealHistory,
      hotFlashLog, addHotFlash, removeHotFlash, mrsLog, addMrs, updateWomensHealth,
      supplementTaken, markSupplementTaken, undoSupplementTaken, bpLog, addBp, moodLog, addMood,
      setProfile, addMeal, setSteps, toggleExercise, addWeightEntry,
      addWellnessEntry, addCycleSymptomEntry, logPeriodStart,
      addSupplement, removeSupplement, refreshExercisePlan,
      generateWeeklyPlan, updatePreferences, updateWeeklyPlan, toggleExerciseCompletion,
      addCustomExerciseToDay, removeExerciseFromDay, editExerciseInPlan,
    }}>
      {children}
    </AppContext.Provider>
  );
}

function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function allowsDeficit(p: UserProfile | null): boolean {
  if (!p) return true;
  return lifeStageFor(p)?.allowCalorieDeficit !== false;
}

/** Everything the planner needs, from the profile the user filled in. */
function planInputFor(p: UserProfile, daysPerWeek: number, cyclePhase?: string): PlanInput {
  return {
    goal: p.goal, equipment: p.equipment, styles: p.workoutStyles, daysPerWeek, age: p.age, cyclePhase,
    boneCohort: p.biologicalSex !== "male" && isBoneHealthCohort({ age: p.age, bodyKind: bodyKind(p) }),
  };
}

function nutritionInputFor(p: UserProfile, daysPerWeek: number) {
  return {
    name: p.name, age: p.age, weight: p.weight, height: p.height, goal: p.goal, biologicalSex: p.biologicalSex, daysPerWeek,
    boneCohort: planInputFor(p, daysPerWeek).boneCohort, postmenopause: bodyKind(p) === "menopause",
    lifeStage: lifeStageFor(p),
  };
}

function lifeStageFor(p: UserProfile) {
  const reason = p.womensHealth?.cycleStatus === "no" ? p.womensHealth.noCycleReason : undefined;
  if (reason) return LIFE_STAGES[reason];
  // Minors never get a deficit regardless of cycle status
  if (p.age < 18) return { label: "Under 18", allowCalorieDeficit: false };
  return undefined;
}

function buildDemo(p: UserProfile): WhoopData {
  const wh = p.womensHealth;
  const cycling = tracksOvulation(p);
  const menopausal = isPerimenopausal(p) || wh?.noCycleReason === "menopause";
  return generateDemoWhoop({
    menopausal,
    menstruating: cycling,
    lastPeriodDate: cycling ? wh!.lastPeriodDate : undefined,
    cycleLength: wh?.cycleLength,
    age: p.age,
    // Personalise so two different users don't get identical demo data (deterministic per profile).
    seed: demoSeedFrom({ name: p.name, age: p.age, heightCm: p.height, weightKg: p.weight }),
    heightMeter: p.height ? p.height / 100 : undefined,
    weightKg: p.weight || undefined,
  });
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
