"""
Glitch: how do mood and sleep differ across reproductive life stages in US women aged 20–59?

Population analysis of NHANES 2013–2018 (CDC/NCHS, public domain). Reuses the survey machinery in
analyze_nhanes_menopause.py (Taylor-linearised design-based variance, weighted GLM, BH-FDR).

Stages (mutually exclusive, assigned in this order)
- pregnant        RIDEXPRG == 1 (DEMO; positive urine test or self-report; only defined for ages 20–44)
- breastfeeding   RHQ200 == 1 "now breastfeeding a child". This is a postpartum PROXY: NHANES has no
                  direct postpartum flag. RHQ200 is only asked of women with a birth in the past ~2 years
                  (RHQ197 = months since that birth).
- surgical        RHD043 == 3 (hysterectomy) or RHQ305 == 1 (both ovaries removed): excluded
- post            RHQ031 == 2 and RHD043 == 7: no period in 12 months because of menopause
- cycling         RHQ031 == 1: had regular periods in the past 12 months (reference group)
- everything else (pregnancy status could not be determined [RIDEXPRG == 3], no period for another
  reason, missing RHQ) is excluded and counted in the flow table.

Outcomes: PHQ-9 ≥ 10, PHQ-9 score, ever told a doctor about trouble sleeping (SLQ050), short sleep < 7 h
(SLD010H in 2013–14; SLD012 weekday/workday sleep in 2015–18).

Model: outcome ~ stage dummies (vs cycling) + age + age² + current smoking, survey-weighted. Sensitivity:
+ BMI (distorted in pregnancy, so not in the main model); age-matched domains (20–44 for pregnant /
breastfeeding, 40–59 for post-menopause); "gave birth in the past 12 months" as an alternative postpartum
proxy. BH-FDR across the main-model stage × outcome contrasts. Cells with n < 30 or < 10 events (or
non-events) are suppressed.

Usage
  .venv/bin/python scripts/analyze_nhanes_lifestages.py

Writes client/src/lib/models/nhanesLifeStages.json (aggregates only) and docs/nhanes-lifestages-report.md.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze_nhanes_menopause import CYCLES, Design, bh, download, fit, load_cycle, mean_ci, read  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "client" / "src" / "lib" / "models" / "nhanesLifeStages.json"
REPORT = ROOT / "docs" / "nhanes-lifestages-report.md"

MIN_N, MIN_EVENTS = 30, 10
STAGES = [("cycling", "Cycling (reference)"), ("pregnant", "Pregnant"), ("breastfeeding", "Breastfeeding (postpartum proxy)"), ("post", "Natural post-menopause")]
CONTRASTS = [s for s, _ in STAGES[1:]]
OUTCOMES = [
    ("depression", "Depression symptoms", "binary", "PHQ-9 score 10 or more"),
    ("phq9", "PHQ-9 depression score", "continuous", "0–27"),
    ("sleep_trouble", "Trouble sleeping", "binary", "Has ever told a doctor about trouble sleeping"),
    ("short_sleep", "Short sleep", "binary", "Usually under 7 hours a night"),
]
BASE = ["age_c", "age_c2", "smoker"]


# ── Data ─────────────────────────────────────────────────────
def load() -> pd.DataFrame:
    parts = []
    for c in CYCLES:
        base = load_cycle(c)
        rhq = read("RHQ", c)[["SEQN", "RHQ031", "RHD043", "RHQ197", "RHQ200"]]
        demo = read("DEMO", c)[["SEQN", "RIDEXPRG"]]
        extra = demo.merge(rhq, on="SEQN", how="left").rename(columns={"SEQN": "seqn"})
        parts.append(base.merge(extra, on="seqn", how="left"))
    df = pd.concat(parts, ignore_index=True)
    df["pregnant"], df["female"] = df.pregnant.astype(bool), df.female.astype(bool)
    df["age_c"] = df.age - 40
    df["age_c2"] = df.age_c ** 2
    preg_unknown = df.RIDEXPRG == 3
    bf = df.RHQ200 == 1
    df["stage"] = np.select(
        [df.pregnant, preg_unknown, bf, df.status == "surgical", df.status == "post", df.status == "pre", df.RHQ031.isna()],
        ["pregnant", "pregnancy_unknown", "breastfeeding", "surgical", "post", "cycling", "rhq_missing"],
        default="other_amenorrhoea",  # no period in 12 months for another reason / don't know
    )
    df["women"] = df.female & df.age.between(20, 59) & (df.weight > 0)
    df["in_domain"] = df.women & df.stage.isin([s for s, _ in STAGES])
    for s in CONTRASTS:
        df["is_" + s] = (df.stage == s).astype(float)
    # Alternative postpartum proxy: live birth within 12 months, not currently pregnant (overlaps breastfeeding)
    df["recent_birth"] = (df.women & ~df.pregnant & ~preg_unknown & (df.RHQ197 <= 12) & df.stage.isin(["breastfeeding", "cycling", "other_amenorrhoea"])).astype(float)
    return df


# ── Estimation ───────────────────────────────────────────────
def analyse(design: Design, df: pd.DataFrame, key: str, kind: str, mask: np.ndarray, dummies: list[str], covars: list[str]) -> dict:
    """Weighted GLM with several exposure dummies vs a shared reference. Exposures failing the reliability
    rule are dropped from the domain (and reported as suppressed) before fitting."""
    col = {d: (d if d == "recent_birth" else "is_" + d) for d in dummies}
    complete = mask & df[[key] + covars].notna().all(axis=1).to_numpy()
    y_all = df[key].to_numpy(dtype=float)
    ref = complete & (df[[col[d] for d in dummies]].sum(axis=1) == 0).to_numpy()
    out, keep = {}, []
    for s in dummies:
        m = complete & (df[col[s]] == 1).to_numpy()
        n, ev = int(m.sum()), (int(y_all[m].sum()) if kind == "binary" else None)
        if n < MIN_N or (ev is not None and min(ev, n - ev) < MIN_EVENTS):
            out[s] = {"n": n, "suppressed": True}
            complete &= ~m
        else:
            out[s] = {"n": n, "suppressed": False}
            keep.append(s)
    n_ref = int(ref.sum())
    ref_ev = int(y_all[ref].sum()) if kind == "binary" else None
    if not keep or n_ref < MIN_N or (ref_ev is not None and min(ref_ev, n_ref - ref_ev) < MIN_EVENTS):
        return {"nRef": n_ref, "contrasts": {s: {**out[s], "suppressed": True} for s in dummies}}

    cols = [col[k] for k in keep] + covars
    X = np.column_stack([np.ones(len(df)), df[cols].fillna(0).to_numpy(dtype=float)])
    w = np.where(complete, df.weight.to_numpy(), 0.0)
    y = np.nan_to_num(y_all)
    beta, cov = fit(design, X, y, w, kind == "binary")
    t = stats.t.ppf(0.975, design.df)
    W = w.sum()
    X0 = X.copy()
    X0[:, 1:1 + len(keep)] = 0
    if kind == "binary":
        m0 = 1 / (1 + np.exp(-X0 @ beta))
        g0 = ((w * m0 * (1 - m0))[:, None] * X0).sum(axis=0) / W
    for i, s in enumerate(keep, start=1):
        b, se = beta[i], np.sqrt(cov[i, i])
        res = out[s] | {"p": float(2 * stats.t.sf(abs(b / se), design.df))}
        if kind == "binary":
            X1 = X0.copy()
            X1[:, i] = 1
            m1 = 1 / (1 + np.exp(-X1 @ beta))
            diff = float((w * (m1 - m0)).sum() / W)
            grad = ((w * m1 * (1 - m1))[:, None] * X1).sum(axis=0) / W - g0
            dse = float(np.sqrt(grad @ cov @ grad))
            res |= {"or": float(np.exp(b)), "orLo": float(np.exp(b - t * se)), "orHi": float(np.exp(b + t * se)),
                    "adjRef": float((w * m0).sum() / W), "adjStage": float((w * m1).sum() / W),
                    "diff": diff, "diffLo": diff - t * dse, "diffHi": diff + t * dse}
        else:
            res |= {"diff": float(b), "diffLo": float(b - t * se), "diffHi": float(b + t * se)}
        out[s] = res
    return {"nRef": n_ref, "contrasts": out}


def crude(design: Design, df: pd.DataFrame, key: str, kind: str, mask: np.ndarray) -> dict:
    y = df[key].to_numpy(dtype=float)
    res = {}
    for s, _ in STAGES:
        m = mask & (df.stage == s).to_numpy() & ~np.isnan(y)
        n = int(m.sum())
        ev = int(y[m].sum()) if kind == "binary" else None
        if n < MIN_N or (ev is not None and min(ev, n - ev) < MIN_EVENTS):
            res[s] = {"n": n, "suppressed": True}
            continue
        e = mean_ci(design, y, np.where(m, df.weight, 0.0))
        if kind == "binary":
            e["lo"], e["hi"] = max(e["lo"], 0.0), min(e["hi"], 1.0)
        res[s] = {"n": n, "est": e["est"], "lo": e["lo"], "hi": e["hi"], "suppressed": False}
    return res


def r(x, nd=4):
    if isinstance(x, dict):
        return {k: r(v, nd) for k, v in x.items()}
    if isinstance(x, list):
        return [r(v, nd) for v in x]
    if isinstance(x, float):
        return round(x, nd)
    return x


# ── Main ─────────────────────────────────────────────────────
def main() -> None:
    download()
    df = load()
    design = Design(df)
    dom = df.in_domain.to_numpy()
    women = df.women
    cnt = lambda s: int((women & (df.stage == s)).sum())
    flow = {
        "women20to59Examined": int(women.sum()),
        "excludedSurgicalMenopause": cnt("surgical"),
        "excludedPregnancyUndetermined": cnt("pregnancy_unknown"),
        "excludedNoPeriodOtherReason": cnt("other_amenorrhoea"),
        "excludedReproductiveDataMissing": cnt("rhq_missing"),
        "analysed": int(dom.sum()),
        **{s: int((dom & (df.stage == s)).sum()) for s, _ in STAGES},
    }
    print("Sample flow:", flow)
    ages = {s: {"median": float(df.loc[dom & (df.stage == s).to_numpy(), "age"].median()),
                "min": int(df.loc[dom & (df.stage == s).to_numpy(), "age"].min()),
                "max": int(df.loc[dom & (df.stage == s).to_numpy(), "age"].max())} for s, _ in STAGES}

    young, older = dom & df.age.between(20, 44).to_numpy(), dom & df.age.between(40, 59).to_numpy()
    rb_dom = (women & ((df.recent_birth == 1) | (df.stage == "cycling"))).to_numpy()
    results = []
    for key, label, kind, desc in OUTCOMES:
        main_ = analyse(design, df, key, kind, dom, CONTRASTS, BASE)
        sens = {
            "plusBmi": analyse(design, df, key, kind, dom, CONTRASTS, BASE + ["bmi"])["contrasts"],
            "ageMatched": {**analyse(design, df, key, kind, young & (df.stage != "post").to_numpy(), ["pregnant", "breastfeeding"], BASE)["contrasts"],
                           **analyse(design, df, key, kind, older & df.stage.isin(["cycling", "post"]).to_numpy(), ["post"], BASE)["contrasts"]},
            "recentBirth12m": analyse(design, df, key, kind, rb_dom, ["recent_birth"], BASE)["contrasts"]["recent_birth"],
        }
        results.append({"key": key, "label": label, "kind": kind, "definition": desc,
                        "crude": crude(design, df, key, kind, dom), "nRef": main_["nRef"], "adjusted": main_["contrasts"], "sensitivity": sens})
        for s, a in main_["contrasts"].items():
            if a["suppressed"]:
                print(f"{key:14s} {s:14s} n={a['n']:4d} suppressed")
            else:
                print(f"{key:14s} {s:14s} n={a['n']:4d} " + (f"OR {a['or']:.2f} ({a['orLo']:.2f}–{a['orHi']:.2f}) RD {100*a['diff']:+.1f}pp" if kind == "binary" else f"diff {a['diff']:+.2f} ({a['diffLo']:+.2f}, {a['diffHi']:+.2f})") + f" p={a['p']:.4f}")

    tested = [(x, s) for x in results for s in CONTRASTS if not x["adjusted"][s]["suppressed"]]
    for (x, s), q in zip(tested, bh([x["adjusted"][s]["p"] for x, s in tested])):
        x["adjusted"][s]["q"] = q
        x["adjusted"][s]["significant"] = q < 0.05

    sig = [(x["label"], dict(STAGES)[s], x["adjusted"][s]) for x, s in tested if x["adjusted"][s]["q"] < 0.05]
    out = {
        "name": "NHANES life stages, mood and sleep",
        "source": "National Health and Nutrition Examination Survey 2013–2014, 2015–2016, 2017–2018 (CDC/NCHS)",
        "url": "https://wwwn.cdc.gov/nchs/nhanes/",
        "population": "US women aged 20–59: cycling (reference), pregnant, breastfeeding, naturally post-menopausal",
        "method": "Survey-weighted logistic/linear regression of each outcome on life-stage dummies vs cycling women, adjusted for age, age² and current smoking (BMI-adjusted as sensitivity); design-based (Taylor linearisation) 95% CIs; Benjamini–Hochberg FDR across stage × outcome contrasts; predictive-margin risk differences.",
        "designDf": design.df,
        "stages": [{"key": s, "label": l, "age": ages[s]} for s, l in STAGES],
        "flow": flow,
        "headline": headline(results),
        "significantContrasts": [f"{st}: {lab}" for lab, st, _ in sig],
        "outcomes": results,
        "suppressionRule": f"Cells with fewer than {MIN_N} women or fewer than {MIN_EVENTS} events (or non-events) are suppressed (NCHS-style reliability).",
        "notes": [
            "Cross-sectional: associations at one point in time, not effects of a life stage.",
            "Breastfeeding is a proxy for postpartum: NHANES has no direct postpartum flag, and it misses postpartum women who are not breastfeeding (the 'birth in past 12 months' sensitivity analysis covers them).",
            "Pregnant and breastfeeding groups are small (about 150–200 women each), so confidence intervals are wide; 'no significant difference' is not evidence of no difference.",
            "Post-menopausal women are mostly 45+ and cycling women mostly under 50; age is adjusted for, but the age-matched sensitivity analysis (40–59 only) is the fairer comparison.",
            "Pregnancy status is only recorded for ages 20–44; older women are assumed not pregnant. Women whose pregnancy status could not be determined are excluded.",
            "'Trouble sleeping' means ever having told a doctor about it, not current symptoms; pregnant women's sleep complaints may be under-captured.",
            "Sleep-hours question changed in 2015 (SLD010H 'usual sleep' to SLD012 'weekday/workday sleep').",
            "PHQ-9 screens for depressive symptoms over two weeks; it is not a diagnosis, and somatic items (sleep, fatigue, appetite) overlap with normal pregnancy.",
            "Perimenopause cannot be identified, so 'cycling' includes women in the menopause transition.",
            "Surgical menopause (hysterectomy or both ovaries removed) is excluded as a different exposure.",
            "The 'birth in past 12 months' group overlaps heavily with breastfeeding women, so agreement between the two is not independent confirmation.",
            "644 women had no reproductive-health interview record and were excluded; complete-case analysis otherwise.",
            "Depression symptoms in breastfeeding women are suppressed (fewer than 10 women with PHQ-9 ≥10); the PHQ-9 score is reported instead.",
        ],
    }
    OUT.write_text(json.dumps(r(out), separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")
    print("Headline:", out["headline"])
    write_report(out)


def headline(results: list[dict]) -> str:
    lab = dict(STAGES)
    sig, ns = [], []
    for x in results:
        for s in CONTRASTS:
            a = x["adjusted"][s]
            if a["suppressed"]:
                continue
            (sig if a["q"] < 0.05 else ns).append((x, s, a))
    if not sig:
        nominal = [(x, s, a) for x, s, a in ns if a["p"] < 0.05]
        txt = ("After adjusting for age and smoking, no life stage differed from cycling women on depression symptoms or sleep "
               "once corrected for multiple comparisons.")
        if nominal:
            bits = []
            for x, s, a in nominal:
                eff = f"OR {a['or']:.1f}, 95% CI {a['orLo']:.1f}–{a['orHi']:.1f}" if x["kind"] == "binary" else f"{a['diff']:+.1f} points"
                more = a.get("or", 1) > 1 if x["kind"] == "binary" else a["diff"] > 0
                bits.append(f"{lab[s].split(' (')[0].lower()} women reported it {'more' if more else 'less'} often ({eff})")
            txt += f" The strongest signal was {x['label'].lower() if len({x['key'] for x, _, _ in nominal}) == 1 else 'in several outcomes'}: " + " and ".join(bits) + \
                   f" (nominal p<0.05, FDR q={min(a['q'] for _, _, a in nominal):.2f}), so treat it as suggestive."
        return txt
    parts = []
    for x, s, a in sig:
        eff = f"OR {a['or']:.1f}, 95% CI {a['orLo']:.1f}–{a['orHi']:.1f}" if x["kind"] == "binary" else f"{a['diff']:+.1f} points, 95% CI {a['diffLo']:+.1f} to {a['diffHi']:+.1f}"
        direction = ("higher" if (a.get("or", 1) > 1 or a["diff"] > 0) else "lower")
        parts.append(f"{lab[s].split(' (')[0].lower()} women had {direction} {x['label'].lower()} ({eff})")
    others = sorted({lab[s].split(' (')[0].lower() for _, s, _ in ns} - {lab[s].split(' (')[0].lower() for _, s, _ in sig})
    tail = f" Other contrasts{(' (including ' + ', '.join(others) + ' women)') if others else ''} were not significant after FDR correction." if ns else ""
    return "Compared with cycling women of similar age and smoking status, " + "; ".join(parts) + "." + tail


def fmt_ci(e, lo, hi, pct=False, nd=2):
    f = (lambda v: f"{100*v:.1f}") if pct else (lambda v: f"{v:.{nd}f}")
    return f"{f(e)} ({f(lo)}–{f(hi)})"


def effect(a: dict, kind: str) -> str:
    if not a or a.get("suppressed"):
        return f"suppressed (n={a['n']})" if a else "—"
    return f"OR {fmt_ci(a['or'], a['orLo'], a['orHi'])}; {100*a['diff']:+.1f} pp" if kind == "binary" else fmt_ci(a["diff"], a["diffLo"], a["diffHi"])


def write_report(o: dict) -> None:
    lab = {s["key"]: s["label"] for s in o["stages"]}
    L = [f"# {o['name']}", "", f"_Generated by `scripts/analyze_nhanes_lifestages.py`. Source: {o['source']}._", "",
         "## Question", "Do pregnant, breastfeeding (a postpartum proxy) and naturally post-menopausal US women aged 20–59 differ from cycling women in depression symptoms and sleep, once age and smoking are taken into account?", "",
         "## Method", o["method"], "",
         "Stages are mutually exclusive and assigned in order: pregnant (RIDEXPRG = 1), breastfeeding (RHQ200 = 1), surgical menopause (RHD043 = 3 or RHQ305 = 1; excluded), "
         "natural post-menopause (RHQ031 = 2 and RHD043 = 7), cycling (RHQ031 = 1). MEC exam weights divided by 3 for the pooled cycles. "
         "Sensitivity analyses: + BMI; age-matched domains (20–44 for pregnant/breastfeeding, 40–59 for post-menopause); live birth in the past 12 months (RHQ197 ≤ 12, not pregnant) as an alternative postpartum proxy.", "",
         f"Design degrees of freedom: {o['designDf']}.", "",
         "## Sample flow", "| Step | n |", "|---|---|"]
    L += [f"| {k} | {v} |" for k, v in o["flow"].items()]
    L += ["", "Age by stage (median, range): " + "; ".join(f"{s['label']} {s['age']['median']:.0f} ({s['age']['min']}–{s['age']['max']})" for s in o["stages"]) + "."]
    L += ["", "## Crude survey-weighted estimates (95% CI)", "| Outcome | " + " | ".join(lab.values()) + " |", "|---|" + "---|" * len(lab)]
    for x in o["outcomes"]:
        pct = x["kind"] == "binary"
        cells = []
        for s in lab:
            c = x["crude"][s]
            cells.append(f"suppressed (n={c['n']})" if c["suppressed"] else fmt_ci(c["est"], c["lo"], c["hi"], pct=pct) + ("%" if pct else "") + f" n={c['n']}")
        L.append(f"| {x['label']} | " + " | ".join(cells) + " |")
    L += ["", "## Adjusted contrasts vs cycling (age, age², smoking)", "| Outcome | Stage | n (stage) | Effect (95% CI) | p | q (FDR) |", "|---|---|---|---|---|---|"]
    for x in o["outcomes"]:
        for s in CONTRASTS:
            a = x["adjusted"][s]
            L.append(f"| {x['label']} | {lab[s]} | {a['n']} | {effect(a, x['kind'])} | " + ("— | — |" if a["suppressed"] else f"{a['p']:.3g} | {a['q']:.3g} |"))
    L += ["", "## Sensitivity analyses (odds ratio or difference vs cycling)", "| Outcome | Stage | Main | + BMI | Age-matched |", "|---|---|---|---|---|"]
    for x in o["outcomes"]:
        for s in CONTRASTS:
            L.append(f"| {x['label']} | {lab[s]} | {effect(x['adjusted'][s], x['kind'])} | {effect(x['sensitivity']['plusBmi'][s], x['kind'])} | {effect(x['sensitivity']['ageMatched'][s], x['kind'])} |")
    L += ["", "Alternative postpartum proxy (live birth in past 12 months vs cycling women, any age 20–59):", "", "| Outcome | Effect (95% CI) | p |", "|---|---|---|"]
    for x in o["outcomes"]:
        a = x["sensitivity"]["recentBirth12m"]
        L.append(f"| {x['label']} | {effect(a, x['kind'])} (n={a['n']}) | " + ("—" if a["suppressed"] else f"{a['p']:.3g}") + " |")
    L += ["", "## Headline", o["headline"], "", "## Caveats"] + [f"- {n}" for n in o["notes"]] + ["", f"_{o['suppressionRule']}_", ""]
    REPORT.write_text("\n".join(L))
    print(f"Wrote {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
