/**
 * Glitch — educational hot-flash risk indicator.
 * Logistic regression trained by scripts/train_hotflash_model.py on the TSHS Hot Flashes dataset
 * (n=375, ages 35–48). Coefficients live in models/hotflashRisk.json. Shown as an educational
 * indicator with its model card — not a prediction for an individual (per the dataset's terms).
 */
import model from "./models/hotflashRisk.json";

export interface RiskInputs {
  age: number;
  smoker: boolean;
  bmi: number;
  priorSymptoms: boolean;
  fsh?: number | null;        // mIU/mL
  estradiol?: number | null;  // pg/mL
}

export interface RiskFactor {
  key: string;
  label: string;
  present: boolean;
  oddsRatio: number;
  modifiable: boolean;
}

export interface RiskResult {
  probability: number;        // 0–1
  prevalence: number;         // study baseline
  relative: "lower" | "similar" | "higher";
  usedLabs: boolean;
  outOfRange: boolean;        // age outside the 35–48 training range
  factors: RiskFactor[];
  cvAuc: number;
}

type Sub = { features: string[]; intercept: number; coefficients: Record<string, number>; mean: Record<string, number>; scale: Record<string, number>; oddsRatioPerUnit: Record<string, number>; cvAuc: number };

const ageGroup = (age: number) => (age < 40 ? 1 : age < 45 ? 2 : 3);

export function hotflashRisk(i: RiskInputs): RiskResult {
  const usedLabs = i.fsh != null && i.fsh > 0 && i.estradiol != null && i.estradiol > 0;
  const m = (usedLabs ? model.withLabs : model.base) as Sub;
  const x: Record<string, number> = {
    age_group: ageGroup(i.age),
    smoker: i.smoker ? 1 : 0,
    bmi30: i.bmi >= 30 ? 1 : 0,
    prior_symptoms: i.priorSymptoms ? 1 : 0,
    log_fsh: usedLabs ? Math.log(i.fsh!) : 0,
    log_estradiol: usedLabs ? Math.log(i.estradiol!) : 0,
  };
  let z = m.intercept;
  for (const f of m.features) z += m.coefficients[f] * ((x[f] - m.mean[f]) / m.scale[f]);
  const probability = 1 / (1 + Math.exp(-z));
  const ratio = probability / model.prevalence;

  const factors: RiskFactor[] = [
    { key: "prior_symptoms", label: "Earlier menopausal symptoms", present: !!i.priorSymptoms, oddsRatio: m.oddsRatioPerUnit.prior_symptoms, modifiable: false },
    { key: "bmi30", label: "BMI 30 or higher", present: i.bmi >= 30, oddsRatio: m.oddsRatioPerUnit.bmi30, modifiable: true },
    { key: "smoker", label: "Smoking", present: !!i.smoker, oddsRatio: m.oddsRatioPerUnit.smoker, modifiable: true },
  ];
  if (usedLabs) factors.push({ key: "log_fsh", label: `FSH ${i.fsh} mIU/mL (higher = further into transition)`, present: i.fsh! > Math.exp(model.withLabs.mean.log_fsh), oddsRatio: m.oddsRatioPerUnit.log_fsh, modifiable: false });

  return {
    probability,
    prevalence: model.prevalence,
    relative: ratio < 0.8 ? "lower" : ratio > 1.25 ? "higher" : "similar",
    usedLabs,
    outOfRange: i.age < 35 || i.age > 48,
    factors,
    cvAuc: m.cvAuc,
  };
}

export const MODEL_CARD = {
  name: model.name,
  trainedOn: model.trainedOn,
  citation: model.citation,
  license: model.license,
  excluded: model.excludedFeatures,
  caveat: model.caveat,
  aucBase: model.base.cvAuc,
  aucLabs: model.withLabs.cvAuc,
};

export interface WhatIf { label: string; from: number; to: number }

/** "What if" for the changeable factors: the modelled risk if smoking stopped or BMI dropped below 30. */
export function whatIfChanges(i: RiskInputs): WhatIf[] {
  const now = hotflashRisk(i).probability;
  const out: WhatIf[] = [];
  if (i.smoker) out.push({ label: "stopped smoking", from: now, to: hotflashRisk({ ...i, smoker: false }).probability });
  if (i.bmi >= 30) out.push({ label: "BMI under 30", from: now, to: hotflashRisk({ ...i, bmi: 29.9 }).probability });
  return out;
}
