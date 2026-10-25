/**
 * Evaluate the night-sweat and ovulation detectors on simulated ground truth and write the aggregate
 * results to client/src/lib/models/detectorEvaluation.json (shown in the app's "Model evidence" card).
 * Usage: npx tsx scripts/evaluate_detectors.ts
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateNightSweats, evaluateOvulation } from "../client/src/lib/detectorEvaluation";

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "client", "src", "lib", "models", "detectorEvaluation.json");
const result = {
  kind: "simulated ground truth (stress test, not clinical validation)",
  nightSweat: evaluateNightSweats(),
  ovulation: evaluateOvulation(),
};
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
