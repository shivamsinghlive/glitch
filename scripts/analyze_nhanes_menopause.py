"""
Glitch — how does menopause relate to blood pressure, mood, sleep and bone in US women?

Population analysis of NHANES 2013–2018 (CDC/NCHS, public domain). Compares pre-menopausal women with
women whose periods stopped because of menopause, both aged 40–59, using survey-weighted regression with
design-based (Taylor linearisation) standard errors so results describe US women, not just the sample.

Methods
- Domain: women 40–59 with a MEC exam, not pregnant. Pre = regular periods in the past 12 months (RHQ031=1).
  Post = no periods in 12 months because of menopause (RHQ031=2, RHD043=7). Hysterectomy / both ovaries
  removed are excluded from the main comparison (surgical menopause is a different exposure).
- Outcomes: hypertension (ACC/AHA 2017: ≥130/80 or on BP medication), systolic BP, depression (PHQ-9 ≥10),
  PHQ-9 score, trouble sleeping told to a doctor, short sleep (<7 h), low femoral-neck bone mass (T ≤ −1,
  NHANES III young-women reference; 2013–14 and 2017–18 only), femoral-neck BMD.
- Model: outcome ~ postmenopausal + age + age² + BMI + current smoking (weighted logistic / linear).
  Adjusted risk difference from predictive margins (delta method). Benjamini–Hochberg FDR across outcomes.
- Sensitivity: + race/ethnicity, income and education; ages 45–55 only; excluding ever hormone-therapy users.
- Equity: the same model within each race/ethnicity group, plus a design-based Wald test for a
  post × race interaction. Estimates from fewer than 50 women or 10 events are suppressed.

Usage
  .venv/bin/python scripts/analyze_nhanes_menopause.py        # downloads XPT files into scripts/data/nhanes/

Writes client/src/lib/models/nhanesMenopause.json (aggregate estimates only, no individual rows) and
docs/nhanes-menopause-report.md.
"""
from __future__ import annotations

import json
import urllib.request
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "scripts" / "data" / "nhanes"
OUT = ROOT / "client" / "src" / "lib" / "models" / "nhanesMenopause.json"
REPORT = ROOT / "docs" / "nhanes-menopause-report.md"

CYCLES = {"H": "2013", "I": "2015", "J": "2017"}
FILES = ["DEMO", "RHQ", "BPX", "BPQ", "DPQ", "SLQ", "BMX", "SMQ", "DXXFEM"]
BASE_URL = "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/{year}/DataFiles/{name}_{cycle}.xpt"

MIN_N, MIN_EVENTS = 50, 10
# NHANES III femoral neck, non-Hispanic white women 20–29 (Looker et al. 1998), the standard T-score reference
FN_REF_MEAN, FN_REF_SD = 0.858, 0.120

RACE = {1: "Hispanic", 2: "Hispanic", 3: "White (non-Hispanic)", 4: "Black (non-Hispanic)", 6: "Asian (non-Hispanic)", 7: "Other / multiracial"}

OUTCOMES = [
    # key, label, kind, short description used in the app
    ("hypertension", "High blood pressure", "binary", "≥130/80 mmHg or taking BP medication"),
    ("depression", "Depression symptoms", "binary", "PHQ-9 score 10 or more"),
    ("sleep_trouble", "Trouble sleeping", "binary", "Has told a doctor about trouble sleeping"),
    ("short_sleep", "Short sleep", "binary", "Usually under 7 hours a night"),
    ("low_bone", "Low bone mass", "binary", "Femoral-neck T-score −1 or lower"),
    ("sbp", "Systolic blood pressure", "continuous", "mmHg, average of exam readings"),
    ("phq9", "PHQ-9 depression score", "continuous", "0–27"),
    ("fn_bmd", "Femoral-neck bone density", "continuous", "g/cm²"),
]
BASE_COVARS = ["age_c", "age_c2", "bmi", "smoker"]


# ── Data ─────────────────────────────────────────────────────
def download() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    for cycle, year in CYCLES.items():
        for name in FILES:
            dest = DATA / f"{name}_{cycle}.xpt"
            if dest.exists() or (name == "DXXFEM" and cycle == "I"):  # no femur DXA in 2015–16
                continue
            print(f"Downloading {dest.name}")
            urllib.request.urlretrieve(BASE_URL.format(year=year, name=name, cycle=cycle), dest)


def read(name: str, cycle: str) -> pd.DataFrame | None:
    p = DATA / f"{name}_{cycle}.xpt"
    return pd.read_sas(p, format="xport") if p.exists() else None


def clean(s: pd.Series, valid_max: float) -> pd.Series:
    """NHANES codes refusals/don't-know as 7, 9, 77, 99, 777… — treat anything above the valid range as missing."""
    return s.where(s <= valid_max)


def load_cycle(cycle: str) -> pd.DataFrame:
    d = read("DEMO", cycle)[["SEQN", "RIAGENDR", "RIDAGEYR", "RIDRETH3", "RIDEXPRG", "INDFMPIR", "DMDEDUC2", "WTMEC2YR", "SDMVSTRA", "SDMVPSU"]]
    for name in ["RHQ", "BPX", "BPQ", "DPQ", "SLQ", "BMX", "SMQ", "DXXFEM"]:
        t = read(name, cycle)
        if t is not None:
            d = d.merge(t, on="SEQN", how="left")
    d["cycle"] = cycle
    out = pd.DataFrame({
        "seqn": d.SEQN, "cycle": cycle, "female": d.RIAGENDR == 2, "age": d.RIDAGEYR,
        "pregnant": d.RIDEXPRG == 1, "weight": d.WTMEC2YR.fillna(0) / len(CYCLES),
        "strata": d.SDMVSTRA, "psu": d.SDMVSTRA * 10 + d.SDMVPSU,
        "race": d.RIDRETH3.map(RACE), "pir": d.INDFMPIR, "college": np.where(d.DMDEDUC2.isin([4, 5]), 1.0, np.where(d.DMDEDUC2.isin([1, 2, 3]), 0.0, np.nan)),
    })
    regular = clean(d.RHQ031, 2)
    reason = d.RHD043
    surgical = (reason == 3) | (d.RHQ305 == 1)
    out["status"] = np.select([surgical, regular == 1, (regular == 2) & (reason == 7)], ["surgical", "pre", "post"], default="unknown")
    out["age_fmp"] = clean(d.RHQ060, 70)
    out["ever_hrt"] = np.where(d.RHQ540 == 1, 1.0, np.where(d.RHQ540 == 2, 0.0, np.nan))
    out["bmi"] = d.BMXBMI
    out["smoker"] = np.where(d.SMQ020 == 2, 0.0, np.where(d.SMQ040.isin([1, 2]), 1.0, np.where(d.SMQ040 == 3, 0.0, np.nan)))

    sys_ = d[[f"BPXSY{i}" for i in range(1, 5)]].where(lambda x: x > 0).mean(axis=1)
    dia = d[[f"BPXDI{i}" for i in range(1, 5)]].where(lambda x: x > 0).mean(axis=1)  # DBP of 0 is a recording artefact
    on_meds = (d.BPQ050A == 1).astype(float)
    out["sbp"] = sys_
    out["hypertension"] = np.where(sys_.isna() | dia.isna(), np.nan, ((sys_ >= 130) | (dia >= 80) | (on_meds == 1)).astype(float))

    phq = d[[f"DPQ0{i}0" for i in range(1, 10)]].apply(lambda s: clean(s, 3))
    out["phq9"] = phq.sum(axis=1, min_count=9)
    out["depression"] = np.where(out.phq9.isna(), np.nan, (out.phq9 >= 10).astype(float))

    out["sleep_trouble"] = np.where(d.SLQ050 == 1, 1.0, np.where(d.SLQ050 == 2, 0.0, np.nan))
    hours = clean(d["SLD012"] if "SLD012" in d else d["SLD010H"], 24)
    out["short_sleep"] = np.where(hours.isna(), np.nan, (hours < 7).astype(float))

    fn = d["DXXNKBMD"] if "DXXNKBMD" in d else pd.Series(np.nan, index=d.index)
    out["fn_bmd"] = fn
    out["low_bone"] = np.where(fn.isna(), np.nan, ((fn - FN_REF_MEAN) / FN_REF_SD <= -1).astype(float))
    return out


def load() -> pd.DataFrame:
    df = pd.concat([load_cycle(c) for c in CYCLES], ignore_index=True)
    df["age_c"] = df.age - 50
    df["age_c2"] = df.age_c ** 2
    df["post"] = (df.status == "post").astype(float)
    df["in_domain"] = df.female & df.age.between(40, 59) & ~df.pregnant & (df.weight > 0) & df.status.isin(["pre", "post"])
    return df


# ── Survey-weighted estimation (Taylor linearisation) ────────
class Design:
    """Stratified, clustered design. Out-of-domain rows keep their PSU so domain variances use the full design."""

    def __init__(self, df: pd.DataFrame):
        self.strata = df.strata.to_numpy()
        self.psu = df.psu.to_numpy()
        self.df = len(np.unique(self.psu)) - len(np.unique(self.strata))

    def meat(self, scores: np.ndarray) -> np.ndarray:
        """Σ_h n_h/(n_h−1) Σ_j (z_hj − z̄_h)(z_hj − z̄_h)ᵀ with z_hj the PSU score totals."""
        k = scores.shape[1]
        V = np.zeros((k, k))
        frame = pd.DataFrame(scores).assign(h=self.strata, j=self.psu)
        for _, g in frame.groupby("h"):
            z = g.groupby("j").sum(numeric_only=True).drop(columns="h", errors="ignore").to_numpy()
            if len(z) < 2:
                continue
            dz = z - z.mean(axis=0)
            V += len(z) / (len(z) - 1) * dz.T @ dz
        return V


def fit(design: Design, X: np.ndarray, y: np.ndarray, w: np.ndarray, logistic: bool):
    """Weighted GLM (IRLS) on a domain (w = 0 outside it). Returns β and its design-based covariance."""
    beta = np.zeros(X.shape[1])
    if logistic:
        for _ in range(50):
            mu = 1 / (1 + np.exp(-X @ beta))
            A = (X * (w * mu * (1 - mu))[:, None]).T @ X
            step = np.linalg.solve(A, X.T @ (w * (y - mu)))
            beta += step
            if np.abs(step).max() < 1e-9:
                break
        mu = 1 / (1 + np.exp(-X @ beta))
        A = (X * (w * mu * (1 - mu))[:, None]).T @ X
    else:
        A = (X * w[:, None]).T @ X
        beta = np.linalg.solve(A, X.T @ (w * y))
        mu = X @ beta
    Ainv = np.linalg.inv(A)
    cov = Ainv @ design.meat(X * (w * (y - mu))[:, None]) @ Ainv
    return beta, cov


def matrix(df: pd.DataFrame, covars: list[str], extra: list[str] | None = None) -> tuple[np.ndarray, list[str]]:
    cols = ["post"] + covars
    X = df[cols].to_numpy(dtype=float)
    names = ["intercept"] + cols
    if extra:
        dummies = pd.get_dummies(df[extra], drop_first=True, dtype=float)
        X = np.column_stack([X, dummies.to_numpy()])
        names += list(dummies.columns)
    return np.column_stack([np.ones(len(df)), X]), names


def mean_ci(design: Design, y: np.ndarray, w: np.ndarray) -> dict:
    """Weighted mean / prevalence with a linearised 95% CI."""
    ok = w > 0
    est = float((w[ok] * y[ok]).sum() / w[ok].sum())
    score = np.where(ok, w * (np.nan_to_num(y) - est) / w[ok].sum(), 0.0)
    se = float(np.sqrt(design.meat(score[:, None])[0, 0]))
    t = stats.t.ppf(0.975, design.df)
    return {"est": est, "lo": est - t * se, "hi": est + t * se, "se": se}


def analyse(design: Design, df: pd.DataFrame, key: str, kind: str, mask: np.ndarray, covars: list[str], extra: list[str] | None = None) -> dict | None:
    need = [key, "post"] + covars + (extra or [])
    complete = mask & df[need].notna().all(axis=1).to_numpy()
    sub = df.loc[complete]
    n_pre, n_post = int((sub.post == 0).sum()), int((sub.post == 1).sum())
    events = int(sub[key].sum()) if kind == "binary" else None
    if min(n_pre, n_post) < MIN_N or (events is not None and min(events, len(sub) - events) < MIN_EVENTS):
        return {"n": len(sub), "nPre": n_pre, "nPost": n_post, "suppressed": True}

    filled = df.copy()
    num = [c for c in need if c not in (extra or [])]
    filled[num] = filled[num].fillna(0)
    for c in extra or []:
        filled[c] = filled[c].fillna(filled.loc[complete, c].mode()[0])  # out-of-domain rows have weight 0
    X, names = matrix(filled, covars, extra)
    w = np.where(complete, df.weight.to_numpy(), 0.0)
    y = filled[key].to_numpy(dtype=float)
    beta, cov = fit(design, X, y, w, kind == "binary")
    t = stats.t.ppf(0.975, design.df)
    b, se = beta[1], np.sqrt(cov[1, 1])
    p = float(2 * stats.t.sf(abs(b / se), design.df))
    res = {"n": len(sub), "nPre": n_pre, "nPost": n_post, "p": p, "suppressed": False}

    if kind == "binary":
        res.update({"or": float(np.exp(b)), "orLo": float(np.exp(b - t * se)), "orHi": float(np.exp(b + t * se))})
        # Predictive margins: everyone as pre vs everyone as post, averaged over the domain's covariates
        X1, X0 = X.copy(), X.copy()
        X1[:, 1], X0[:, 1] = 1, 0
        m1, m0 = 1 / (1 + np.exp(-X1 @ beta)), 1 / (1 + np.exp(-X0 @ beta))
        W = w.sum()
        diff = float((w * (m1 - m0)).sum() / W)
        grad = ((w * m1 * (1 - m1))[:, None] * X1 - (w * m0 * (1 - m0))[:, None] * X0).sum(axis=0) / W
        dse = float(np.sqrt(grad @ cov @ grad))
        res.update({"adjPre": float((w * m0).sum() / W), "adjPost": float((w * m1).sum() / W), "diff": diff, "diffLo": diff - t * dse, "diffHi": diff + t * dse})
    else:
        res.update({"diff": float(b), "diffLo": float(b - t * se), "diffHi": float(b + t * se)})
    return res


def race_interaction_p(design: Design, df: pd.DataFrame, key: str, kind: str, mask: np.ndarray) -> float | None:
    """Design-based Wald F test that the post-menopause association differs by race/ethnicity."""
    need = [key, "post", "race"] + BASE_COVARS
    complete = mask & df[need].notna().all(axis=1).to_numpy()
    filled = df.copy()
    filled[need[:2] + BASE_COVARS] = filled[need[:2] + BASE_COVARS].fillna(0)
    filled["race"] = filled.race.fillna("White (non-Hispanic)")
    X, _ = matrix(filled, BASE_COVARS, ["race"])
    dummies = pd.get_dummies(filled.race, drop_first=True, dtype=float).to_numpy()
    inter = dummies * filled.post.to_numpy()[:, None]
    X = np.column_stack([X, inter])
    w = np.where(complete, df.weight.to_numpy(), 0.0)
    try:
        beta, cov = fit(design, X, filled[key].to_numpy(dtype=float), w, kind == "binary")
    except np.linalg.LinAlgError:
        return None
    k = inter.shape[1]
    b, C = beta[-k:], cov[-k:, -k:]
    W = float(b @ np.linalg.solve(C, b))
    F = W / k * (design.df - k + 1) / design.df
    return float(stats.f.sf(F, k, design.df - k + 1))


def bh(pvals: list[float]) -> list[float]:
    p = np.asarray(pvals)
    order = np.argsort(p)
    q = p[order] * len(p) / (np.arange(len(p)) + 1)
    q = np.minimum.accumulate(q[::-1])[::-1]
    out = np.empty_like(q)
    out[order] = np.minimum(q, 1)
    return out.tolist()


def r(x, nd=3):
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
    women = df.female & df.age.between(40, 59) & ~df.pregnant & (df.weight > 0)

    flow = {
        "women40to59Examined": int(women.sum()),
        "surgicalExcluded": int((women & (df.status == "surgical")).sum()),
        "unknownStatusExcluded": int((women & (df.status == "unknown")).sum()),
        "analysed": int(dom.sum()),
        "pre": int((dom & (df.status == "pre")).sum()),
        "post": int((dom & (df.status == "post")).sum()),
    }
    print("Sample flow:", flow)

    results = []
    for key, label, kind, desc in OUTCOMES:
        main_ = analyse(design, df, key, kind, dom, BASE_COVARS)
        has = dom & df[key].notna().to_numpy()
        crude = {s: mean_ci(design, df[key].to_numpy(dtype=float), np.where(has & (df.post == v).to_numpy(), df.weight, 0.0)) for s, v in (("pre", 0), ("post", 1))}
        sens = {
            "unadjusted": analyse(design, df, key, kind, dom, []),
            "plusSocial": analyse(design, df, key, kind, dom, BASE_COVARS + ["pir", "college"], ["race"]),
            "age45to55": analyse(design, df, key, kind, dom & df.age.between(45, 55).to_numpy(), BASE_COVARS),
            "noHormoneTherapy": analyse(design, df, key, kind, dom & (df.ever_hrt == 0).to_numpy(), BASE_COVARS),
        }
        by_race = {}
        for g in sorted(df.race.dropna().unique()):
            by_race[g] = analyse(design, df, key, kind, dom & (df.race == g).to_numpy(), BASE_COVARS)
        results.append({
            "key": key, "label": label, "kind": kind, "definition": desc,
            "crude": crude, "adjusted": main_, "sensitivity": sens, "byRace": by_race,
            "raceInteractionP": race_interaction_p(design, df, key, kind, dom),
        })
        print(f"{key:14s} n={main_['n']:5d}  " + (f"OR {main_['or']:.2f} ({main_['orLo']:.2f}–{main_['orHi']:.2f})  RD {100*main_['diff']:+.1f} pp" if kind == "binary" else f"diff {main_['diff']:+.3f} ({main_['diffLo']:+.3f}, {main_['diffHi']:+.3f})") + f"  p={main_['p']:.4f}")

    qs = bh([x["adjusted"]["p"] for x in results])
    for x, q in zip(results, qs):
        x["adjusted"]["q"] = q
        x["significant"] = q < 0.05

    # Who is missing? Complete-case analysis can bias results if missingness differs by group.
    miss_vars = ["bmi", "smoker", "sbp", "phq9", "sleep_trouble", "short_sleep", "fn_bmd"]
    missing = {"overall": {v: float(df.loc[dom, v].isna().mean()) for v in miss_vars}, "byRace": {}}
    for g in sorted(df.race.dropna().unique()):
        m = dom & (df.race == g).to_numpy()
        missing["byRace"][g] = {"n": int(m.sum()), **{v: float(df.loc[m, v].isna().mean()) for v in miss_vars}}

    post_w = dom & (df.status == "post").to_numpy() & df.age_fmp.notna().to_numpy()
    fmp = mean_ci(design, df.age_fmp.to_numpy(dtype=float), np.where(post_w, df.weight, 0.0))
    early = mean_ci(design, (df.age_fmp < 45).astype(float).to_numpy(), np.where(post_w, df.weight, 0.0))

    out = {
        "name": "NHANES menopause and health analysis",
        "source": "National Health and Nutrition Examination Survey 2013–2014, 2015–2016, 2017–2018 (CDC/NCHS)",
        "url": "https://wwwn.cdc.gov/nchs/nhanes/",
        "license": "Public domain (US federal government data). De-identified; no individual rows are stored in this app.",
        "population": "US women aged 40–59, pre-menopausal vs naturally post-menopausal",
        "method": "Survey-weighted logistic/linear regression adjusted for age, age², BMI and smoking; design-based (Taylor linearisation) 95% CIs; Benjamini–Hochberg FDR across outcomes; predictive-margin risk differences.",
        "designDf": design.df,
        "flow": flow,
        "ageAtFinalPeriod": {"mean": fmp, "earlyUnder45": early, "note": "Self-reported, among post-menopausal women aged 40–59 (younger women who have not yet reached menopause are not counted, so this is not a population average)."},
        "outcomes": results,
        "missing": missing,
        "suppressionRule": f"Estimates from fewer than {MIN_N} women in either group or fewer than {MIN_EVENTS} events are suppressed.",
        "limitations": [
            "Cross-sectional: shows associations at one point in time, not that menopause causes these changes.",
            "Menopause status is self-reported; perimenopause cannot be identified in NHANES, so 'pre' includes some women already in the transition.",
            "Age and menopause are closely linked; results are adjusted for age but residual confounding is possible.",
            "Hot flashes and night sweats are not measured in NHANES 2013–2018.",
            "Bone density uses 2013–14 and 2017–18 only (no femur scan in 2015–16).",
            "Complete-case analysis; see the missing-data table for how missingness differs by group.",
        ],
        "ethics": [
            "Uses public, de-identified government data under NCHS terms; only aggregate estimates ship in the app.",
            "Survey weights make results represent US women, including groups NHANES oversamples (Black, Hispanic, Asian women).",
            "Race/ethnicity is used to check whether findings hold across groups and is never used to score an individual user.",
            "Small groups are suppressed to avoid unreliable or re-identifiable estimates.",
        ],
    }
    OUT.write_text(json.dumps(r(out, 4), indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT.relative_to(ROOT)}")
    write_report(out)


def fmt_ci(e, lo, hi, pct=False, nd=2):
    f = (lambda v: f"{100*v:.1f}") if pct else (lambda v: f"{v:.{nd}f}")
    return f"{f(e)} ({f(lo)}–{f(hi)})"


def write_report(o: dict) -> None:
    L = [f"# {o['name']}", "", f"_Generated by `scripts/analyze_nhanes_menopause.py`. Source: {o['source']}._", "",
         "## Question", "Do pre-menopausal and naturally post-menopausal US women aged 40–59 differ in blood pressure, mood, sleep and bone health once age, BMI and smoking are taken into account?", "",
         "## Method", o["method"], "", f"Design degrees of freedom: {o['designDf']}.", "",
         "## Sample", "| Step | n |", "|---|---|"]
    L += [f"| {k} | {v} |" for k, v in o["flow"].items()]
    L += ["", "## Results (main model)", "| Outcome | n | Pre (crude) | Post (crude) | Adjusted effect (95% CI) | q (FDR) |", "|---|---|---|---|---|---|"]
    for x in o["outcomes"]:
        a, c = x["adjusted"], x["crude"]
        if a.get("suppressed"):
            L.append(f"| {x['label']} | {a['n']} | — | — | suppressed | — |")
            continue
        pct = x["kind"] == "binary"
        crude = lambda s: fmt_ci(c[s]["est"], c[s]["lo"], c[s]["hi"], pct=pct) + ("%" if pct else "")
        eff = (f"OR {fmt_ci(a['or'], a['orLo'], a['orHi'])}; {100*a['diff']:+.1f} pp" if pct else f"{fmt_ci(a['diff'], a['diffLo'], a['diffHi'], nd=3)}")
        L.append(f"| {x['label']} | {a['n']} | {crude('pre')} | {crude('post')} | {eff} | {a['q']:.3g} |")
    L += ["", "## Sensitivity analyses (odds ratio or difference for post vs pre)", "| Outcome | Unadjusted | Main | + race, income, education | Ages 45–55 | Never used hormone therapy |", "|---|---|---|---|---|---|"]
    for x in o["outcomes"]:
        def cell(a):
            if not a or a.get("suppressed"):
                return "suppressed"
            return fmt_ci(a["or"], a["orLo"], a["orHi"]) if x["kind"] == "binary" else fmt_ci(a["diff"], a["diffLo"], a["diffHi"], nd=3)
        s = x["sensitivity"]
        L.append(f"| {x['label']} | {cell(s['unadjusted'])} | {cell(x['adjusted'])} | {cell(s['plusSocial'])} | {cell(s['age45to55'])} | {cell(s['noHormoneTherapy'])} |")
    L += ["", "## Does it hold across race/ethnicity groups?", "Same model fitted within each group. Interaction p tests whether the association differs between groups.", ""]
    groups = list(o["outcomes"][0]["byRace"].keys())
    L += ["| Outcome | " + " | ".join(groups) + " | Interaction p |", "|---|" + "---|" * (len(groups) + 1)]
    for x in o["outcomes"]:
        cells = []
        for g in groups:
            a = x["byRace"][g]
            if not a or a.get("suppressed"):
                cells.append("suppressed")
            else:
                cells.append(fmt_ci(a["or"], a["orLo"], a["orHi"]) if x["kind"] == "binary" else fmt_ci(a["diff"], a["diffLo"], a["diffHi"], nd=3))
        ip = x["raceInteractionP"]
        L.append(f"| {x['label']} | " + " | ".join(cells) + (f" | {ip:.3g} |" if ip is not None else " | — |"))
    L += ["", "## Missing data (share missing among analysed women)", "| Group | n | " + " | ".join(o["missing"]["overall"].keys()) + " |", "|---|---|" + "---|" * len(o["missing"]["overall"])]
    L.append("| All | " + str(o["flow"]["analysed"]) + " | " + " | ".join(f"{100*v:.0f}%" for v in o["missing"]["overall"].values()) + " |")
    for g, m in o["missing"]["byRace"].items():
        L.append(f"| {g} | {m['n']} | " + " | ".join(f"{100*m[k]:.0f}%" for k in o["missing"]["overall"]) + " |")
    a = o["ageAtFinalPeriod"]
    L += ["", "## Age at final period", f"Mean {a['mean']['est']:.1f} years (95% CI {a['mean']['lo']:.1f}–{a['mean']['hi']:.1f}); before 45: {100*a['earlyUnder45']['est']:.1f}%. {a['note']}",
          "", "## Limitations"] + [f"- {x}" for x in o["limitations"]] + ["", "## Ethics"] + [f"- {x}" for x in o["ethics"]] + ["", f"_{o['suppressionRule']}_", ""]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(L))
    print(f"Wrote {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
