/**
 * Glitch — the standard scores for a yes/no call, from a confusion matrix.
 *
 *            actually yes        actually no
 *  said yes  TP (hit)            FP (false alarm)
 *  said no   FN (miss)           TN (correctly quiet)
 */
export interface Confusion { tp: number; fp: number; fn: number; tn: number }
export interface ClassMetrics extends Confusion {
  accuracy: number;          // (TP+TN) / all. Misleading when one answer is rare.
  precision: number;         // of the times we said yes, how often were we right
  recall: number;            // of the real yeses, how many we caught (sensitivity)
  specificity: number;       // of the real nos, how many we left alone
  f1: number;                // balance of precision and recall
  balancedAccuracy: number;  // average of recall and specificity
  mcc: number;               // Matthews correlation: 0 = no better than chance, 1 = perfect
  falseAlarmRate: number;    // FP / (FP+TN)
  missRate: number;          // FN / (FN+TP)
}

const r3 = (x: number) => +x.toFixed(3);

export function classMetrics({ tp, fp, fn, tn }: Confusion): ClassMetrics {
  const n = tp + fp + fn + tn;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const specificity = tn + fp ? tn / (tn + fp) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const denom = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
  return {
    tp, fp, fn, tn,
    accuracy: n ? r3((tp + tn) / n) : 0, precision: r3(precision), recall: r3(recall), specificity: r3(specificity), f1: r3(f1),
    balancedAccuracy: r3((recall + specificity) / 2), mcc: denom ? r3((tp * tn - fp * fn) / denom) : 0,
    falseAlarmRate: r3(1 - specificity), missRate: r3(1 - recall),
  };
}

export function tally(pairs: { predicted: boolean; actual: boolean }[]): Confusion {
  const c = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const { predicted, actual } of pairs) {
    if (predicted && actual) c.tp++; else if (predicted) c.fp++; else if (actual) c.fn++; else c.tn++;
  }
  return c;
}
