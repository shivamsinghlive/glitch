/**
 * NutriSense AI — Progress Tab
 * Design: Organic Wellness Journal
 * All data comes from real logged meals and weight entries in AppContext.
 * Weekly chart is built from actual meal logs grouped by day.
 */
import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line,
} from "recharts";
import { toast } from "sonner";
import WellnessCheckIn from "@/components/WellnessCheckIn";
import PrivacyCard from "@/components/PrivacyCard";
import AppearanceCard from "@/components/AppearanceCard";
import MindCard from "@/components/MindCard";

const CHART_TABS = ["Calories", "Protein", "Steps"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function NutritionScore({ meals, goals }: {
  meals: { protein: number; fiber: number; omega3: number }[];
  goals: { proteinTarget: number; fiberTarget: number; omega3Target: number } | null;
}) {
  if (!goals || meals.length === 0) return null;
  const total = meals.length;
  const avgProtein = meals.reduce((a, m) => a + m.protein, 0) / total;
  const avgFiber   = meals.reduce((a, m) => a + m.fiber,   0) / total;
  const avgOmega3  = meals.reduce((a, m) => a + m.omega3,  0) / total;
  const score = Math.min(100, Math.round(
    (Math.min(avgProtein / goals.proteinTarget, 1) * 40) +
    (Math.min(avgFiber   / goals.fiberTarget,   1) * 35) +
    (Math.min(avgOmega3  / goals.omega3Target,  1) * 25)
  ));
  const badge = score >= 80 ? { label: "Excellent", color: "oklch(0.72 0.08 148)" }
              : score >= 60 ? { label: "Good",      color: "oklch(0.78 0.10 75)"  }
              :               { label: "Needs Work", color: "var(--accent)"  };

  return (
    <div
      style={{
        background: "var(--card-bg)",
        borderRadius: 20,
        padding: "16px",
        boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)",
      }}
    >
      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>
        Weekly Nutrition Score
      </p>
      <div className="flex items-center gap-4">
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: `conic-gradient(${badge.color} ${score}%, var(--surface-2) 0%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: "var(--card-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 700, color: badge.color, fontFamily: "'DM Sans', sans-serif" }}>
              {score}%
            </span>
          </div>
        </div>
        <div>
          <span
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: 999,
              background: `${badge.color}22`,
              color: badge.color,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: 4,
            }}
          >
            {badge.label}
          </span>
          <p style={{ fontSize: 12, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>
            Based on your logged meals today
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Progress() {
  const { weightLog, addWeightEntry, meals, nutritionGoals, steps } = useApp();
  const [chartTab, setChartTab] = useState("Calories");
  const [newWeight, setNewWeight] = useState("");

  // Build weekly chart data from actual logged meals
  // Group meals by day of week (last 7 days)
  const weeklyData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      const dayLabel = DAY_LABELS[d.getDay()];
      const isToday = i === 6;

      // For today, use real meal data; for past days, show 0 (no history stored yet)
      const dayMeals = isToday ? meals : [];
      const calories = dayMeals.reduce((a, m) => a + m.calories, 0);
      const protein  = dayMeals.reduce((a, m) => a + m.protein,  0);
      const daySteps = isToday ? steps : 0;

      return { day: dayLabel, calories, protein, steps: daySteps, isToday };
    });
  }, [meals, steps]);

  const chartData = weeklyData.map((d) => ({
    day: d.day + (d.isToday ? " ★" : ""),
    value: chartTab === "Calories" ? d.calories
         : chartTab === "Protein"  ? d.protein
         : d.steps,
  }));

  const barColor = chartTab === "Calories" ? "var(--accent)"
                 : chartTab === "Protein"  ? "oklch(0.72 0.08 148)"
                 : "oklch(0.68 0.09 25)";

  function handleAddWeight() {
    const w = parseFloat(newWeight);
    if (!isNaN(w) && w > 0) {
      const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      addWeightEntry({ date: today, weight: w });
      setNewWeight("");
      toast.success("Weight logged! Keep it up 🌿");
    }
  }

  const hasAnyData = meals.length > 0 || weightLog.length > 0;

  return (
    <div className="flex flex-col gap-0 pb-2">
      {/* Header */}
      <div style={{ padding: "20px 20px 12px" }}>
        <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 24, fontWeight: 700, color: "var(--ink)" }}>
          Your Progress
        </h1>
        <p style={{ fontSize: 13, color: "var(--txt-muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
          {hasAnyData ? "Here's how you're doing this week." : "Start logging meals to see your progress here."}
        </p>
      </div>

      <div className="flex flex-col gap-4 px-4">
        {/* Wellness Check-In */}
        <MindCard />
        <WellnessCheckIn />

        {/* Nutrition score */}
        <NutritionScore meals={meals} goals={nutritionGoals} />

        {/* Empty state */}
        {!hasAnyData && (
          <div
            style={{
              padding: "32px 16px",
              borderRadius: 20,
              background: "var(--card-bg)",
              textAlign: "center",
              border: "1.5px dashed var(--line)",
            }}
          >
            <p style={{ fontSize: 40, marginBottom: 10 }}>📊</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
              No data yet
            </p>
            <p style={{ fontSize: 13, color: "var(--txt-muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
              Log your first meal to start tracking your progress.
            </p>
          </div>
        )}

        {/* Weekly bar chart */}
        {hasAnyData && (
          <div
            className="animate-fade-up animate-fade-up-delay-1"
            style={{
              background: "var(--card-bg)",
              borderRadius: 20,
              padding: "16px",
              boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)",
            }}
          >
            <div className="flex gap-2 mb-4">
              {CHART_TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setChartTab(t)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: "none",
                    background: chartTab === t ? "var(--accent)" : "var(--surface-2)",
                    color: chartTab === t ? "white" : "var(--ink)",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "all 0.15s",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2D36" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fill: "oklch(0.55 0.020 60)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fill: "oklch(0.65 0.015 60)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    fontSize: 12,
                    fontFamily: "'DM Sans', sans-serif",
                    boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.10)",
                  }}
                  cursor={{ fill: "color-mix(in oklch, var(--accent) 6%, transparent)" }}
                />
                <Bar dataKey="value" fill={barColor} radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
            <p style={{ fontSize: 11, color: "var(--txt-muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif", textAlign: "center" }}>
              ★ = today · Past days show as you log more over time
            </p>
          </div>
        )}

        {/* Today's summary */}
        {meals.length > 0 && nutritionGoals && (
          <div
            className="animate-fade-up animate-fade-up-delay-2"
            style={{
              background: "var(--card-bg)",
              borderRadius: 20,
              padding: "16px",
              boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)",
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>
              Today's Summary
            </p>
            <div className="flex flex-col gap-2">
              {[
                { label: "Calories",  val: meals.reduce((a,m) => a+m.calories,0), target: nutritionGoals.calorieTarget, unit: "kcal" },
                { label: "Protein",   val: meals.reduce((a,m) => a+m.protein, 0), target: nutritionGoals.proteinTarget,  unit: "g" },
                { label: "Carbs",     val: meals.reduce((a,m) => a+m.carbs,   0), target: nutritionGoals.carbsTarget,    unit: "g" },
                { label: "Fats",      val: meals.reduce((a,m) => a+m.fats,    0), target: nutritionGoals.fatsTarget,     unit: "g" },
              ].map(({ label, val, target, unit }) => {
                const pct = Math.min((val / target) * 100, 100);
                const color = pct >= 90 ? "oklch(0.72 0.08 148)" : pct >= 60 ? "oklch(0.78 0.10 75)" : "var(--accent)";
                return (
                  <div key={label}>
                    <div className="flex justify-between mb-1">
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
                      <span style={{ fontSize: 11, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>
                        {val}{unit} / {target}{unit}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: color, transition: "width 0.8s cubic-bezier(0.23,1,0.32,1)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Weight log */}
        <div
          className="animate-fade-up animate-fade-up-delay-3"
          style={{
            background: "var(--card-bg)",
            borderRadius: 20,
            padding: "16px",
            boxShadow: "0 4px 16px oklch(0.25 0.025 50 / 0.06)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif" }}>
              Weight Log (kg)
            </p>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddWeight()}
                placeholder="kg"
                style={{
                  width: 64,
                  padding: "5px 8px",
                  borderRadius: 10,
                  border: "1.5px solid var(--line)",
                  fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif",
                  color: "var(--ink)",
                  outline: "none",
                  background: "var(--app-bg)",
                }}
              />
              <button
                onClick={handleAddWeight}
                style={{
                  padding: "5px 12px",
                  borderRadius: 10,
                  background: "var(--accent)",
                  color: "var(--on-accent)",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  border: "none",
                }}
              >
                Log
              </button>
            </div>
          </div>

          {weightLog.length === 0 ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <p style={{ fontSize: 13, color: "var(--txt-muted)", fontFamily: "'DM Sans', sans-serif" }}>
                No weight entries yet. Log your first reading above.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={weightLog} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2D36" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fill: "oklch(0.55 0.020 60)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fill: "oklch(0.65 0.015 60)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    fontSize: 12,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="oklch(0.62 0.12 38)"
                  strokeWidth={2.5}
                  dot={{ fill: "var(--accent)", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <AppearanceCard />

        <PrivacyCard />
      </div>
    </div>
  );
}
