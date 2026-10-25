# Glitch: Devpost text, ethics reflection and 4-minute pitch

## Tagline
Glitch turns wearable data and a 10-second voice note into the evidence a doctor needs to treat menopause symptoms.

## The problem
- Menopause symptoms (hot flashes, night sweats, broken sleep, rising blood pressure) vary day to day, but a clinic visit is a 15-minute snapshot. Most women can't recall last month, so treatment is guesswork.
- Wearables record skin temperature and sleep every night, but nothing translates that into "this looks like a night sweat."
- Symptom diaries are tedious when you are exhausted, so people stop.

## What Glitch does
- **Voice-first logging.** Say "I'm having a hot flash" or "my blood pressure is 132 over 84" and it's logged.
- **Night-sweat detection** from wearable data: a night that is warm *compared with your own baseline* and has broken sleep.
- **Menopause staging** using the clinical STRAW+10 criteria, and alerts for high blood pressure (ACC/AHA), poor sleep and mood (PHQ-2/GAD-2).
- **Hot-flash risk factors** from a model trained on real study data, with "what if" estimates for changeable factors.
- **Personal trigger finder** with proper statistics, so a lucky streak of bad days isn't called a pattern.
- **Doctor summary**: a one-page weekly table to print.
- **You vs US women your age**, from CDC survey data.

## Data science (what is real and what is simulated)
| Method | Data | Result |
|---|---|---|
| Hot-flash risk: ridge logistic regression, repeated 5-fold CV | TSHS Hot Flashes study, n=375 women, ages 35–48 (real) | AUC 0.73 (95% bootstrap range 0.64–0.76), beats the always-predict-average baseline on Brier score (0.182 vs 0.216) |
| Fairness audit | Same data | Race and education are not model features. AUC by race 0.69 / 0.72, predicted vs observed rates within ~1 point. Adding them would not help (AUC 0.72), so excluding them costs nothing. The lower-education group has only 39 women, so that gap (AUC 0.59) is not conclusive. |
| Population reference | NHANES 2017–18, CDC, ~1,800 US women 35–79, survey-weighted (real) | Percentiles of blood pressure and sleep by age band |
| Night-sweat detector: rolling personal baseline (14-night median) plus a sleep-disruption check | Simulated nights with known answers, including confounders (alcohol/illness nights, stress-only bad sleep) | 6,780 nights: precision 94%, recall 43%, false alarms 1% (vs 16.5% using sleep alone). Threshold sweep included. |
| Ovulation detector: "3 over 6" temperature rule | 600 simulated cycles, 15% with no ovulation | Sensitivity 89%, specificity 92%, within 2 days 90% |
| Trigger analysis: permutation test + Benjamini–Hochberg correction | Per-user logs | A trigger is reported only if q ≤ 0.10 across all six candidates |

**Honest limits.** There is no public WHOOP dataset, so the demo wearable data is simulated. The detector results are a stress test on simulated ground truth, not clinical validation. The ovulation check on real hormone-confirmed data (mcPHASES) needs a signed data-use agreement and is the next step. The risk model comes from a small 2001 cohort and is shown as an educational indicator, never a prediction for an individual.

## Responsibility and ethics (paste into the Devpost ethics field)
- **Data sourcing.** Public data only: TSHS (CC BY-NC-SA, educational use, which is how we use it) and NHANES (US government, public domain). Raw files are never committed; only fitted coefficients and aggregate statistics are in the repo.
- **Privacy.** Personal data is encrypted on the device (AES-GCM, non-extractable key). There is no backend database. Camera and microphone are analysed in the browser. Only text and a mood label go to the language model, through a server-side proxy so the API key never reaches the browser. Hormone and ethnicity details are optional and consented.
- **Fairness.** We deliberately excluded race and education from the risk model, then audited subgroup performance anyway and showed it. We report where subgroups are too small to conclude anything.
- **Transparency.** Every estimate is labelled (educational, estimated, simulated). A model card explains training data, accuracy and limits inside the app.
- **Harm mitigation.** Not a diagnosis; treatment decisions belong with a clinician. High-blood-pressure and mood alerts point to a clinician rather than giving treatment advice. If the AI is down, the app still logs and alerts using built-in rules. A blood-pressure safety net prevents the AI from overriding readings.
- **Known risks.** Wearable data skews toward people who can afford devices. The risk model was trained on a cohort that is not representative of all menopausal women. Skin-temperature sensors can behave differently across skin tones, which we have not tested. Over-reliance is possible, which is why alerts always recommend seeing a clinician.
- **Accessibility.** Voice-first interaction helps people who find typing hard, and the app has a light and dark theme.

## 4-minute pitch (practice with a timer)
**0:00 – 0:30 · Problem.** "About 1.1 billion women will be postmenopausal by 2030. Their doctor sees them for 15 minutes. Their wearable sees them every night. Nobody connects the two."

**0:30 – 2:00 · Demo.** Open `/?reset`. Tap "Here for menopause support", then Connect WHOOP demo (say: "this is simulated data, there is no public WHOOP dataset"). Tap the mic and say "I'm having a hot flash", then "my blood pressure is 132 over 84". Show the night-sweat chart, then the doctor summary.

**2:00 – 3:15 · Data science.** "Three real pieces. First, a hot-flash risk model trained on 375 women from a real study, AUC 0.73. We left race out of the model, then audited it anyway: it performs about equally across groups, and including race would not have helped. Second, we compare each user with a US national survey, NHANES, so a blood pressure of 132 comes with context. Third, the night-sweat detector compares you with your own baseline. Since no public dataset has confirmed night sweats, we stress-tested it on simulated nights with known answers: right 94% of the time, 1% false alarms. And our trigger finder uses permutation tests with multiple-comparison correction, so one bad week isn't called a pattern."

**3:15 – 3:45 · Ethics.** "Everything is encrypted on the device. No database. Race isn't used. Every number is labelled as educational or simulated, and it never diagnoses. It tells you to see a clinician."

**3:45 – 4:00 · Close.** "Next: real WHOOP connection, validation on hormone-confirmed data, and a clinician pilot. Glitch gives women evidence, not guesswork."

## Likely judge questions
- **"Is the wearable data real?"** No. There is no public WHOOP dataset. We say so, and we tested the detectors on simulated ground truth. Real validation is the next step.
- **"AUC 0.73 is modest."** Yes. It is an educational risk indicator from a small cohort, labelled as such. The point is the method, the fairness audit and the honest reporting.
- **"Why not use race if it correlates with symptoms?"** It does correlate in this data. But using it would make individual estimates depend on a group label, and it does not improve accuracy (AUC 0.72 with, 0.73 without).
- **"Why is recall only 43%?"** We chose to favour few false alarms. The threshold sweep shows the trade-off: at 0.25 °C recall rises to 55% at about the same precision. It is configurable.
- **"Isn't this just an LLM wrapper?"** The language model only handles speech and phrasing. Staging, alerts, detection, risk and triggers are separate, tested code (131 unit tests), and the app still works if the AI is down.
