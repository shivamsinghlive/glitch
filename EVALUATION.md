# Glitch: Evaluation and error analysis

Every number below is produced by code you can re-run (`pnpm evidence`) and is shown inside the app on the **Model evidence → Scores** tab. "Real" means a public dataset of real people. "Simulated" means we generated cases where we know the right answer, because no public dataset exists for that question. Simulated results are a stress test of the method, not proof it works on real people.

## The words, in plain language
Every detector in Glitch answers a yes/no question ("is this a night sweat?"). It can be right or wrong in four ways:

|  | The answer really was **yes** | The answer really was **no** |
|---|---|---|
| **It said yes** | **True positive (TP)**: a hit | **False positive (FP)**: a false alarm. Worry for nothing. |
| **It said no** | **False negative (FN)**: a miss. Can falsely reassure. | **True negative (TN)**: correctly quiet |

- **Accuracy** = how often it was right overall. It misleads when one answer is rare: if only 1 night in 4 is a sweat, always saying "no" is 75% accurate and finds nothing. So we always compare with a dumb baseline.
- **Precision** = when it says yes, how often it is right. (Low precision = lots of false alarms.)
- **Recall (sensitivity)** = of the real yeses, how many it catches. (Low recall = lots of misses.)
- **Specificity** = of the real nos, how many it leaves alone.
- **F1** = one number that balances precision and recall (1 is perfect, 0 is useless).
- **MCC** = a fair single score even when one answer is rare (0 = no better than chance, 1 = perfect).
- **AUC** = how well it ranks people from lower to higher risk (0.5 = coin flip, 1 = perfect).
- **Calibration** = when it says "40% risk", do about 40% of people actually have it.

## What each part does, and how it scored

### 1. Hot-flash risk model (real data: TSHS study, 375 women)
**What it does:** from a few answers (age group, smoking, BMI, earlier symptoms), estimates how likely a woman is to report hot flashes compared with the study average.

At the "above study average" cutoff (32%), cross-validated:

| | Really had hot flashes | Really didn't |
|---|---|---|
| **Flagged** | 84 hits | 73 false alarms |
| **Not flagged** | 34 misses | 184 correctly quiet |

Accuracy 72%, precision 54%, recall 71%, specificity 72%, **F1 0.611**, **MCC 0.403**, AUC 0.727 (95% range 0.64 to 0.76), PR-AUC 0.469, log-loss 0.544, Brier 0.182 vs 0.216 for always guessing the average.

**Against dumb baselines:** always saying "no" gets 68% accuracy but F1 0 and MCC 0. Always saying "yes" has F1 0.479 but is wrong 68% of the time.

**Error analysis (the important finding):** the model's yes/no calls are **identical** to the single question "have you had symptoms before?" (same 84/73/34/184; that rule's AUC is 0.714 vs the model's 0.727).
- Every one of the 34 **misses** is a woman with **no** earlier symptoms.
- Every one of the 73 **false alarms** is a woman **with** earlier symptoms.
- Smoking and BMI add little: BMI 30+ in 40% of false alarms vs 29% of correct negatives.
So the model is mostly one strong question turned into a calibrated probability. We say so in the app, and it is why we show a gauge against the study average, not a label.

### 2. Night-sweat detector (simulated: 6,780 nights)
**What it does:** flags a night as a likely sweat when skin temperature is well above the woman's own 14-night baseline **and** sleep was broken.

| | Really a sweat | Really normal |
|---|---|---|
| **Flagged** | 750 hits | 51 false alarms |
| **Not flagged** | 973 misses | 5,006 correctly quiet |

Accuracy 85%, precision 94%, recall 44%, specificity 99%, F1 0.594, MCC 0.574.

**Against baselines:** always "normal" is 75% accurate and finds nothing. Warm skin alone: F1 0.594, 7% false alarms. Broken sleep alone: F1 0.653, recall 72%, but 16% false alarms. Both together trade recall for trust: only 1% false alarms.

**Error analysis:** 87% of the 973 misses were real sweats where skin temperature barely rose, so the detector never saw them. 88% of the 51 false alarms were warm nights that weren't sweats (alcohol, illness, a hot room), which temperature cannot tell apart. Sensor stress test: a constant offset changes nothing; 3x noise cuts precision from 94% to 78%.
**Honest read:** on this data, broken sleep alone has the best F1. We chose the combined rule for fewer false alarms, not for a better F1.

### 3. Ovulation detector (simulated: 1,000 cycles, 15% with no ovulation)
**What it does:** confirms ovulation when skin temperature rises and stays up ("3 over 6" rule).

| | Really ovulated | Really no ovulation |
|---|---|---|
| **Said ovulated** | 739 hits | 15 false alarms |
| **Said not** | 110 misses | 136 correctly quiet |

Accuracy 88%, precision 98%, recall 87%, specificity 90%, F1 0.922, MCC 0.641.
**Against a baseline:** "always ovulated" scores F1 0.918 (almost the same!) only because 85% of cycles ovulate, and it never rejects a non-ovulatory cycle (MCC 0). The detector's real value is rejecting them (specificity 90%).
**Error analysis:** misses depend on the size of the temperature rise: 31% when the rise is under 0.3 °C, 10% at 0.3 to 0.4 °C, 2% at 0.4 °C or more. When it detects ovulation it is 1.06 days off on average, and runs 0.37 days late; 89% are within 2 days.

### 4. Trigger finder (simulated: 500 users, 60 days each)
**What it does:** finds foods or situations that go with more hot flashes (alcohol, caffeine, stress…).
A simple rule ("more than 1.5× flashes on trigger days") reports a **false trigger for 24% of users who have no real trigger**. Our permutation test with multiple-comparison correction cuts that to **9%**.
The price is caution: it finds a real trigger 33% of the time at 1.5×, 79% at 2×, 100% at 3× (the simple rule: 54%, 90%, 100%). A mild trigger is often missed in 60 days.

### 5. Evidence retrieval ("RAG": finds the cited passages behind plans and coach answers)
**What it does:** given a question, finds the most relevant passages in a library of 13 cited statements (BM25 search, on the device).
On 18 questions we wrote and labelled by hand: right passage first 94%, right passage in the top 3 100%, precision@3 86%, recall@3 92%, MRR 0.972. Picking 3 at random: top-3 hit 36%, precision 13%. Small talk retrieves nothing (6 of 6), so the coach doesn't attach evidence to "hello".
**Error analysis / limits:** our first run missed "when should I get a bone density scan" (a vocabulary gap), which we fixed. The question set was written by us and tuned after seeing that miss, so treat the numbers as a sanity check, not an independent benchmark. Retrieval finds relevant text; it does not check the text is applied correctly to a person.

### 6. Plan builder (checked on 3,000 random combinations of goal, equipment, styles and days)
Asked for equipment the user doesn't have: **0**. Training days left empty: **0**. Bone-health plans (3+ days) with 2 to 3 strength days: **1075 of 1075**. Exercises with a citation: **100%**. Plans containing something from a style the user chose: **99%** (72% of all exercises, because goals sometimes need strength the user didn't pick, and the plan says so).

### 7. Nutrition targets and food logging
Targets use the published Mifflin-St Jeor equation, so they are deterministic and unit-tested (they scale with weight, height, age, goal and training days; macros add up to calories; a safe calorie floor; no deficit when unsafe). Individual energy needs vary by roughly 10 to 15% from any equation, so treat them as a starting point. Food logging used to invent a "Mixed Meal, 400 kcal" when photo analysis failed; it now refuses to guess and asks the user to type the meal in.

## Who is affected most (fairness and disparities)
We do not score anyone by race, but we **use race and ethnicity to measure** differences (a model that never looks at race cannot show whether it treats groups differently).
- **Model, by group (TSHS):** ranking is similar (AUC 0.69 and 0.72), and probabilities are calibrated within each group. But at one cutoff, errors differ: the African American group is flagged 54% vs 30% of others, with 38% vs 21% false alarms, because their base rate is higher (39% vs 25%). Calibration and equal error rates cannot both hold when base rates differ. We chose calibration and never use the flag to gate care.
- **National picture (NHANES 2017 to 2018, women 35 to 79, age-standardised):** blood pressure at or above 130/80: Black women 62%, Asian 51%, Hispanic 45%, White 38%. Sleeping under 6 hours: Black 14% vs White 7%.
- **Hot flashes (TSHS):** the African American group reported them more (39% vs 25%, odds ratio 1.89, 1.21 to 2.94). After accounting for earlier symptoms, BMI, smoking and age group it falls to 1.13 (0.68 to 1.88), not statistically significant. Those factors can themselves reflect unequal conditions, so we report the gap instead of explaining it away.
- **Regions:** not studied. Neither dataset records where people live. A dataset with geography (for example CDC state-level surveys) would be needed.
- Groups stand in for income, access to care, stress and discrimination, not biology.

## What we have not done
No real wearable data and no real night-sweat or ovulation labels, so detector scores are simulated stress tests. No testing with users, clinicians or across skin tones. The hot-flash model rests on a small 2001 cohort. Retrieval was scored on questions we wrote.
