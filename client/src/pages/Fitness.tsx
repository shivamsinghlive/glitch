/**
 * NutriSense AI — Fitness Tab
 * Weekly workout planner with manual exercise entry, editable plans, and completion tracking.
 * Includes real-time step counter and dynamic goal adjustment.
 */
import { useState, useEffect } from "react";
import { useApp, bodyKind, WeeklyWorkoutPlan, WorkoutExercise } from "@/contexts/AppContext";
import { useStepCounter } from "@/hooks/useStepCounter";
import BoneHealthCard from "@/components/BoneHealthCard";
import TrainingChoices from "@/components/TrainingChoices";
import PlanEvidence from "@/components/PlanEvidence";
import { isBoneHealthCohort } from "@/lib/boneHealth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Edit2, Check, ChevronDown, ChevronUp, Footprints, Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Fitness() {
  const { profile, weeklyWorkoutPlan, weeklyPlanLoading, generateWeeklyPlan, toggleExerciseCompletion, editExerciseInPlan, removeExerciseFromDay, addCustomExerciseToDay, nutritionGoals, meals, setSteps, steps: contextSteps } = useApp();
  const { steps, isActive, isSupported, start, stop, setManual } = useStepCounter(contextSteps);

  const showBoneHealth = isBoneHealthCohort({ age: profile?.age, bodyKind: bodyKind(profile) });

  const [daysPerWeek, setDaysPerWeek] = useState(5);
  const [expandedDay, setExpandedDay] = useState<number | null>(0);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<WorkoutExercise>>({});
  const [addingToDay, setAddingToDay] = useState<number | null>(null);
  const [newExercise, setNewExercise] = useState({ name: "", sets: "3", reps: "10", duration: "" });

  // Sync steps to context
  useEffect(() => {
    setSteps(steps);
  }, [steps, setSteps]);

  // Generate plan on first load
  useEffect(() => {
    if (!weeklyWorkoutPlan && !weeklyPlanLoading) {
      generateWeeklyPlan(daysPerWeek);
    }
  }, []);

  const handleGeneratePlan = async () => {
    await generateWeeklyPlan(daysPerWeek);
    toast.success(`${daysPerWeek}-day workout plan generated! 💪`);
  };

  const handleEditExercise = (ex: WorkoutExercise) => {
    setEditingExerciseId(ex.id);
    setEditValues(ex);
  };

  const handleSaveEdit = () => {
    if (editingExerciseId) {
      editExerciseInPlan(editingExerciseId, editValues);
      setEditingExerciseId(null);
      toast.success("Exercise updated!");
    }
  };

  const handleAddCustomExercise = (dayOfWeek: number) => {
    if (!newExercise.name.trim()) {
      toast.error("Please enter an exercise name");
      return;
    }
    const custom: WorkoutExercise = {
      id: `custom-${Date.now()}`,
      name: newExercise.name,
      description: `${newExercise.sets} sets × ${newExercise.reps} reps`,
      sets: parseInt(newExercise.sets) || 3,
      reps: parseInt(newExercise.reps) || 10,
      duration: newExercise.duration ? `${newExercise.duration} min` : "30 min",
      caloriesBurned: 0,
      formCues: [],
      dayOfWeek,
      completed: false,
      emoji: "💪",
      detail: `${newExercise.sets} sets × ${newExercise.reps} reps`,
      burn: 0,
      rationale: "Custom exercise",
      cues: [],
      goodCue: "Focus on form over speed",
    };
    addCustomExerciseToDay(dayOfWeek, custom);
    setNewExercise({ name: "", sets: "3", reps: "10", duration: "" });
    setAddingToDay(null);
    toast.success("Exercise added!");
  };

  const exercisesByDay = weeklyWorkoutPlan?.exercises.reduce((acc, ex) => {
    if (!acc[ex.dayOfWeek]) acc[ex.dayOfWeek] = [];
    acc[ex.dayOfWeek].push(ex);
    return acc;
  }, {} as Record<number, WorkoutExercise[]>) || {};

  const completedCount = weeklyWorkoutPlan?.exercises.filter((ex) => ex.completed).length || 0;
  const totalCount = weeklyWorkoutPlan?.exercises.length || 0;
  const weeklyProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const stepGoal = nutritionGoals?.stepGoal ?? 8000;
  const totalCalories = meals.reduce((a, m) => a + m.calories, 0);
  const dynamicStepGoal = nutritionGoals && totalCalories > nutritionGoals.calorieTarget ? stepGoal + Math.floor((totalCalories - nutritionGoals.calorieTarget) / 500) * 1000 : stepGoal;
  const stepPct = Math.min((steps / dynamicStepGoal) * 100, 100);

  const handleStartStepCounter = async () => {
    if (!isSupported) {
      toast.info("Step counter not supported on this device. Use manual entry below.");
      return;
    }
    if (isActive) {
      stop();
      toast.info("Step counter paused.");
    } else {
      await start();
      toast.success("Step counter started! Keep your phone in your pocket.");
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="px-4 pt-6">
        <h1 className="text-3xl font-bold text-foreground mb-2" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          Your Fitness Plan
        </h1>
        <p className="text-sm text-muted-foreground">Build a personalized weekly workout routine</p>
      </div>

      {/* Bone & muscle health (peri/menopausal women) */}
      {showBoneHealth && (
        <div className="px-4">
          <BoneHealthCard />
        </div>
      )}

      {/* Step Counter */}
      <div className="px-4">
        <Card className="p-4 bg-[var(--card-bg)] border-[var(--line)]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Footprints size={18} className="text-[var(--accent)]" />
              <span className="text-sm font-semibold text-[var(--ink)]">Steps Today</span>
              {isActive && <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-500 text-white animate-pulse">LIVE</span>}
            </div>
            <span className="text-2xl font-bold text-[var(--ink)]">{steps.toLocaleString()}</span>
          </div>
          <div className="h-2 bg-[var(--surface-2)] rounded-full overflow-hidden mb-2">
            <div className="h-full bg-[var(--accent)] rounded-full transition-all duration-800" style={{ width: `${stepPct}%` }} />
          </div>
          <p className="text-xs text-[var(--accent)] mb-3">Goal: {dynamicStepGoal.toLocaleString()} steps</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleStartStepCounter} className="flex-1" style={{ background: isActive ? "oklch(0.55 0.08 25)" : "var(--accent)" }}>
              <Smartphone size={14} className="mr-1" />
              {isActive ? "Pause" : "Start"}
            </Button>
            <Input type="number" placeholder="Manual" onBlur={(e) => { const n = parseInt(e.target.value); if (!isNaN(n) && n >= 0) { setManual(n); toast.success(`Steps set to ${n.toLocaleString()}`); e.target.value = ""; } }} className="w-20 text-xs" />
          </div>
        </Card>
      </div>

      {/* Weekly Progress */}
      {weeklyWorkoutPlan && (
        <div className="px-4">
          <Card className="p-6 bg-[var(--card-bg)] border-[var(--line)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wide">Weekly Progress</p>
                <p className="text-2xl font-bold text-[var(--ink)] mt-1">{completedCount} / {totalCount} Workouts</p>
              </div>
              <div className="relative w-20 h-20">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#2A2D36" strokeWidth="8" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke="oklch(0.68 0.09 25)" strokeWidth="8" strokeDasharray={`${(weeklyProgress / 100) * 283} 283`} strokeLinecap="round" style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dasharray 0.6s ease" }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-[var(--ink)]">{weeklyProgress}%</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* The user's choices drive the plan and the food targets */}
      <div className="px-4"><TrainingChoices /></div>

      {/* Days Per Week Selector */}
      <div className="px-4 space-y-3">
        <label className="text-sm font-semibold text-foreground">How many days per week?</label>
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button key={n} onClick={() => setDaysPerWeek(n)} className="px-4 py-2 rounded-full text-sm font-medium transition-all" style={{ background: daysPerWeek === n ? "var(--accent)" : "var(--surface-2)", color: daysPerWeek === n ? "var(--on-accent)" : "oklch(0.55 0.020 60)" }}>
              {n}
            </button>
          ))}
        </div>
        <Button onClick={handleGeneratePlan} disabled={weeklyPlanLoading} className="w-full" style={{ background: "var(--accent)" }}>
          {weeklyPlanLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
          {weeklyPlanLoading ? "Generating..." : "Generate Weekly Plan"}
        </Button>
      </div>

      {weeklyWorkoutPlan && <div className="px-4"><PlanEvidence /></div>}

      {/* Weekly Plan */}
      {weeklyWorkoutPlan && (
        <div className="px-4 space-y-3">
          {DAYS.map((day, dayIdx) => {
            const dayExercises = exercisesByDay[dayIdx] || [];
            const dayCompleted = dayExercises.filter((ex) => ex.completed).length;
            const isExpanded = expandedDay === dayIdx;

            return (
              <Card key={dayIdx} className="overflow-hidden border border-border">
                <button onClick={() => setExpandedDay(isExpanded ? null : dayIdx)} className="w-full p-4 flex items-center justify-between hover:bg-secondary transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "color-mix(in oklch, var(--accent) 10%, transparent)" }}>
                      <span className="text-xs font-bold text-[var(--ink)]">{day}</span>
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-foreground">{DAY_FULL[dayIdx]}</p>
                      <p className="text-xs text-muted-foreground">{dayCompleted} of {dayExercises.length} done</p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>

                {isExpanded && (
                  <div className="border-t border-border bg-card p-4 space-y-3">
                    {dayExercises.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Rest day</p>
                    ) : (
                      dayExercises.map((ex) => (
                        <div key={ex.id} className="border border-border rounded-lg p-3 bg-background">
                          {editingExerciseId === ex.id ? (
                            <div className="space-y-2">
                              <Input value={editValues.name || ""} onChange={(e) => setEditValues({ ...editValues, name: e.target.value })} placeholder="Exercise name" className="text-sm" />
                              <div className="grid grid-cols-3 gap-2">
                                <Input type="number" value={editValues.sets || 3} onChange={(e) => setEditValues({ ...editValues, sets: parseInt(e.target.value) || 3 })} placeholder="Sets" className="text-sm" />
                                <Input type="number" value={editValues.reps || 10} onChange={(e) => setEditValues({ ...editValues, reps: parseInt(e.target.value) || 10 })} placeholder="Reps" className="text-sm" />
                                <Input value={editValues.duration || ""} onChange={(e) => setEditValues({ ...editValues, duration: e.target.value })} placeholder="Duration" className="text-sm" />
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleSaveEdit} className="flex-1" style={{ background: "var(--accent)" }}>
                                  Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingExerciseId(null)} className="flex-1">
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => toggleExerciseCompletion(ex.id)} aria-pressed={ex.completed} aria-label={`${ex.completed ? "Mark not done" : "Mark done"}: ${ex.name}`} className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all" style={{ borderColor: ex.completed ? "var(--accent)" : "var(--line)", background: ex.completed ? "var(--accent)" : "transparent" }}>
                                    {ex.completed && <Check size={14} className="text-white" />}
                                  </button>
                                  <p className={`font-semibold ${ex.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{ex.name}</p>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 ml-8">
                                  {ex.sets && ex.reps ? `${ex.sets} sets × ${ex.reps} reps${ex.duration ? ` · ${ex.duration}` : ""}` : ex.detail}
                                </p>
                                {ex.why && <p className="text-xs mt-1 ml-8" style={{ color: "var(--accent)" }}>Why: {ex.why}</p>}
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => handleEditExercise(ex)} aria-label={`Edit ${ex.name}`} className="p-1.5 hover:bg-secondary rounded transition-colors">
                                  <Edit2 size={14} className="text-muted-foreground" />
                                </button>
                                <button onClick={() => removeExerciseFromDay(ex.id)} aria-label={`Remove ${ex.name}`} className="p-1.5 hover:bg-destructive/10 rounded transition-colors">
                                  <Trash2 size={14} className="text-destructive" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}

                    {addingToDay === dayIdx ? (
                      <div className="border border-dashed border-border rounded-lg p-3 space-y-2 bg-secondary/50">
                        <Input value={newExercise.name} onChange={(e) => setNewExercise({ ...newExercise, name: e.target.value })} placeholder="Exercise name" className="text-sm" />
                        <div className="grid grid-cols-3 gap-2">
                          <Input type="number" value={newExercise.sets} onChange={(e) => setNewExercise({ ...newExercise, sets: e.target.value })} placeholder="Sets" className="text-sm" />
                          <Input type="number" value={newExercise.reps} onChange={(e) => setNewExercise({ ...newExercise, reps: e.target.value })} placeholder="Reps" className="text-sm" />
                          <Input value={newExercise.duration} onChange={(e) => setNewExercise({ ...newExercise, duration: e.target.value })} placeholder="Min" className="text-sm" />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleAddCustomExercise(dayIdx)} className="flex-1" style={{ background: "var(--accent)" }}>
                            Add
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAddingToDay(null)} className="flex-1">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddingToDay(dayIdx)} className="w-full py-2 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2">
                        <Plus size={16} /> Add Exercise
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {!weeklyWorkoutPlan && !weeklyPlanLoading && (
        <div className="px-4 py-12 text-center">
          <p className="text-muted-foreground mb-4">No workout plan yet. Generate one to get started!</p>
        </div>
      )}
    </div>
  );
}
