# Glitch — Responsibility & Ethics Assessment

Glitch is a voice-first health companion for women in perimenopause and menopause. This document covers
how we source data, protect privacy, check fairness, limit harm and stay transparent, and where we fall short.
Linked documents hold the evidence:
[NHANES analysis](nhanes-menopause-report.md) · [Claim audit](claim-audit.md) · [Trigger power analysis](trigger-power.md).

> Glitch gives wellness insights, not diagnoses. Treatment decisions belong with a clinician.

---

## 1. Data sourcing

| Dataset | What it is | How we got it | License / terms | What ships in the app |
|---|---|---|---|---|
| **NHANES 2013–2018** (CDC/NCHS) | Nationally representative US health survey; 1,941 women aged 40–59 analysed | Public download from cdc.gov | Public domain, de-identified; NCHS data-use restrictions (no re-identification) | Aggregate estimates only (`models/nhanesMenopause.json`) |
| **TSHS Hot Flashes** (Freeman et al. cohort) | 375 women aged 35–48, with hormone labs | Public teaching dataset, CAUSEweb | CC BY-NC-SA 4.0 (educational use) | Model coefficients and evaluation only (`models/hotflashRisk.json`) |
| **PubMed** (NLM) | 44 peer-reviewed papers backing 28 claims | Retrieved and verified via PubMed metadata | Citation only | Titles, PMIDs and links (`lib/evidence.ts`) |
| **WHOOP-shaped demo data** | 90 synthetic days for the demo | Generated with a fixed seed in `whoop/demoData.ts` | Our own | Demo only, clearly labelled "demo" |
| **User's own logs** | Hot flashes, meals, mood, BP, wearable data | Entered by the user, or from the device | The user's | Stays on the device, encrypted |

**Datasets we chose not to use:**
- **Apple Women's Health Study:** participant-level data isn't public. Access is by request to the study team, so we only cite its published findings.
- **mcPHASES (PhysioNet):** needs credentialed access, which we didn't have in time.
- **Raw files are never committed:** `scripts/data/` is git-ignored.

## 2. Privacy

- **On the device by default.** All personal data is encrypted with AES-GCM (256-bit) using a non-extractable browser key. There is no backend database.
- **Camera and microphone are processed locally.** Face and voice mood estimates run in the browser (MediaPipe / Web Audio), and no video or audio is uploaded.
- **What does leave the device:**
  - When a user talks to the AI coach, the message plus a short context summary goes through our server proxy to Groq for an answer. The summary includes stage, today's meals, wearable summary numbers, a mood label, and hormones/supplements if the user consented.
  - Food photos go to the vision model.
  - The proxy stores nothing.
- **Never sent:** ethnicity, raw sensor streams, the API key (it stays on the server).
- **Consent:** hormone/contraception details and ethnicity are optional and asked separately. "Prefer not to say" is always available.
- **Reset:** `?reset` wipes everything locally.
- **Not done yet:** a "local-only" mode that turns off the LLM completely, and a self-hosted model.

## 3. Fairness

**Population analysis (NHANES).**
- Survey weights make results represent US women, including groups NHANES oversamples (Black, Hispanic, Asian).
- We fit the same model inside each race/ethnicity group and ran a design-based interaction test. No outcome showed a statistically clear difference between groups (all interaction p > 0.05).
- Group estimates from fewer than 50 women or 10 events are suppressed (e.g. "Other / multiracial").
- **Missing data:** missingness was low (≤5%) and similar across groups, except bone density, which was only measured in 2 of 3 cycles.

**Hot-flash model (TSHS).**
- Race and education are not model inputs.
- We still audited held-out performance by group:
  - **Race:** AUC 0.69 for African American and 0.65 for Caucasian women. The intervals overlap, and calibration is good in both groups.
  - **Education:** for women without high school (n = 39), the AUC interval includes 0.5. The model isn't shown to work for them, and the model card says so.

**Known gaps.**
- The bone T-score uses the standard NHANES III reference (young white women), as WHO/ISCD recommend. That reference may not suit every group equally.
- Validated menopause research centres on cisgender women. Trans men and nonbinary people who go through menopause, and women after surgical menopause, aren't well represented. We excluded surgical menopause from the NHANES comparison because it's a different exposure.
- Wearables cost money. Glitch works without one (voice logging, home BP), but its night-sweat signals need a band.
- English and US-centred: US blood-pressure categories, US crisis line, US survey data.

## 4. Harm mitigation

| Risk | Mitigation |
|---|---|
| False reassurance or alarm from a "risk score" | The hot-flash indicator is shown as educational, with its training range, accuracy, confidence interval and caveats. It warns when age is outside 35–48. |
| Seeing patterns that aren't there (personal triggers) | A permutation test plus Benjamini–Hochberg correction across all triggers. A trigger is only flagged if q < 0.10 and its confidence interval excludes no effect. We show the triggers that were tested but unclear, and we estimated the false-positive rate by simulation ([trigger-power.md](trigger-power.md)). |
| AI coach makes up health facts | Citations are restricted to trusted medical domains, and a verified PubMed library backs app claims. JSON actions are schema-validated. The app keeps working without AI. |
| App wording goes beyond the evidence | We audited every health claim against PubMed and changed the wording where it overstated ([claim-audit.md](claim-audit.md)). |
| Dangerous BP reading | A hard-coded safety message for ≥180/120 (re-measure; call 911 with symptoms), independent of the AI. |
| Mental-health crisis | PHQ-2/GAD-2 screening, with 988 Suicide & Crisis Lifeline messaging in check-ins and coach rules. |
| Confusing correlation with cause | Every population and personal finding says "association, not cause". The app has a raw-vs-same-age toggle that shows how confounding works. |

## 5. Transparency

- **Model cards** for the hot-flash model: training data, outcome, excluded features, held-out AUC with 95% CI, calibration, fairness summary.
- **"How we know"** sheet in the app: the full NHANES method, sample flow, every result including null ones, sensitivity analyses, group results, limitations.
- **We publish null results.** Blood pressure isn't higher after menopause once age is accounted for (OR 0.99), and we say so instead of hiding it.
- **Our statistics code is cross-checked.**
  - The survey estimator matches the `samplics` library exactly.
  - Regression standard errors agree with a delete-one-PSU jackknife to within 0.3% (`scripts/validate_nhanes_estimator.py`).
- **Reproducible.** Every number regenerates from scripts in `scripts/` with fixed seeds.

## 6. Data literacy (helping users read data)

- A **Raw / Same age toggle** shows the blood-pressure gap (+16 points raw) disappear once age is accounted for. It teaches confounding in one tap.
- **Uncertainty is shown** everywhere as plain-language intervals ("2.1× more flashes, 95% CI 1.4–3.0"), and an open vs filled dot shows whether an effect is clear.
- **"Tested, no clear link yet"** instead of silence, plus how many more days of logs would be needed to tell.
- The **doctor summary** turns logs into a one-page table a clinician can use.

## 7. Limitations we want judges to know

- NHANES is cross-sectional and can't identify perimenopause. Hot flashes aren't measured in 2013–2018.
- TSHS is small (n = 375) and old (2001 baseline). Its predictions are educational only.
- Night-sweat detection from wrist skin temperature hasn't been validated (we label it "possible"). The demo data is synthetic, so the demo's trigger results show the pipeline works, not real-world accuracy.
- The AI coach runs on a third-party LLM. We minimise and filter what it sees, but we can't fully guarantee its output.
