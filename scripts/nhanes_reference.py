"""
Build a population reference from NHANES 2017-2018 (CDC, public domain, nationally representative).
Used to answer "how does my blood pressure / sleep compare with US women my age?".

Files (downloaded to scripts/data/, git-ignored):
  DEMO_J (age, sex, survey weights), BPX_J (blood pressure exam), SLQ_J (sleep questionnaire)
  https://wwwn.cdc.gov/nchs/nhanes/continuousnhanes/default.aspx?BeginYear=2017

Method: women 35-79, survey-weighted (WTMEC2YR) percentiles by age band. Blood pressure is the mean of
readings 2-3 (NHANES convention) or reading 1 if only one exists. Only aggregates are written.
Usage: python3 scripts/nhanes_reference.py
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "scripts" / "data"
OUT = ROOT / "client" / "src" / "lib" / "models" / "nhanesReference.json"
BASE = "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/"
BANDS = [(35, 44), (45, 54), (55, 64), (65, 79)]
PCTS = [5, 10, 25, 50, 75, 90, 95]


def fetch(name: str) -> pd.DataFrame:
    p = DATA / f"{name}.XPT"
    if not p.exists():
        DATA.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(f"{BASE}{name}.XPT", p)
    return pd.read_sas(p)


def wquantile(x: np.ndarray, w: np.ndarray, qs: list[int]) -> list[float]:
    o = np.argsort(x)
    x, w = x[o], w[o]
    c = (np.cumsum(w) - 0.5 * w) / w.sum()
    return [round(float(np.interp(q / 100, c, x)), 1) for q in qs]


def main() -> None:
    demo, bp, sl = fetch("DEMO_J"), fetch("BPX_J"), fetch("SLQ_J")
    d = demo[(demo["RIAGENDR"] == 2) & demo["RIDAGEYR"].between(35, 79)][["SEQN", "RIDAGEYR", "WTMEC2YR"]]
    sys_cols, dia_cols = ["BPXSY1", "BPXSY2", "BPXSY3"], ["BPXDI1", "BPXDI2", "BPXDI3"]
    bp = bp.copy()
    s = bp[sys_cols].copy(); s2 = s[["BPXSY2", "BPXSY3"]].mean(axis=1)
    dd = bp[dia_cols].copy(); d2 = dd[["BPXDI2", "BPXDI3"]].mean(axis=1)
    bp["sys"] = s2.fillna(bp["BPXSY1"]); bp["dia"] = d2.fillna(bp["BPXDI1"])
    bp.loc[bp["dia"] <= 0, "dia"] = np.nan
    m = d.merge(bp[["SEQN", "sys", "dia"]], on="SEQN", how="left").merge(sl[["SEQN", "SLD012"]], on="SEQN", how="left")

    bands = []
    for lo, hi in BANDS:
        g = m[m["RIDAGEYR"].between(lo, hi)]
        gb = g.dropna(subset=["sys", "dia"])
        gs = g.dropna(subset=["SLD012"])
        hyp = ((gb["sys"] >= 130) | (gb["dia"] >= 80)).to_numpy()
        short = (gs["SLD012"] < 6).to_numpy()
        bands.append({
            "ageMin": lo, "ageMax": hi,
            "nBp": int(len(gb)), "nSleep": int(len(gs)),
            "systolicPercentiles": dict(zip(map(str, PCTS), wquantile(gb["sys"].to_numpy(), gb["WTMEC2YR"].to_numpy(), PCTS))),
            "diastolicPercentiles": dict(zip(map(str, PCTS), wquantile(gb["dia"].to_numpy(), gb["WTMEC2YR"].to_numpy(), PCTS))),
            "sleepHoursPercentiles": dict(zip(map(str, PCTS), wquantile(gs["SLD012"].to_numpy(), gs["WTMEC2YR"].to_numpy(), PCTS))),
            "shareBpAtOrAbove130_80": round(float(np.average(hyp, weights=gb["WTMEC2YR"])), 3),
            "shareSleepUnder6h": round(float(np.average(short, weights=gs["WTMEC2YR"])), 3),
        })
    out = {
        "source": "NHANES 2017-2018 (CDC NCHS), women 35-79, survey-weighted",
        "url": "https://wwwn.cdc.gov/nchs/nhanes/continuousnhanes/default.aspx?BeginYear=2017",
        "note": "Context only. Clinic readings differ from home readings; sleep is self-reported weekday sleep.",
        "percentiles": PCTS,
        "bands": bands,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    for b in bands:
        print(b["ageMin"], b["ageMax"], "n", b["nBp"], b["nSleep"], "sys p50", b["systolicPercentiles"]["50"], "BP>=130/80", b["shareBpAtOrAbove130_80"], "sleep<6h", b["shareSleepUnder6h"])


if __name__ == "__main__":
    main()
