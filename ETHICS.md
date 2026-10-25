# Glitch: Responsibility and Ethics

Glitch is a voice-first coach for women in perimenopause and menopause. It handles sensitive health and reproductive data, so we treated ethics as engineering work with tests and numbers, not a paragraph. Every claim below points to code or a result you can re-run (`pnpm evidence`, `pnpm test`).

> Wellness insight, not a diagnosis. Treatment decisions belong with a clinician.

## 1. Where the data comes from
| Source | What it is | Licence / access | Who is missing | How we use it |
|---|---|---|---|---|
| TSHS Hot Flashes | 375 women aged 35–48, baseline of a 2001 cohort study | CC BY-NC-SA 4.0, educational use | Anyone over 48, post-menopausal women, anyone not in that cohort, very small education subgroup (n=39) | Train an *educational* risk indicator. We follow the licence: it is never shown as a prediction for one person |
| NHANES 2017–18 | 1,811 US women aged 35–79, survey-weighted (CDC) | Public domain | Non-US women, people without a clinic visit | Percentiles of blood pressure and sleep by age band, as context only |
| Simulated nights and cycles | Generated with known answers | Ours | n/a | Stress-test the detectors. Always labelled *simulated* |
| WHOOP-style demo data | Generated | Ours | n/a | Demo only. No public WHOOP dataset exists |

Raw datasets are never committed: only fitted coefficients and aggregates are in the repo.

## 2. Privacy
- **On device.** Logs, profile, cycle history and WHOOP data are encrypted with AES-GCM and a non-extractable key. There is no backend database.
- **Camera and microphone** are analysed in the browser. Form Coach video and voice audio never leave the device.
- **The AI coach is the only thing that leaves the device, and the user decides how much.** We audited this and found our own earlier wording ("only text and a mood label") was inaccurate: the coach prompt included the user's name, conditions, meals, WHOOP scores, menopause stage and consented hormone details. We fixed it:
  - **AI off**: nothing leaves the device; built-in rules still log and alert.
  - **Chat only (default)**: the coach sees only what the user says or types.
  - **Chat + health summary**: opt-in; the list of what is shared is shown in the app.
  - A live panel shows the exact text sent this session (kept in memory only).
  - Tests prove that in *chat only* mode none of name, conditions, meals, menopause stage or hormone data appears in the prompt, and that *off* sends nothing (`aiService.test.ts`, `coachAgent.test.ts`).
- **Server.** The Groq key is server-side. The server keeps no database and logs only its startup line.
- **Data rights.** In-app *Export all my data*, *Disconnect WHOOP* and *Delete everything* (destroys the key).
- **Sensitive by design.** Ethnicity and hormone/contraception details are optional, consented, and never used for scoring.

## 3. Bias and fairness
We looked for bias in the model, in the sensors and in the product.

**Model.** We do **not score anyone by race or education**. But leaving a group out of a model is not a fairness claim: a model that never looks at race cannot show whether it treats groups differently. So we use race and ethnicity to **measure**, not to score ("fairness through awareness"), and we publish what we find (see [EVALUATION.md](EVALUATION.md) and the in-app *Groups* and *Fairness* tabs).
- *Ranking is similar across groups:* AUC 0.69 and 0.72 by race. *Calibrated within groups:* predicted vs observed rate 26% vs 25% and 37% vs 39%.
- *Adding race and education does not improve accuracy* (AUC 0.72 vs 0.73), so there is no accuracy reason to score people by them.
- **But error rates are not equal at a fixed cutoff.** Flagging "above the study average" flags 54% of the African American group vs 30% of others, catches 80% vs 58% of real cases, and raises 38% vs 21% false alarms. Their base rate is higher (39% vs 25%), and when base rates differ, calibration and equal error rates cannot both hold (the Kleinberg and Chouldechova result). We chose calibrated probabilities, show a continuous gauge, and **never use the flag to gate care, deny anything or label a person**.
- **Why we don't simply put race in:** it did not help accuracy; race is a stand-in for income, access to care, stress and discrimination rather than biology; and race-based scoring has caused harm in medicine (for example race "corrections" in kidney and lung tests). Context can still matter, which is why ethnicity-aware SWAN messages exist, only with consent, and never change a score or an alert.
- **National disparities (NHANES, women 35 to 79, age-standardised):** blood pressure at or above 130/80 is 62% in Black women, 51% Asian, 45% Hispanic and 38% White; sleeping under 6 hours is 14% vs 7% (Black vs White). In TSHS the hot-flash gap (odds ratio 1.89) shrinks to 1.13 (not significant) after accounting for earlier symptoms, BMI, smoking and age group, factors that can themselves reflect unequal conditions.
- **Regions are not studied:** neither dataset records where people live.
- The lower-education group is only 39 women (AUC 0.59), so we report it as a hint, not a verdict.
- **Honest finding from the error analysis:** the model's yes/no calls match the single question "have you had symptoms before?" exactly. Most of its value is one strong signal turned into a probability, and the app says so.

**Sensors.** Wearable skin temperature may be less accurate across skin tones; we have not measured this. We simulated two failures and re-ran the night-sweat detector:
- a constant offset (sensor reads 0.5 °C high or low): **no effect**, because each woman is compared with her own 14-night baseline;
- extra noise: precision falls from 94% (reference) to 86% at 2× noise and 78% at 3×, and false alarms rise from 1% to 3.7%.
This is the case for personal baselines, and the motivation for a real pilot across skin tones.

**Product.** The ethnicity-specific SWAN message is opt-in, framed supportively ("you deserve to be taken seriously by your clinician"), and never changes a score or an alert.

## 4. Harms we considered
| Harm | Who is affected | What we built | Remaining risk |
|---|---|---|---|
| **False reassurance** (no flag read as "I'm fine") | Anyone | Detector catches ~43% of real sweats at default; the UI says "no flag does not mean no sweat, trust how you felt" | Users may still over-trust; a pilot should measure it |
| **False alarms and anxiety** | Anyone | 1% false-alarm rate on simulated nights; alerts say "talk to a clinician", never diagnose | Real-world rate unknown |
| **Reproductive and health data exposure** (cf. FTC action against Flo Health, 2021) | Everyone, especially where reproductive care is restricted | No backend database; encrypted on device; AI mode defaults to chat only; one-tap delete | A lost or unlocked device |
| **AI gives medical advice or hallucinates** | Anyone | Prompt tells the coach to defer treatment questions to a clinician; actions are schema-validated; citations only from allow-listed medical domains; offline rules if the AI is down | LLM errors in free text |
| **Stereotyping** from ethnicity-aware messages | Minority groups | Opt-in, supportive framing, never used for scoring | Perception |
| **Model trained on a small 2001 cohort** | Women over 48, non-US, other groups | "Educational" label, model card in app, out-of-range warning | Limited generalisation |
| **Sensor bias across skin tones** | Darker skin tones (hypothesised) | Personal baseline; noise stress test | Untested on real devices |
| **Mental-health screen misuse** | Users with low mood | PHQ-2/GAD-2 wording points to a clinician and the 988 line; never a diagnosis | A screen is not care |
| **Simulated data mistaken for real** | Judges, users | Labelled *demo* and *simulated* in app, slides and README | None known |
| **Excluding people** | People who can't afford a wearable, can't type | Works without a wearable (manual logs, voice); voice-first | Wearable cost bias remains |

**Grounding and food.** Exercise plans and coach answers are grounded in a small cited library (retrieval on the device), and every plan shows which passages it used. Food targets are computed from the user's own numbers, not generated by a language model, so they cannot be hallucinated. We found the food-photo feature silently logged an invented "Mixed Meal, 400 kcal" when analysis failed; it now refuses to guess and asks the user to type the meal in, and photos need consent in chat-only mode.

## 5. Transparency
- Every number is labelled *educational*, *estimated* or *simulated*.
- A model card in the app lists data, accuracy, exclusions and limits.
- The *Model evidence* screen shows calibration, subgroup results, error rates and sensor stress tests.
- The README and slides separate real data (TSHS, NHANES) from simulated data.
- We corrected two of our own earlier claims during this review (privacy wording and "equal across groups"). We list them so you can see the audit worked.

## 6. Accessibility
- Voice-first interaction, large type, light and dark themes.
- We ran **axe-core (WCAG 2.1 A and AA)** on six screens. It found: pinch-zoom disabled, a chart with no text alternative, and low-contrast buttons. All fixed; the re-run shows **zero violations** on home, Cycle, the evidence card (all three tabs) and Progress.
- The whole app now respects the system *reduce motion* setting.
- Charts have text equivalents (labels, tables, alt text); outcomes are shape and letter as well as colour. Chart colours pass colour-blind and contrast checks in both themes.
- Not done: a screen-reader walkthrough with a real user, and captions for any audio.

## 6b. AI use disclosure
This project was built with AI assistance (Kiro and Claude Code). The team set the problem and reviewed and curated the output. We checked it with 167 automated tests, an accessibility audit and the fairness analysis above.

## 7. Limits we are upfront about
- No real WHOOP data and no real night-sweat labels: detector results are a stress test on simulation, not clinical validation.
- The risk model is a small 2001 cohort and an educational indicator only.
- Ovulation validation on real hormone data (mcPHASES) needs a signed data-use agreement and has not been run.
- We have not tested with users, clinicians or across skin tones.
- Some evidence passages could be verified against their source pages (CDC, AAOS, Frontiers review, STRAW+10); others rely on the team's research deck or a consensus summary and should be re-checked.
- No in-app "report a problem" button yet.

## 8. What we would do next
Pilot with 20–30 women aged 40–60 with consent, including a range of skin tones; clinician review of the doctor summary; validate detectors on hormone-confirmed data; set the default AI mode with the pilot users.

## 9. Ethics-driven changes made during the hackathon
1. Found the privacy claim was wrong, then built AI modes, a default of chat only, and a live "what was sent" panel.
2. Found "equal across groups" was only true for ranking and calibration, then published the error-rate gaps and the base-rate explanation.
3. Added "no flag is not reassurance" after measuring 43% recall.
4. Ran an accessibility audit and fixed every violation it found.
5. Stress-tested the detector for sensor bias.
