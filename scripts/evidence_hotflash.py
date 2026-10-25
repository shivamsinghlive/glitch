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
            })
    aucs = [a["auc"] for a in audit if a["auc"] is not None]
    gaps = {}
    for attr in ("race", "education"):
        v = [a["auc"] for a in audit if a["attribute"] == attr and a["auc"] is not None]
        gaps[attr] = round(max(v) - min(v), 3)

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
            "groups": audit,
            "aucGapMax": gaps,
            "aucWithProtectedFeatures": round(mean_auc(y, with_prot), 3),
            "note": "Race and education are excluded from the model. Subgroup AUC and calibration are checked anyway. Subgroups are small, so differences are indicative, not conclusive.",
        },
        "labsAuc": round(mean_auc(y, oof_predictions(df, LAB_FEATURES)), 3),
    }
    EVIDENCE.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
