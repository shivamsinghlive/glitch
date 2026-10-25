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
- **Plans built from your choices, grounded in evidence.** Pick goal, equipment, training styles and days; the weekly plan and food targets rebuild instantly. Each exercise says why it's there, with cited passages retrieved on-device (BM25 RAG). The coach is grounded the same way.
- **Bone-health training and Form Coach**: strength and impact work for bone and muscle, with camera-based form feedback (MediaPipe, on-device).
- **Food, three ways**: voice, photo (with consent) or typed; targets computed from your numbers (Mifflin-St Jeor), and a failed photo analysis never invents numbers.
- **Also**: supplement timing rules, on-device mood reading, appraisal-based check-ins, PHQ-2/GAD-2 screening, export and delete-everything.
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
| Evidence-grounded plans: BM25 retrieval over a cited library, rule-based planner | 13 cited passages (CDC, AAOS, Frontiers review, LIFTMOR, meta-analysis, ESCEO) | Every plan lists the passages it used; tests show it follows equipment, styles and days |
| Nutrition targets: Mifflin-St Jeor + menopause protein guidance | The user's own age, weight, height, goal | Updates instantly; macros add up; safe floors; tested |

**Honest limits.** There is no public WHOOP dataset, so the demo wearable data is simulated. The detector results are a stress test on simulated ground truth, not clinical validation. The ovulation check on real hormone-confirmed data (mcPHASES) needs a signed data-use agreement and is the next step. The risk model comes from a small 2001 cohort and is shown as an educational indicator, never a prediction for an individual.

## Responsibility and ethics (paste into the Devpost ethics field; full version in ETHICS.md)
**We audited our own claims and fixed what we found.**
- **Privacy.** Data is encrypted on the device with no backend database. Our first claim, "only text and a mood label reach the AI", was wrong: the coach prompt included name, conditions, meals, WHOOP scores and menopause stage. We built three AI modes (off, chat only as the default, opt-in health summary) and a live panel showing exactly what was sent. Tests prove chat-only mode leaks none of it.
- **Bias and fairness.** We never score a person by race or education, but we use them to *measure*: a model that never looks at race can't show whether it treats groups differently. Ranking (AUC 0.69 and 0.72 by race) and calibration are similar across groups, and adding race would not improve accuracy. But at one cutoff the model flags 54% of one group and 30% of the other, with false alarms of 38% vs 21%, because base rates differ (39% vs 25%); calibration and equal error rates can't both hold then. We chose calibrated probabilities, publish the gaps, and never use the flag to gate care. National data shows where the real disparities are: after adjusting for age, 62% of Black women have blood pressure of 130/80 or higher vs 38% of White women. Regions are not studied; neither dataset has geography.
- **Honest error analysis.** The risk model's yes/no calls match the single question "have you had symptoms before?" exactly (F1 0.61, MCC 0.40, AUC 0.73 vs 0.71), so most of its value is one strong signal. The night-sweat detector has 94% precision but 44% recall; 87% of its misses are sweats with no temperature rise and 88% of its false alarms are warm nights that weren't sweats.
- **Sensor bias.** Skin-temperature accuracy across skin tones is untested, so we simulated it: a constant offset has no effect (each woman is compared with her own baseline), but 3x noise cuts precision from 94% to 78%. A pilot across skin tones is our first next step.
- **Harm mitigation.** A table of ten harms with mitigations (false reassurance, false alarms, reproductive-data exposure, AI hallucination, stereotyping, small old training cohort, sensor bias, mental-health screening, simulated data mistaken for real, exclusion). The detector catches about 43% of real sweats, so the app says "no flag does not mean no sweat". Not a diagnosis; alerts point to a clinician; the app works without the AI.
- **Transparency.** Every number is labelled educational, estimated or simulated; model card and a Model evidence screen in the app.
- **Accessibility.** axe-core (WCAG 2.1 A and AA) found pinch-zoom disabled, a chart with no text alternative and low-contrast buttons on six screens. All fixed, zero violations on re-run. The app respects reduce-motion. Not done: a screen-reader session with a real user.
- **Data sourcing.** TSHS (CC BY-NC-SA, educational use, as we use it) and NHANES (public domain). Raw files are never committed. Datasheets with who is missing are in ETHICS.md.

## 4-minute pitch (practice with a timer)
**0:00 – 0:30 · Problem.** "About 1.1 billion women will be postmenopausal by 2030. Their doctor sees them for 15 minutes. Their wearable sees them every night. Nobody connects the two."

**0:30 – 2:00 · Demo.** Open `/?reset`. Tap "Here for menopause support", then Connect WHOOP demo (say: "this is simulated data, there is no public WHOOP dataset"). Tap the mic and say "I'm having a hot flash", then "my blood pressure is 132 over 84". Show the night-sweat chart, then the doctor summary.

**2:00 – 3:15 · Data science.** "Three real pieces. First, a hot-flash risk model trained on 375 women from a real study, AUC 0.73. We left race out of the model, then audited it anyway: it performs about equally across groups, and including race would not have helped. Second, we compare each user with a US national survey, NHANES, so a blood pressure of 132 comes with context. Third, the night-sweat detector compares you with your own baseline. Since no public dataset has confirmed night sweats, we stress-tested it on simulated nights with known answers: right 94% of the time, 1% false alarms. And our trigger finder uses permutation tests with multiple-comparison correction, so one bad week isn't called a pattern."

**3:05 – 3:45 · Ethics (two slides).** "We audited ourselves. Our privacy claim was wrong, so we built three AI modes and a live view of what is sent. Our model ranks groups fairly but at one cutoff flags 54% of one group and 30% of another, because base rates differ. We publish that and never use the flag to gate care. We stress-tested sensor bias and ran an accessibility audit: zero violations after fixes."

**3:45 – 4:00 · Close.** "Next: real WHOOP connection, validation on hormone-confirmed data, and a clinician pilot. Glitch gives women evidence, not guesswork."

## Likely judge questions
- **"Is the wearable data real?"** No. There is no public WHOOP dataset. We say so, and we tested the detectors on simulated ground truth. Real validation is the next step.
- **"AUC 0.73 is modest."** Yes. It is an educational risk indicator from a small cohort, labelled as such. The point is the method, the fairness audit and the honest reporting.
- **"Why not use race if it correlates with symptoms?"** It does correlate in this data. But using it would make individual estimates depend on a group label, and it does not improve accuracy (AUC 0.72 with, 0.73 without).
- **"Why is recall only 43%?"** We chose to favour few false alarms. The threshold sweep shows the trade-off: at 0.25 °C recall rises to 55% at about the same precision. It is configurable.
- **"Isn't this just an LLM wrapper?"** The language model only handles speech and phrasing. Staging, alerts, detection, risk and triggers are separate, tested code (167 unit tests), and the app still works if the AI is down.
