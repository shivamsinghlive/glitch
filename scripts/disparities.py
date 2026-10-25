"""
Who does this affect? Group disparities, measured on real public data. Race and ethnicity are used here
to MEASURE differences (fairness through awareness), not to score any individual.

1. TSHS (n=375): hot-flash prevalence by group, and the odds ratio for the African American group before
   and after adjusting for smoking, BMI, prior symptoms and age group (unpenalised logistic regression, Wald 95% CI).
2. NHANES 2017-18 (women 35-79): high blood pressure (>=130/80) and short sleep (<6 h) by race/ethnicity,
   survey-weighted and age-standardised to the overall female age mix, so group differences are not just age.

No region variable exists in either dataset, so we cannot study regions. Descriptive only: groups are proxies
for many things (income, access to care, discrimination), not biology.
Writes client/src/lib/models/disparities.json.  Usage: python3 scripts/disparities.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from nhanes_reference import BANDS, fetch  # noqa: E402
from train_hotflash_model import DATA  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "client" / "src" / "lib" / "models" / "disparities.json"


def wilson(k: float, n: float, z: float = 1.96) -> tuple[float, float]:
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return float(c - h), float(c + h)


def logit_fit(X: np.ndarray, y: np.ndarray):
    w = np.zeros(X.shape[1])
    for _ in range(100):
        p = 1 / (1 + np.exp(-X @ w))
        H = X.T @ (X * (p * (1 - p))[:, None])
        step = np.linalg.solve(H, X.T @ (p - y))
        w -= step
        if np.max(np.abs(step)) < 1e-10:
            break
    cov = np.linalg.inv(X.T @ (X * (p * (1 - p))[:, None]))
    return w, np.sqrt(np.diag(cov))


def tshs() -> dict:
    d = pd.read_excel(DATA).dropna(subset=["aagrp", "hotflash", "f1a", "bmi30", "d1", "ageg"])
    y = d["hotflash"].to_numpy(float)
    g = d["aagrp"].to_numpy(float)
    rows = []
    for val, name in ((1, "African American"), (0, "Not African American")):
        m = g == val
        lo, hi = wilson(y[m].sum(), m.sum())
        rows.append({"group": name, "n": int(m.sum()), "prevalence": round(float(y[m].mean()), 3), "ci": [round(lo, 3), round(hi, 3)]})
    X1 = np.column_stack([np.ones(len(d)), g])
    X2 = np.column_stack([np.ones(len(d)), g, d["f1a"], d["bmi30"], d["d1"], d["ageg"]])
    out = {}
    for key, X in (("crude", X1), ("adjusted", X2)):
        w, se = logit_fit(X, y)
        out[key] = {"or": round(float(np.exp(w[1])), 2), "ci": [round(float(np.exp(w[1] - 1.96 * se[1])), 2), round(float(np.exp(w[1] + 1.96 * se[1])), 2)]}
    return {"n": int(len(d)), "groups": rows, "oddsRatioAfricanAmerican": out, "adjustedFor": ["smoking", "BMI 30+", "earlier menopausal symptoms", "age group"]}


GROUPS = {1: "Mexican American", 2: "Other Hispanic", 3: "White (non-Hispanic)", 4: "Black (non-Hispanic)", 6: "Asian (non-Hispanic)", 7: "Other or multiracial"}


def nhanes() -> dict:
    demo, bp, sl = fetch("DEMO_J"), fetch("BPX_J"), fetch("SLQ_J")
    d = demo[(demo["RIAGENDR"] == 2) & demo["RIDAGEYR"].between(35, 79)][["SEQN", "RIDAGEYR", "RIDRETH3", "WTMEC2YR"]]
    bp = bp.copy()
    bp["sys"] = bp[["BPXSY2", "BPXSY3"]].mean(axis=1).fillna(bp["BPXSY1"])
    bp["dia"] = bp[["BPXDI2", "BPXDI3"]].mean(axis=1).fillna(bp["BPXDI1"])
    bp.loc[bp["dia"] <= 0, "dia"] = np.nan
    m = d.merge(bp[["SEQN", "sys", "dia"]], on="SEQN", how="left").merge(sl[["SEQN", "SLD012"]], on="SEQN", how="left")
    m["band"] = pd.cut(m["RIDAGEYR"], [34, 44, 54, 64, 79], labels=False)
    m["hbp"] = ((m["sys"] >= 130) | (m["dia"] >= 80)).astype(float).where(m["sys"].notna() & m["dia"].notna())
    m["short"] = (m["SLD012"] < 6).astype(float).where(m["SLD012"].notna())
    std = m.groupby("band")["WTMEC2YR"].sum() / m["WTMEC2YR"].sum()  # overall age mix for standardisation

    def rate(g: pd.DataFrame, col: str) -> tuple[float, float, int]:
        g = g.dropna(subset=[col])
        if len(g) == 0:
            return float("nan"), float("nan"), 0
        total, var = 0.0, 0.0
        for b, share in std.items():
            gb = g[g["band"] == b]
            if len(gb) == 0:
                continue
            p = np.average(gb[col], weights=gb["WTMEC2YR"])
            neff = gb["WTMEC2YR"].sum() ** 2 / (gb["WTMEC2YR"] ** 2).sum()  # Kish effective n
            total += share * p
            var += share**2 * p * (1 - p) / max(neff, 1)
        return float(total), float(1.96 * np.sqrt(var)), int(len(g))

    rows = []
    for code, name in GROUPS.items():
        g = m[m["RIDRETH3"] == code]
        hp, hp_e, hn = rate(g, "hbp")
        sp, sp_e, sn = rate(g, "short")
        rows.append({
            "group": name, "n": int(len(g)), "nBp": hn,
            "highBp": round(hp, 3), "highBpCi": round(hp_e, 3),
            "shortSleep": round(sp, 3), "shortSleepCi": round(sp_e, 3),
            "smallSample": bool(hn < 100),
        })
    return {"source": "NHANES 2017-18, women 35-79, survey-weighted, age-standardised", "groups": rows}


def main() -> None:
    out = {"tshs": tshs(), "nhanes": nhanes(),
           "caveats": ["Groups stand in for income, access to care, stress and discrimination, not biology.", "No region variable exists in these datasets.", "Confidence intervals for NHANES are approximate (effective sample size), not full survey-design variance."]}
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    t = out["tshs"]
    print("TSHS", t["groups"], t["oddsRatioAfricanAmerican"])
    for r in out["nhanes"]["groups"]:
        print(f'{r["group"]:24s} n={r["n"]:4d} highBP {r["highBp"]*100:4.1f}% ±{r["highBpCi"]*100:3.1f}  short sleep {r["shortSleep"]*100:4.1f}% ±{r["shortSleepCi"]*100:3.1f} {"(small)" if r["smallSample"] else ""}')


if __name__ == "__main__":
    main()
