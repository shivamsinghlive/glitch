"""
Train Glitch's educational hot-flash risk model.

Data: TSHS "Hot Flashes" dataset (Grau, Okungu & Sammel, 2023; baseline data from Freeman et al., 2001),
375 women aged 35-48, self-reported hot flashes in the past month. CC BY-NC-SA 4.0, educational use.
https://www.causeweb.org/tshs/hot-flashes/

The TSHS use agreement says inferences beyond the original study are not valid estimates, so the app
labels this as an *educational* risk indicator, never a prediction for an individual.

Fairness choice: race and education are in the dataset but are deliberately NOT used as features.
The raw data is downloaded to scripts/data/ (git-ignored) and never committed; only fitted
coefficients and evaluation metrics are written to the app.

Evaluation (written to "evaluation" in the JSON, for both feature sets): logistic regression vs a small
gradient-boosting model vs an intercept-only baseline on identical repeated stratified folds; bootstrap
95% CIs on out-of-fold AUC; out-of-fold calibration (Brier, slope/intercept, reliability bins); and a
fairness audit of out-of-fold performance by race and education. Race/education are used ONLY to
slice the evaluation, never as model inputs.

Usage:
    python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
    .venv/bin/python scripts/train_hotflash_model.py
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "scripts" / "data" / "hflash.xlsx"
OUT = ROOT / "client" / "src" / "lib" / "models" / "hotflashRisk.json"
URL = "https://causeweb.org/tshs/datasets/hflash.xlsx"

SEED = 7
FOLDS, REPEATS, BOOT = 5, 20, 2000
MIN_N, MIN_POS = 30, 10  # suppress subgroup metrics below these counts

BASE_FEATURES = ["age_group", "smoker", "bmi30", "prior_symptoms"]
LAB_FEATURES = BASE_FEATURES + ["log_fsh", "log_estradiol"]


def load() -> pd.DataFrame:
    if not DATA.exists():
        DATA.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {URL}")
        urllib.request.urlretrieve(URL, DATA)
    d = pd.read_excel(DATA)
    return pd.DataFrame({
        "age_group": d["ageg"].astype(float),            # 1=35-39, 2=40-44, 3=45-48
        "smoker": d["f1a"].astype(float),
        "bmi30": d["bmi30"].astype(float),
        "prior_symptoms": d["d1"].astype(float),
        "log_fsh": np.log(d["fsh"].astype(float)),
        "log_estradiol": np.log(d["estra"].astype(float)),
        "y": d["hotflash"].astype(float),
        # Audit-only columns (codebook: aagrp 0=Caucasian 1=African American; edu 0=<HS 1=>=HS). Never features.
        "race": d["aagrp"].map({0: "Caucasian", 1: "African American"}),
        "education": d["edu"].map({0: "Less than high school", 1: "High school or more"}),
    }).dropna()


def fit_logistic(X: np.ndarray, y: np.ndarray, l2: float = 1.0, iters: int = 50, offset: np.ndarray | None = None) -> np.ndarray:
    """Ridge-penalised logistic regression via Newton/IRLS. Intercept (column 0) is not penalised."""
    w = np.zeros(X.shape[1])
    off = np.zeros(len(y)) if offset is None else offset
    penalty = np.eye(X.shape[1]) * l2
    penalty[0, 0] = 0.0
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(X @ w + off)))
        grad = X.T @ (p - y) + penalty @ w
        H = X.T @ (X * (p * (1 - p))[:, None]) + penalty
        step = np.linalg.solve(H, grad)
        w -= step
        if np.max(np.abs(step)) < 1e-8:
            break
    return w


def auc(y: np.ndarray, s: np.ndarray) -> float:
    """Rank-based ROC AUC (Mann-Whitney)."""
    order = np.argsort(s)
    ranks = np.empty(len(s))
    ranks[order] = np.arange(1, len(s) + 1)
    # average ranks for ties
    for v in np.unique(s):
        idx = s == v
        ranks[idx] = ranks[idx].mean()
    pos = y == 1
    n1, n0 = pos.sum(), (~pos).sum()
    return float((ranks[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def standardise(df: pd.DataFrame, feats: list[str]):
    mu = df[feats].mean()
    sd = df[feats].std(ddof=0).replace(0, 1)
    X = ((df[feats] - mu) / sd).to_numpy()
    return np.column_stack([np.ones(len(X)), X]), mu, sd


def fold_assignments(y: np.ndarray, folds: int = FOLDS, repeats: int = REPEATS, seed: int = SEED) -> list[np.ndarray]:
    """Repeated stratified fold labels (one array per repeat), shared by every model compared."""
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(repeats):
        fold = np.empty(len(y), dtype=int)
        for cls in (0, 1):
            idx = np.where(y == cls)[0]
            rng.shuffle(idx)
            fold[idx] = np.arange(len(idx)) % folds
        out.append(fold)
    return out


def predict_logistic(tr: pd.DataFrame, te: pd.DataFrame, feats: list[str]) -> np.ndarray:
    Xtr, mu, sd = standardise(tr, feats)
    w = fit_logistic(Xtr, tr["y"].to_numpy())
    Xte = np.column_stack([np.ones(len(te)), ((te[feats] - mu) / sd).to_numpy()])
    return 1 / (1 + np.exp(-Xte @ w))


def predict_boosting(tr: pd.DataFrame, te: pd.DataFrame, feats: list[str]) -> np.ndarray:
    """Small, regularised gradient boosting (shallow trees, big leaves, slow learning rate)."""
    gb = HistGradientBoostingClassifier(max_depth=2, max_iter=100, learning_rate=0.05, min_samples_leaf=20,
                                        l2_regularization=1.0, early_stopping=False, random_state=SEED)
    gb.fit(tr[feats].to_numpy(), tr["y"].to_numpy())
    return gb.predict_proba(te[feats].to_numpy())[:, 1]


def predict_baseline(tr: pd.DataFrame, te: pd.DataFrame, feats: list[str]) -> np.ndarray:
    """Intercept-only: everyone gets the training-fold prevalence."""
    return np.full(len(te), tr["y"].mean())


MODELS = {"logisticRegression": predict_logistic, "gradientBoosting": predict_boosting, "interceptOnly": predict_baseline}


def cross_validate(df: pd.DataFrame, feats: list[str], predict, folds_list: list[np.ndarray]) -> tuple[list[float], np.ndarray]:
    """Per-fold AUCs, plus out-of-fold probabilities averaged over the repeats (one per person)."""
    y_all = df["y"].to_numpy()
    scores, oof = [], np.zeros((len(folds_list), len(df)))
    for r, fold in enumerate(folds_list):
        for k in np.unique(fold):
            tr, te = df[fold != k], df[fold == k]
            p = predict(tr, te, feats)
            oof[r, fold == k] = p
            scores.append(auc(y_all[fold == k], p))
    return scores, oof.mean(axis=0)


def cross_validated_auc(df: pd.DataFrame, feats: list[str], folds: int = FOLDS, repeats: int = REPEATS, seed: int = SEED) -> tuple[float, float]:
    scores, _ = cross_validate(df, feats, predict_logistic, fold_assignments(df["y"].to_numpy(), folds, repeats, seed))
    return float(np.mean(scores)), float(np.std(scores))


def bootstrap_idx(n: int, seed: int = SEED, b: int = BOOT) -> np.ndarray:
    """Fixed bootstrap resamples (rows = resamples), reused so paired comparisons line up."""
    return np.random.default_rng(seed).integers(0, n, size=(b, n))


def boot_auc(y: np.ndarray, p: np.ndarray, idx: np.ndarray) -> np.ndarray:
    return np.array([auc(y[i], p[i]) for i in idx if 0 < y[i].sum() < len(i)])


def ci(x: np.ndarray) -> list[float]:
    return [round(float(np.percentile(x, 2.5)), 3), round(float(np.percentile(x, 97.5)), 3)]


def calibration(y: np.ndarray, p: np.ndarray, bins: int = 5) -> dict:
    """Brier score, logistic recalibration slope/intercept, and an equal-count reliability table."""
    lp = np.log(np.clip(p, 1e-6, 1 - 1e-6) / (1 - np.clip(p, 1e-6, 1 - 1e-6)))
    a, b = fit_logistic(np.column_stack([np.ones(len(y)), lp]), y, l2=0.0)               # logit(y) = a + b*lp
    a0 = fit_logistic(np.ones((len(y), 1)), y, l2=0.0, offset=lp)[0]                      # slope fixed at 1
    order = np.argsort(p, kind="stable")
    table = [{"bin": i + 1, "n": int(len(ix)), "meanPredicted": round(float(p[ix].mean()), 3), "observed": round(float(y[ix].mean()), 3)}
             for i, ix in enumerate(np.array_split(order, bins))]
    return {
        "brier": round(float(np.mean((p - y) ** 2)), 4),
        "brierBaseline": round(float(np.mean((y.mean() - y) ** 2)), 4),
        "slope": round(float(b), 3),
        "intercept": round(float(a0), 3),
        "recalibrationIntercept": round(float(a), 3),
        "reliability": table,
    }


def subgroup(y: np.ndarray, p: np.ndarray, seed: int) -> dict:
    """Out-of-fold metrics for one subgroup, suppressed when too small to be meaningful."""
    n, pos = len(y), int(y.sum())
    row = {"n": n, "positives": pos, "prevalence": round(float(y.mean()), 3)}
    if n < MIN_N or pos < MIN_POS or n - pos < MIN_POS:
        return row | {"auc": None, "aucCi95": None, "meanPredicted": None, "observed": None, "observedMinusPredicted": None, "gapCi95": None, "suppressed": True}
    idx = bootstrap_idx(n, seed)
    gaps = np.array([y[i].mean() - p[i].mean() for i in idx])
    return row | {
        "auc": round(auc(y, p), 3), "aucCi95": ci(boot_auc(y, p, idx)),
        "meanPredicted": round(float(p.mean()), 3), "observed": round(float(y.mean()), 3),
        "observedMinusPredicted": round(float(y.mean() - p.mean()), 3), "gapCi95": ci(gaps), "suppressed": False,
    }


def overlap(a: list[float] | None, b: list[float] | None) -> bool:
    return a is None or b is None or (a[0] <= b[1] and b[0] <= a[1])


def fairness_finding(attr: str, groups: dict) -> str:
    """Plain-language summary written from the numbers (cautious: small n, wide intervals)."""
    shown = {g: m for g, m in groups.items() if not m["suppressed"]}
    hidden = [g for g, m in groups.items() if m["suppressed"]]
    parts = []
    if len(shown) >= 2:
        aucs = "; ".join(f"{g} {m['auc']:.2f} (95% CI {m['aucCi95'][0]:.2f}-{m['aucCi95'][1]:.2f}, n={m['n']})" for g, m in shown.items())
        cis = [m["aucCi95"] for m in shown.values()]
        same = all(overlap(x, y) for i, x in enumerate(cis) for y in cis[i + 1:])
        parts.append(f"By {attr}, out-of-fold AUC was {aucs}. " + (
            "The intervals overlap, so this sample cannot show a reliable difference in ranking performance (it also cannot rule one out)."
            if same else "The intervals do not overlap, suggesting ranking performance genuinely differs between groups."))
        prev = sorted(shown.items(), key=lambda kv: kv[1]["prevalence"])
        parts.append(f"Observed hot-flash prevalence ranged from {prev[0][1]['prevalence']:.0%} ({prev[0][0]}) to {prev[-1][1]['prevalence']:.0%} ({prev[-1][0]}).")
        chance = [g for g, m in shown.items() if m["aucCi95"][0] <= 0.5]
        if chance:
            parts.append(f"For {', '.join(chance)} the AUC interval includes 0.5, so better-than-chance ranking is not established for that group.")
        for g, m in shown.items():
            lo, hi = m["gapCi95"]
            if lo > 0:
                parts.append(f"For {g} women the model under-predicts: average predicted {m['meanPredicted']:.0%} vs observed {m['observed']:.0%} (gap CI {lo:+.2f} to {hi:+.2f}).")
            elif hi < 0:
                parts.append(f"For {g} women the model over-predicts: average predicted {m['meanPredicted']:.0%} vs observed {m['observed']:.0%} (gap CI {lo:+.2f} to {hi:+.2f}).")
        if not any(m["gapCi95"][0] > 0 or m["gapCi95"][1] < 0 for m in shown.values()):
            parts.append("Average predicted and observed rates agree within sampling error for every reported group.")
    if hidden:
        parts.append(f"Metrics suppressed for {', '.join(hidden)} (n<{MIN_N} or <{MIN_POS} events).")
    return " ".join(parts)


def fairness_summary(groups: dict) -> str:
    """One-line version of the finding for compact UI display."""
    shown = {g: m for g, m in groups.items() if not m["suppressed"]}
    if len(shown) < 2:
        return "Too few women per group to report (metrics suppressed)."
    aucs = " vs ".join(f"{m['auc']:.2f} ({g})" for g, m in shown.items())
    cis = [m["aucCi95"] for m in shown.values()]
    same = all(overlap(x, y) for i, x in enumerate(cis) for y in cis[i + 1:])
    calibrated = all(m["gapCi95"][0] <= 0 <= m["gapCi95"][1] for m in shown.values())
    return (f"AUC {aucs}; " + ("intervals overlap, no reliable gap detected at this sample size" if same else "intervals do not overlap")
            + ("; predicted rates match observed rates in each group." if calibrated else "; average predicted rates miss the observed rate for at least one group."))


def evaluate(df: pd.DataFrame, feats: list[str]) -> dict:
    """Model comparison, AUC uncertainty, calibration and fairness audit on shared out-of-fold predictions."""
    y = df["y"].to_numpy()
    folds_list = fold_assignments(y)
    idx = bootstrap_idx(len(y))
    runs = {name: cross_validate(df, feats, fn, folds_list) for name, fn in MODELS.items()}
    boots = {name: boot_auc(y, oof, idx) for name, (_, oof) in runs.items()}
    comparison = {name: {
        "cvAucMean": round(float(np.mean(sc)), 3), "cvAucSd": round(float(np.std(sc)), 3),
        "oofAuc": round(auc(y, oof), 3), "oofAucCi95": ci(boots[name]),
    } for name, (sc, oof) in runs.items()}
    # Paired bootstrap of the AUC difference (same resamples for both models)
    diff = boots["logisticRegression"] - boots["gradientBoosting"]
    comparison["lrMinusGbAuc"] = {"estimate": round(comparison["logisticRegression"]["oofAuc"] - comparison["gradientBoosting"]["oofAuc"], 3), "ci95": ci(diff)}
    lr, gb, d = comparison["logisticRegression"], comparison["gradientBoosting"], comparison["lrMinusGbAuc"]
    gb_better, lr_better = d["ci95"][1] < 0, d["ci95"][0] > 0
    comparison["rationale"] = (
        f"Logistic regression out-of-fold AUC {lr['oofAuc']:.3f} (95% CI {lr['oofAucCi95'][0]:.3f}-{lr['oofAucCi95'][1]:.3f}) vs "
        f"gradient boosting {gb['oofAuc']:.3f} ({gb['oofAucCi95'][0]:.3f}-{gb['oofAucCi95'][1]:.3f}); paired difference "
        f"{d['estimate']:+.3f} (95% CI {d['ci95'][0]:+.3f} to {d['ci95'][1]:+.3f}). "
        + ("Boosting is reliably better here, so keeping logistic regression trades some accuracy for interpretability. "
           if gb_better else "Logistic regression is reliably better here; boosting appears to overfit the small sample. "
           if lr_better else "The interval includes zero, so the two are comparable and boosting gives no reliable gain. ")
        + "Logistic regression is kept because each factor maps to a readable odds ratio shown to the user, it runs as a few "
        f"coefficients on-device, and it is less prone to overfitting {len(y)} rows. Both beat the intercept-only baseline "
        f"(per-fold AUC {comparison['interceptOnly']['cvAucMean']:.2f}; its pooled OOF AUC sits slightly below 0.5 because each "
        "held-out fold's prevalence is anti-correlated with the training-fold prevalence it is given)."
    )
    p = runs["logisticRegression"][1]
    fairness = {"note": f"Race and education are not model inputs; they are used only to audit out-of-fold logistic-regression predictions. "
                        f"Metrics are suppressed (null) when a group has n<{MIN_N} or fewer than {MIN_POS} events/non-events."}
    for attr, seed in (("race", SEED + 1), ("education", SEED + 2)):
        groups = {str(g): subgroup(y[(df[attr] == g).to_numpy()], p[(df[attr] == g).to_numpy()], seed) for g in sorted(df[attr].unique())}
        fairness[attr] = {"groups": groups, "finding": fairness_finding(attr, groups), "summary": fairness_summary(groups)}
    return {"comparison": comparison, "calibration": calibration(y, p), "fairness": fairness}


def train(df: pd.DataFrame, feats: list[str]) -> dict:
    X, mu, sd = standardise(df, feats)
    w = fit_logistic(X, df["y"].to_numpy())
    cv_mean, cv_sd = cross_validated_auc(df, feats)
    # Odds ratio per 1 unit (binary features) / per 1 SD (continuous)
    return {
        "features": feats,
        "intercept": round(float(w[0]), 5),
        "coefficients": {f: round(float(c), 5) for f, c in zip(feats, w[1:])},
        "mean": {f: round(float(mu[f]), 5) for f in feats},
        "scale": {f: round(float(sd[f]), 5) for f in feats},
        "oddsRatioPerUnit": {f: round(float(np.exp(c / sd[f])), 2) for f, c in zip(feats, w[1:])},
        "cvAuc": round(cv_mean, 3),
        "cvAucSd": round(cv_sd, 3),
    }


def main() -> None:
    df = load()
    model = {
        "name": "Educational hot-flash risk indicator",
        "trainedOn": "TSHS Hot Flashes dataset (Freeman et al., 2001 baseline), n=%d women aged 35-48" % len(df),
        "citation": "Grau L, Okungu X, Sammel MD. \"Hot Flashes Dataset\", TSHS Resources Portal (2023). https://www.causeweb.org/tshs/hot-flashes/",
        "license": "CC BY-NC-SA 4.0 (educational use)",
        "outcome": "Self-reported hot flashes in the past month",
        "prevalence": round(float(df["y"].mean()), 3),
        "excludedFeatures": ["race", "education"],
        "caveat": "Educational indicator from a small 2001 cohort of late-reproductive-age women; not a validated prediction for any individual.",
        "base": train(df, BASE_FEATURES),
        "withLabs": train(df, LAB_FEATURES),
        "evaluation": {
            "method": (f"Repeated stratified {FOLDS}-fold CV ({REPEATS} repeats, seed {SEED}); all models share the same folds. "
                       f"cvAucMean/Sd summarise the {FOLDS * REPEATS} per-fold AUCs. Out-of-fold (OOF) probabilities are averaged over "
                       f"the {REPEATS} repeats to give one held-out prediction per woman; oofAuc, calibration and fairness use these, "
                       f"with 95% CIs from {BOOT} bootstrap resamples of women (percentile method). Calibration slope/recalibration "
                       f"intercept come from regressing the outcome on logit(OOF probability); 'intercept' fixes the slope at 1 "
                       f"(calibration-in-the-large). Reliability table uses {5} equal-count bins."),
        },
    }
    for k, feats in (("base", BASE_FEATURES), ("withLabs", LAB_FEATURES)):
        ev = evaluate(df, feats)
        for section, value in ev.items():
            model["evaluation"].setdefault(section, {})[k] = value
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(model, indent=2) + "\n")
    for k in ("base", "withLabs"):
        m = model[k]
        print(f"{k:9s} CV AUC {m['cvAuc']:.3f} ± {m['cvAucSd']:.3f}  OR/unit {m['oddsRatioPerUnit']}")
        ev = model["evaluation"]
        for name in MODELS:
            c = ev["comparison"][k][name]
            print(f"    {name:20s} CV {c['cvAucMean']:.3f} ± {c['cvAucSd']:.3f}  OOF {c['oofAuc']:.3f} {c['oofAucCi95']}")
        cal = ev["calibration"][k]
        print(f"    LR-GB {ev['comparison'][k]['lrMinusGbAuc']}  Brier {cal['brier']} (baseline {cal['brierBaseline']})  slope {cal['slope']}  intercept {cal['intercept']}")
        for attr in ("race", "education"):
            for g, r in ev["fairness"][k][attr]["groups"].items():
                print(f"    {attr:9s} {g:24s} {r}")
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
