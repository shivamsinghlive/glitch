# Glitch — find the bug, fix your health

**Track:** HealthHack · **Also for:** BU Libraries Data Ethics & Data Literacy Prize

## Inspiration
More than a billion women worldwide are in or past menopause. Hot flashes, broken sleep, low mood and
bone loss are common, yet symptoms often go untracked and get dismissed in short appointments. Women are
told "it's just age". We wanted to give them data they can trust and bring to their doctor, and we wanted to
be honest about what the data does and doesn't show.

## What it does
Glitch is a voice-first menopause companion.
- **Talk, don't type.** Say "I'm having a hot flash" or "my blood pressure is 132 over 84" and it's logged.
- **Your body, at a glance.** Hot flashes, sleep, HRV, possible night sweats (skin temperature plus broken sleep), BP and mood from a wearable and voice.
- **Your triggers, tested statistically.** An n-of-1 analysis of your own logs tells you which triggers show a real link, which don't yet, and how many more days of logging it would take.
- **What US women show.** Population evidence from NHANES on how menopause relates to bone, sleep, mood and blood pressure, with a Raw / Same-age toggle that teaches confounding.
- **Doctor summary.** A one-page printable report with weekly trends, statistically supported triggers and questions to ask.

## Data science
Three levels of analysis, each feeding a feature:

**1. Population: NHANES 2013–2018 (CDC), 1,941 women aged 40–59**
- **Method:** survey-weighted logistic and linear regression with design-based (Taylor linearisation) variance, adjusted for age, age², BMI and smoking. Risk differences come from predictive margins, with Benjamini–Hochberg FDR correction across 8 outcomes.
- **Robustness:** three sensitivity analyses (adding race, income and education; ages 45–55 only; never-HRT users), per-group models with interaction tests, and small-cell suppression.
- **Finding:** femoral-neck bone density is 0.056 g/cm² lower after menopause (95% CI 0.022–0.090, q = 0.015) and holds in every sensitivity check. That's why Glitch puts strength and impact training first.
- **Null finding:** raw hypertension is 15.8 points higher after menopause, but at the same age the difference is −0.2 points (OR 0.99). Ageing explains the gap. We report this null result instead of hiding it.
- **Validation:** our estimator matches the `samplics` survey library exactly, and its standard errors agree with a delete-one-PSU jackknife to within 0.3%.

**2. Prediction: hot-flash risk (TSHS cohort, n = 375)**
- **Model:** logistic regression compared against gradient boosting and a baseline on shared repeated stratified CV folds.
  - AUC 0.75 with hormone labs (held-out 95% CI 0.70–0.80), significantly better than gradient boosting.
  - Brier score 0.18 vs 0.22 with no skill. Calibration slope 0.92–0.94.
- **Fairness:** race and education are not model inputs, but we audited performance by group anyway and published the gaps (see Ethics).

**3. Personal: n-of-1 trigger analysis**
- **Method:** a Poisson rate ratio with 95% CI for each candidate trigger, plus a permutation test and BH correction. A trigger is flagged only if q < 0.10 and the CI lower bound is above 1.
- **Calibration:** simulations show the full procedure shows at least one false trigger to no more than 9% of users when no trigger is real, even with overdispersed counts.
- **Power analysis:** the app tells each user how many days they'd need (for example, about 81 days to detect a 1.5× trigger at 3 flashes a day).

**Evidence library:** 28 claims backed by 44 verified PubMed papers. We audited every health claim in the app against them and rewrote the ones that overstated the evidence.

## Responsibility & ethics
- **Privacy:**
  - Data is encrypted on the device (AES-GCM, non-extractable key) and there is no backend database.
  - Camera and microphone are analysed in the browser.
  - Ethnicity is never sent anywhere.
- **Consent:** hormone and ethnicity details are optional, and "prefer not to say" is always available.
- **Fairness:**
  - The NHANES analysis is survey-weighted and repeated within each race/ethnicity group. No clear between-group differences were found (interaction p ≥ 0.085), and small groups are suppressed.
  - In the hot-flash model audit, AUC is similar for African American and Caucasian women. It isn't established for women without a high-school education (n = 39), and the model card says so.
- **Harm mitigation:**
  - The app says "association, not cause" and "not a diagnosis".
  - A hard-coded BP crisis message and 988 crisis messaging work independently of the AI.
  - AI citations are restricted to trusted sources, backed by the verified evidence library.
- **Transparency:** model cards, a "How we know" sheet with null results, limitations, and reproducible scripts with fixed seeds.
- **Who we might miss:** people after surgical menopause, trans and nonbinary people, non-US populations, and people without wearables. These are documented in [ETHICS.md](ETHICS.md).

## How we built it
- **App:** React 19, TypeScript, Vite, Tailwind, Recharts, framer-motion.
- **On-device AI:** MediaPipe face and pose analysis plus Web Speech for voice.
- **LLM:** Groq, through a server-side proxy with failsafes.
- **Analysis:** Python (numpy, pandas, scipy, scikit-learn, samplics for validation). Vitest covers 140+ tests.

## Challenges
- The Apple Women's Health Study data isn't public, so we switched to NHANES, which is public and nationally representative.
- NHANES can't identify perimenopause and doesn't measure hot flashes, so we kept those claims scoped.
- Getting the survey statistics right: domain estimation, design degrees of freedom, and validating the estimator.
- Our own claim audit found 13 places where the app's wording went further than the evidence. We fixed them.

## What we learned
Raw comparisons can mislead. Blood pressure "rises after menopause" in raw numbers, but not once you compare women of the same age.
Honest uncertainty ("no clear link yet, you need about 80 days") is more useful to users than a confident guess.

## What's next
- Validate night-sweat detection against sternal skin-conductance studies.
- Add SWAN public-use data (hot flashes, longitudinal) via ICPSR.
- A local-only mode with an on-device LLM.
- Clinician co-design.

## Built with
react · typescript · python · numpy · pandas · scipy · scikit-learn · samplics · recharts · mediapipe · groq · vitest · nhanes · pubmed
