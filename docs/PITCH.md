# 4-minute pitch script

Hard limit is 4:00. Aim for 3:40. One speaker drives the phone demo while another talks.

**0:00–0:30 · Problem** (speaker 1)
> "A billion women are in or past menopause. Hot flashes, broken sleep, low mood, bone loss. Most hear 'it's just age.'
> Glitch turns what a woman feels into data she and her doctor can trust, and it's honest about what the data can't say."

**0:30–1:20 · Demo** (speaker 2 drives)
1. Tap the mic and say *"I'm having a hot flash"*. It's logged by voice.
2. Point at the rings and tiles: hot flashes, sleep, possible night sweats from skin temperature, BP.
3. Open the triggers panel: *"After a warm night: 3× more flashes, 95% CI…"*. Then the line underneath: *"Tested, no clear link yet… needs ~80 days of logs."*

**1:20–2:30 · Data science** (speaker 3)
- *"Three levels of analysis."*
- **Population:** scroll to *What 1,941 US women show*.
  - *"NHANES, survey-weighted regression with design-based confidence intervals and FDR correction."*
  - Tap **Raw**: *"Blood pressure looks 16 points higher after menopause."*
  - Tap **Same age**, and the dot slides to zero: *"It's age, not menopause. What holds up is bone density, so Glitch puts strength training first."*
- **Prediction:** *"Hot-flash model: AUC 0.75 with labs, calibrated, and we compared it against gradient boosting."*
- **Personal:** *"Permutation test plus Benjamini–Hochberg. We simulated it: at most 9% of users ever see a false trigger."*
- **Validation:** *"Our survey estimator matches the samplics library exactly, and a jackknife to within 0.3%."*

**2:30–3:20 · Ethics** (speaker 1)
- *"Encrypted on the device. Camera and mic analysed locally. Ethnicity never leaves the phone."*
- *"Fairness: we audited the model by race and education. It works similarly by race, but not reliably for women without high school, and our model card says so."*
- *"We checked every health claim in our app against 44 PubMed papers and rewrote 13 that overstated the evidence."*
- *"Who we might miss: surgical menopause, trans and nonbinary people, people without wearables."*

**3:20–3:40 · Close** (speaker 2)
> Tap the 📄 icon to open the doctor summary. *"One page, statistically supported triggers, questions to ask. Glitch: find the bug, fix your health."*

## Likely judge questions
- **"Is the demo data real?"** No. The wearable data is synthetic, generated with a fixed seed. The NHANES and TSHS analyses use real data. Trigger detection on the demo only shows the pipeline works; the simulations show its error rates.
- **"Why logistic regression?"** It's interpretable, calibrated, and matches or beats gradient boosting on held-out data (better with labs).
- **"Why survey weights?"** NHANES oversamples some groups. Without weights, results describe the sample, not US women.
- **"Causal?"** No. It's cross-sectional, so these are associations, and we say so in the app.
