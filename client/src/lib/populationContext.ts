/**
 * Glitch — compare a user with US women of the same age (NHANES 2017–2018, survey-weighted).
 * Built by scripts/nhanes_reference.py. Context only: clinic readings differ from home readings.
 */
import ref from "./models/nhanesReference.json";

type Band = (typeof ref.bands)[number];
type Pcts = Record<string, number>;

export const NHANES_SOURCE = { source: ref.source, url: ref.url, note: ref.note };

export function bandFor(age: number): Band | null {
  const b = ref.bands.find((x) => age >= x.ageMin && age <= x.ageMax);
  if (b) return b;
  if (age < ref.bands[0].ageMin) return ref.bands[0];
  if (age > ref.bands[ref.bands.length - 1].ageMax) return ref.bands[ref.bands.length - 1];
  return null;
}

/** Linear interpolation of a value inside a percentile table; clamps to the 5th–95th range. */
export function percentileOf(value: number, table: Pcts): number {
  const pts = Object.entries(table).map(([p, v]) => [Number(p), v] as const).sort((a, b) => a[0] - b[0]);
  if (value <= pts[0][1]) return pts[0][0];
  for (let i = 1; i < pts.length; i++) {
    const [p0, v0] = pts[i - 1], [p1, v1] = pts[i];
    if (value <= v1) return v1 === v0 ? p1 : Math.round(p0 + ((value - v0) / (v1 - v0)) * (p1 - p0));
  }
  return pts[pts.length - 1][0];
}

export interface PopulationContext {
  ageBand: string;
  systolicPercentile?: number;
  diastolicPercentile?: number;
  sleepPercentile?: number;
  shareBpHigh: number;
  shareShortSleep: number;
  n: number;
}

export function populationContext(i: { age: number; systolic?: number | null; diastolic?: number | null; sleepHours?: number | null }): PopulationContext | null {
  const b = bandFor(i.age);
  if (!b) return null;
  return {
    ageBand: `${b.ageMin}–${b.ageMax}`,
    systolicPercentile: i.systolic != null ? percentileOf(i.systolic, b.systolicPercentiles) : undefined,
    diastolicPercentile: i.diastolic != null ? percentileOf(i.diastolic, b.diastolicPercentiles) : undefined,
    sleepPercentile: i.sleepHours != null ? percentileOf(i.sleepHours, b.sleepHoursPercentiles) : undefined,
    shareBpHigh: b.shareBpAtOrAbove130_80,
    shareShortSleep: b.shareSleepUnder6h,
    n: b.nBp,
  };
}
