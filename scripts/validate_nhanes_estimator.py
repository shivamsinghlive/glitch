"""
Cross-check the hand-written survey estimator in analyze_nhanes_menopause.py two independent ways:
  1. Prevalences and SEs vs the `samplics` survey library (Taylor linearisation, domain estimation).
  2. Regression SEs vs a delete-one-PSU jackknife (JKn) — a different variance method that should agree closely.

Usage
  .venv/bin/python scripts/validate_nhanes_estimator.py      # after analyze_nhanes_menopause.py has downloaded the data
Appends a validation section to docs/nhanes-menopause-report.md and writes models/nhanesValidation.json.
"""
from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import analyze_nhanes_menopause as A  # noqa: E402
from samplics.estimation import TaylorEstimator  # noqa: E402
from samplics.utils.types import PopParam  # noqa: E402

OUT = A.ROOT / "client" / "src" / "lib" / "models" / "nhanesValidation.json"


def prevalence_check(df, design, dom):
    rows = []
    for key, label, kind, _ in A.OUTCOMES:
        if kind != "binary":
            continue
        for status, v in (("pre", 0), ("post", 1)):
            m = dom & df[key].notna().to_numpy() & (df.post == v).to_numpy()
            ours = A.mean_ci(design, df[key].to_numpy(dtype=float), np.where(m, df.weight, 0.0))
            est = TaylorEstimator(PopParam.prop)
            # Domain estimation over the full design so out-of-domain PSUs still count
            est.estimate(y=df[key].fillna(0).to_numpy(), samp_weight=df.weight.to_numpy(), stratum=df.strata.to_numpy(), psu=df.psu.to_numpy(),
                         domain=np.where(m, "in", "out"), remove_nan=False)
            p = float(est.point_est["in"][1.0])
            se = float(est.stderror["in"][1.0])
            rows.append({"outcome": label, "group": status, "ours": ours["est"], "samplics": p, "oursSe": ours["se"], "samplicsSe": se})
    return rows


def jackknife_check(df, design, dom):
    rows = []
    strata = df.strata.to_numpy()
    psu = df.psu.to_numpy()
    for key, label, kind, _ in A.OUTCOMES:
        need = [key, "post"] + A.BASE_COVARS
        complete = dom & df[need].notna().all(axis=1).to_numpy()
        filled = df.copy()
        filled[need] = filled[need].fillna(0)
        X, _ = A.matrix(filled, A.BASE_COVARS)
        y = filled[key].to_numpy(dtype=float)
        w0 = np.where(complete, df.weight.to_numpy(), 0.0)
        beta, cov = A.fit(design, X, y, w0, kind == "binary")
        var = 0.0
        for h in np.unique(strata):
            psus = np.unique(psu[strata == h])
            nh = len(psus)
            thetas = []
            for j in psus:
                w = w0.copy()
                w[psu == j] = 0
                w[(strata == h) & (psu != j)] *= nh / (nh - 1)
                b, _ = A.fit(design, X, y, w, kind == "binary")
                thetas.append(b[1])
            thetas = np.array(thetas)
            var += (nh - 1) / nh * ((thetas - thetas.mean()) ** 2).sum()
        rows.append({"outcome": label, "estimate": float(beta[1]), "taylorSe": float(np.sqrt(cov[1, 1])), "jackknifeSe": float(np.sqrt(var))})
        print(f"{key:14s} Taylor SE {np.sqrt(cov[1, 1]):.4f}  jackknife SE {np.sqrt(var):.4f}")
    return rows


def main() -> None:
    df = A.load()
    design = A.Design(df)
    dom = df.in_domain.to_numpy()
    prev = prevalence_check(df, design, dom)
    jk = jackknife_check(df, design, dom)
    max_est = max(abs(r["ours"] - r["samplics"]) for r in prev)
    max_se = max(abs(r["oursSe"] / r["samplicsSe"] - 1) for r in prev)
    max_jk = max(abs(r["taylorSe"] / r["jackknifeSe"] - 1) for r in jk)
    summary = {
        "prevalenceMaxAbsDiff": max_est, "prevalenceSeMaxRelDiff": max_se, "regressionSeMaxRelDiffVsJackknife": max_jk,
        "verdict": ("Prevalences and their SEs match the independent samplics survey library exactly" if max_est < 1e-6 and max_se < 1e-4
                    else f"Prevalences match samplics within {max_est:.1e} (SEs within {100*max_se:.1f}%)")
                   + f"; regression SEs agree with a delete-one-PSU jackknife within {100*max_jk:.1f}%.",
    }
    print(summary["verdict"])
    OUT.write_text(json.dumps(A.r({"summary": summary, "prevalence": prev, "regression": jk}, 5), indent=2) + "\n")

    report = A.REPORT.read_text().split("\n## Estimator validation")[0].rstrip("\n")
    L = ["", "## Estimator validation", summary["verdict"], "", "| Outcome | Group | Ours | samplics | SE ours | SE samplics |", "|---|---|---|---|---|---|"]
    L += [f"| {r['outcome']} | {r['group']} | {r['ours']:.4f} | {r['samplics']:.4f} | {r['oursSe']:.4f} | {r['samplicsSe']:.4f} |" for r in prev]
    L += ["", "| Outcome | Coefficient | Taylor SE | Jackknife SE |", "|---|---|---|---|"]
    L += [f"| {r['outcome']} | {r['estimate']:.4f} | {r['taylorSe']:.4f} | {r['jackknifeSe']:.4f} |" for r in jk]
    A.REPORT.write_text(report + "\n" + "\n".join(L) + "\n")
    print(f"Wrote {OUT.relative_to(A.ROOT)} and updated {A.REPORT.relative_to(A.ROOT)}")


if __name__ == "__main__":
    main()
