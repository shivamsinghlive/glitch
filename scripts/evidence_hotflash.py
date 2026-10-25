"""
Evidence for the hot-flash risk model: fairness audit, calibration, uncertainty and baseline.

Reuses the exact training code in train_hotflash_model.py (TSHS Hot Flashes dataset, n=375).
Race (aagrp) and education (edu) are NOT model features. This script checks whether the model
nevertheless performs differently for those groups, and whether adding them would have helped.

Writes client/src/lib/models/hotflashEvidence.json (aggregate metrics only, no raw rows).
Usage: python3 scripts/evidence_hotflash.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from train_hotflash_model import BASE_FEATURES, DATA, LAB_FEATURES, OUT, auc, fit_logistic, load, standardise  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "client" / "src" / "lib" / "models" / "hotflashEvidence.json"
SEED, FOLDS, REPEATS, BOOT = 7, 5, 20, 2000


def groups() -> pd.DataFrame:
    raw = pd.read_excel(DATA)
    keep = pd.DataFrame({"aagrp": raw["aagrp"], "edu": raw["edu"]})
    return keep.loc[load().index]  # same rows as the training frame (after dropna)


def oof_predictions(df: pd.DataFrame, feats: list[str], extra: pd.DataFrame | None = None):
    """Out-of-fold probabilities for every row, one vector per CV repeat."""
    rng = np.random.default_rng(SEED)
    y = df["y"].to_numpy()
    work = df.copy()
    if extra is not None:
        for c in extra.columns:
            work[c] = extra[c].astype(float)
        feats = feats + list(extra.columns)
    out = []
    for _ in range(REPEATS):
        fold = np.empty(len(work), dtype=int)
        for cls in (0, 1):
            idx = np.where(y == cls)[0]
            rng.shuffle(idx)
            fold[idx] = np.arange(len(idx)) % FOLDS
        p = np.empty(len(work))
        for k in range(FOLDS):
            tr, te = work[fold != k], work[fold == k]
            Xtr, mu, sd = standardise(tr, feats)
            w = fit_logistic(Xtr, tr["y"].to_numpy())
            Xte = np.column_stack([np.ones(len(te)), ((te[feats] - mu) / sd).to_numpy()])
            p[fold == k] = 1 / (1 + np.exp(-(Xte @ w)))
        out.append(p)
    return np.array(out)


def mean_auc(y, preds, mask=None) -> float | None:
    m = np.ones(len(y), bool) if mask is None else mask
    if len(set(y[m])) < 2:
        return None
    return float(np.mean([auc(y[m], p[m]) for p in preds]))


def cls_metrics(y: np.ndarray, flag: np.ndarray) -> dict:
    """Confusion matrix and the standard scores for a yes/no call."""
    tp = int(((flag == 1) & (y == 1)).sum()); fp = int(((flag == 1) & (y == 0)).sum())
    fn = int(((flag == 0) & (y == 1)).sum()); tn = int(((flag == 0) & (y == 0)).sum())
    n = tp + fp + fn + tn
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    spec = tn / (tn + fp) if tn + fp else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    denom = np.sqrt(float(tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
    mcc = (tp * tn - fp * fn) / denom if denom else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn, "accuracy": round((tp + tn) / n, 3), "precision": round(prec, 3),
            "recall": round(rec, 3), "specificity": round(spec, 3), "f1": round(f1, 3), "balancedAccuracy": round((rec + spec) / 2, 3), "mcc": round(float(mcc), 3)}


def average_precision(y: np.ndarray, s: np.ndarray) -> float:
    order = np.argsort(-s)
    yy = y[order]
    tp = np.cumsum(yy)
    precision = tp / (np.arange(len(yy)) + 1)
    return float((precision * yy).sum() / yy.sum())


def profile(df: pd.DataFrame, mask: np.ndarray) -> dict:
    d = df[mask]
    if len(d) == 0:
        return {}
    return {"n": int(len(d)), "priorSymptoms": round(float(d["prior_symptoms"].mean()), 2), "bmi30": round(float(d["bmi30"].mean()), 2),
            "smoker": round(float(d["smoker"].mean()), 2), "ageGroup3": round(float((d["age_group"] == 3).mean()), 2)}


def classification_report(df: pd.DataFrame, y: np.ndarray, pbar: np.ndarray, thr: float, auc_value: float) -> tuple[dict, dict]:
    flag = (pbar >= thr).astype(int)
    model = cls_metrics(y, flag)
    model["auc"] = round(auc_value, 3)
    model["prAuc"] = round(average_precision(y, pbar), 3)
    model["logLoss"] = round(float(-np.mean(y * np.log(np.clip(pbar, 1e-6, 1)) + (1 - y) * np.log(np.clip(1 - pbar, 1e-6, 1)))), 3)
    baselines = {
        "alwaysNo": cls_metrics(y, np.zeros_like(y, dtype=int)),
        "alwaysYes": cls_metrics(y, np.ones_like(y, dtype=int)),
        "priorSymptomsOnly": cls_metrics(y, df["prior_symptoms"].to_numpy().astype(int)),
    }
    sweep = []
    for t in (0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6):
        m = cls_metrics(y, (pbar >= t).astype(int))
        sweep.append({"threshold": t, **{k: m[k] for k in ("precision", "recall", "f1", "accuracy", "specificity")}, "flagRate": round(float((pbar >= t).mean()), 3)})
    yb = y.astype(bool)
    errors = {
        "caught": profile(df, (flag == 1) & yb), "missed": profile(df, (flag == 0) & yb),
        "falseAlarms": profile(df, (flag == 1) & ~yb), "correctNegatives": profile(df, (flag == 0) & ~yb),
        "missedWithoutPriorSymptoms": {"share": round(float(((df["prior_symptoms"] == 0) & (flag == 0) & yb).sum() / max(1, ((flag == 0) & yb).sum())), 2)},
    }
    return {"threshold": round(thr, 3), "model": model, "baselines": baselines, "sweep": sweep}, errors


def main() -> None:
    df = load().reset_index(drop=True)
    g = groups().reset_index(drop=True)
    y = df["y"].to_numpy()
    preds = oof_predictions(df, BASE_FEATURES)
    pbar = preds.mean(axis=0)

    # Uncertainty: bootstrap the pooled out-of-fold score
    rng = np.random.default_rng(SEED)
    boots = []
    for _ in range(BOOT):
        i = rng.integers(0, len(y), len(y))
        if len(set(y[i])) == 2:
            boots.append(auc(y[i], pbar[i]))
    ci = [round(float(np.percentile(boots, 2.5)), 3), round(float(np.percentile(boots, 97.5)), 3)]

    # Fairness audit by race and education (neither is a feature)
    audit = []
    thr = float(y.mean())  # decision threshold = base rate: "flag as higher than average"
    def rates(mask):
        flag = pbar >= thr
        pos, neg = mask & (y == 1), mask & (y == 0)
        return {
            "flagRate": round(float(flag[mask].mean()), 3),
            "tpr": round(float(flag[pos].mean()), 3) if pos.sum() else None,
            "fpr": round(float(flag[neg].mean()), 3) if neg.sum() else None,
        }
    for col, labels in (("aagrp", {0: "Not African American", 1: "African American"}), ("edu", {0: "Lower education", 1: "Higher education"})):
        for val, name in labels.items():
            mask = (g[col] == val).to_numpy()
            audit.append({
                "attribute": "race" if col == "aagrp" else "education",
                "group": name,
                "n": int(mask.sum()),
                "observedRate": round(float(y[mask].mean()), 3),
                "meanPredicted": round(float(pbar[mask].mean()), 3),
                "auc": None if (a := mean_auc(y, preds, mask)) is None else round(a, 3),
                **rates(mask),
            })
    aucs = [a["auc"] for a in audit if a["auc"] is not None]
    gaps = {}
    for attr in ("race", "education"):
        v = [a["auc"] for a in audit if a["attribute"] == attr and a["auc"] is not None]
        gaps[attr] = round(max(v) - min(v), 3)

    for attr in ("race", "education"):
        rows = [a for a in audit if a["attribute"] == attr]
        gaps[attr + "Tpr"] = round(max(a["tpr"] for a in rows) - min(a["tpr"] for a in rows), 3)
        gaps[attr + "Fpr"] = round(max(a["fpr"] for a in rows) - min(a["fpr"] for a in rows), 3)
    # Would including the protected attributes have helped?
    with_prot = oof_predictions(df, BASE_FEATURES, g[["aagrp", "edu"]])
    # Calibration by decile of predicted risk
    order = np.argsort(pbar)
    bins = []
    for chunk in np.array_split(order, 5):
        bins.append({"predicted": round(float(pbar[chunk].mean()), 3), "observed": round(float(y[chunk].mean()), 3), "n": int(len(chunk))})
    brier = float(np.mean((pbar - y) ** 2))
    brier_base = float(np.mean((y.mean() - y) ** 2))

    result = {
        "dataset": "TSHS Hot Flashes (n=%d)" % len(df),
        "cvScheme": f"{FOLDS}-fold stratified, repeated {REPEATS} times",
        "auc": round(mean_auc(y, preds), 3),
        "aucBootstrap95": ci,
        "baselineAuc": 0.5,
        "brier": round(brier, 3),
        "brierBaseline": round(brier_base, 3),
        "calibration": bins,
        "fairness": {
            "protectedFeaturesUsed": False,
            "decisionThreshold": round(thr, 3),
            "groups": audit,
            "aucGapMax": gaps,
            "aucWithProtectedFeatures": round(mean_auc(y, with_prot), 3),
            "note": "Race and education are excluded from the model. Subgroup AUC and calibration are checked anyway. Subgroups are small, so differences are indicative, not conclusive.",
        },
        "labsAuc": round(mean_auc(y, oof_predictions(df, LAB_FEATURES)), 3),
    }
    cls, errs = classification_report(df, y, pbar, thr, mean_auc(y, preds))
    cls["baselines"]["priorSymptomsOnly"]["auc"] = round((cls["baselines"]["priorSymptomsOnly"]["recall"] + cls["baselines"]["priorSymptomsOnly"]["specificity"]) / 2, 3)
    result["classification"] = cls
    result["errorAnalysis"] = errs
    EVIDENCE.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
