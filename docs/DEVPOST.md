# Glitch — find the bug, fix your health

**Track:** HealthHack · **Also for:** BU Libraries Data Ethics & Data Literacy Prize

## Inspiration
Medicine has studied women's bodies far less than men's. In neuroscience, male-only animal studies outnumbered
female-only ones 5.5 to 1. Women have adverse drug reactions nearly twice as often as men, and in 2013 the FDA
halved the zolpidem (Ambien) dose for women after learning they clear it more slowly. The rete ovarii, a structure
attached to the ovary, was dismissed as a leftover for about 150 years. New mouse research suggests it's active.

One of us started lifting and kept hitting a wall. Some weeks she felt strong. In the days before her period she felt
low, couldn't lift as much, craved everything and dropped her routine, then felt guilty for "failing". Nobody had told
her that her body changes across the month, or how hers does. That gap gets bigger in pregnancy, after birth and
around menopause.

## What it does
Glitch is a voice-first health companion for women at every life stage. No wearable is needed.
- **Pick your stage:** periods, pregnancy, postpartum, or perimenopause/menopause. Home adapts to each.
- **A 20-second daily check-in:** energy, mood, cravings, cramps, sleep, and how strong your workout felt.
- **Your pattern, not the textbook's:** Glitch tests your own check-ins by cycle phase and only tells you about differences that hold up statistically. For example: "Mood is 1.2 points lower in your luteal phase (33 days logged)." With no clear pattern it says "train as planned". Many women don't follow the textbook.
- **Advice from your data:** lighter sessions, planned snacks or an easier day, only when your own logs justify it, each with a PubMed source.
- **Welcome back, without guilt:** after a missed week, Glitch links it to your phase when relevant and offers a 10-minute restart.
- **Pregnancy and postpartum:** safe-movement and nutrition guidance, plus mood check-ins. If low mood keeps showing up, Glitch says so gently and links the National Maternal Mental Health Hotline.
- **Menopause:** hot flashes, sleep, blood pressure, bone health, tested personal triggers, and a printable doctor summary.
- **Talk, don't type:** say "I'm having a hot flash" or "I missed a week, help me restart".

## Data science
Four analyses, each feeding a feature.

**1. Population across life stages: NHANES 2013–2018 (CDC), 4,163 women aged 20–59**
- **Groups:** cycling (n = 3,094, the reference), pregnant (190), breastfeeding as a postpartum proxy (118), and natural post-menopause (761). Surgical menopause and unknown status were excluded, with the full exclusion flow reported.
- **Method:** survey-weighted logistic and linear regression with design-based variance, adjusted for age, age² and smoking, with Benjamini–Hochberg FDR correction across 11 contrasts. Sensitivity analyses add BMI, restrict to matched ages, and use a second postpartum proxy (birth in the past 12 months). Cells below NCHS reliability thresholds are suppressed.
- **Finding:** after correction, no stage clearly differs from cycling women on depression or sleep. The strongest hint is that breastfeeding women report short sleep more often (OR 1.87, 95% CI 1.18–2.94, q = 0.06). This holds in all three sensitivity analyses.
- **Why it matters:** population averages barely separate life stages, let alone individual women. That is the case for learning each woman's own pattern.

**2. Personal: n-of-1 patterns by cycle phase**
- **Method:** for every metric × phase, compare days in that phase with all other days using a two-sided permutation test, with BH-FDR across all comparisons. A pattern is shown only if q < 0.10 and the difference is at least 0.5 points.
- **Safeguards:** at least 4 logged days per side, seeded tests (results are reproducible), and the advice text depends only on significant findings.
- **Tests:** unit tests check that a planted pattern is found and that a flat log produces no false findings.
- The same approach powers the menopause trigger analysis: a Poisson rate ratio with 95% CI, a permutation test and BH correction. Simulations cap the false-trigger rate at 9% and estimate the days needed to detect a trigger.

**3. Menopause population: NHANES, 1,941 women aged 40–59**
- **Method:** survey-weighted regression adjusted for age, age², BMI and smoking, with sensitivity analyses and race/ethnicity interaction tests.
- **Finding:** femoral-neck bone density is 0.056 g/cm² lower after menopause (q = 0.015).
- **Null finding:** raw hypertension is 15.8 points higher, but OR 0.99 at the same age.
- **Validation:** our estimator matches the `samplics` survey library exactly, and a delete-one-PSU jackknife to within 0.3%.

**4. Prediction: hot-flash risk (TSHS cohort, n = 375)**
- **Model:** logistic regression vs gradient boosting vs a baseline on shared repeated CV folds. AUC is 0.75 with hormone labs (95% CI 0.70–0.80), and the model is calibrated.
- **Fairness:** a by-group audit is published. Race and education are never used as inputs.

**Evidence library:** 41 claims backed by 66 PubMed records, each retrieved and checked against the abstract. Our claim audit rewrote 13 places where the app said more than the evidence supports. New claims were narrowed to fit their sources: we cite energy intake, not "cravings", in the luteal phase, and we label the rete ovarii work as mouse research.

## Responsibility & ethics
- **Working with BU Libraries:**
  - **Used:** PubMed (every claim), CDC NHANES (public, de-identified) and the TSHS teaching dataset.
  - **Not used, and why:**
    - Apple Women's Health Study: no public participant-level data, so we cite only published findings.
    - Mintel: licensed market research, used only for framing and never shipped.
    - Harvard Dataverse: searched, nothing suitable in time.
- **Privacy:** data is encrypted on the device (AES-GCM) with no backend database. Camera and mic are processed locally. AI privacy modes show exactly what's sent.
- **No myths:** we never tell a woman she'll be weaker in her luteal phase. Research finds only small, inconsistent average effects, so Glitch tests her own data and says "no clear pattern" when that's the answer.
- **Harm mitigation:**
  - No calorie deficit in pregnancy or postpartum.
  - Persistent low mood triggers a referral to the perinatal hotline.
  - PMDD and endometriosis prompts point to a clinician.
  - 988 crisis messaging works independently of the AI.
  - "Association, not cause" and "not a diagnosis" appear throughout.
- **Fairness:** the NHANES analyses are survey-weighted and checked by race/ethnicity. Small cells are suppressed.
- **Who we might miss:**
  - People with irregular cycles, PCOS or hormonal contraception (calendar phases are estimates).
  - Trans and nonbinary people who menstruate.
  - Non-US populations.
  - People with low literacy or no smartphone.

## How we built it
- **App:** React 19, TypeScript, Vite, Tailwind, framer-motion.
- **On-device AI:** MediaPipe and Web Speech.
- **LLM:** Groq, through a server-side proxy with failsafes.
- **Analysis:** Python (numpy, pandas, scipy, scikit-learn, samplics).
- **Tests:** 198 Vitest tests, including statistical calibration tests.

## Challenges
- **No postpartum flag:** NHANES doesn't have one, so we used two proxies (breastfeeding, and birth in the past 12 months) and labelled them as proxies.
- **Pregnancy and depression screening overlap:** PHQ-9 items like sleep, fatigue and appetite overlap with normal pregnancy, which we flag as a caveat.
- **Mostly null results:** we had to say plainly when the data shows nothing, and build the product around that.

## What we learned
Averages hide individuals, and confident myths do harm. "Your logs show no clear dip, so train as planned" respects a woman more than a generic phase chart.

## What's next
- Validate the n-of-1 phase test on real check-in data (mcPHASES on PhysioNet, credentialed access).
- Detect phase from wearable temperature instead of the calendar.
- Clinician and user co-design, including PMDD and perinatal mental-health experts.

## Built with
react · typescript · python · numpy · pandas · scipy · scikit-learn · samplics · framer-motion · mediapipe · groq · vitest · nhanes · pubmed
