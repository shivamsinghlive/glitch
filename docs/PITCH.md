# 3-minute pitch script

Aim for 2:50. One person drives the demo; the others speak.
**Setup before you start:** open http://localhost:3000/?reset → *Quick start for women* → name "Maya", age 27 →
*I have periods* → Start → tap *Load 12 weeks of demo check-ins*. Stay on Home.

**0:00–0:30 · Problem** (speaker 1)
> "A small structure attached to the ovary, the rete ovarii, was dismissed as a leftover for about 150 years. New research in mice suggests it's active.
> That's women's health in one sentence: under-studied. Women have adverse drug reactions nearly twice as often as men, and in 2013 the FDA had to halve the Ambien dose for women.
> When I started lifting, nobody told me my body changes across the month. Some weeks I was strong. Before my period I felt low, couldn't lift as much, craved everything and quit, then felt like a failure.
> So we built **Glitch**: it learns how *your* body works, at every life stage."

**0:30–1:20 · Demo** (speaker 2 drives)
1. Point at the phase ring: *"Maya is on day 21, her luteal phase."*
2. Point at the welcome-back card: *"She missed a week. No guilt. Glitch links it to her phase and offers a 10-minute restart."*
3. Scroll to **Today for you**: *"'Train, just lighter.' But that's from **her** logs, not a textbook."*
4. Tap through the check-in: *"20 seconds a day: energy, mood, cravings, cramps, sleep, workout strength."*
5. Scroll to **Your pattern by phase**: *"Each highlighted cell passed a statistical test. Her energy really is lower in her luteal phase. If it weren't, Glitch would say 'train as planned'."*

**1:20–2:10 · Data science** (speaker 3)
- *"Two levels: population and personal."*
- **Population:** scroll to *What 4,163 US women show*.
  > "This is CDC NHANES data on women aged 20 to 59. We used survey-weighted regression across life stages (cycling, pregnant, breastfeeding, post-menopause), adjusted for age and smoking, with false-discovery-rate correction.
  > The result: after correction, **no stage clearly differs** on depression or sleep. The only hint is that breastfeeding mothers get less sleep (odds ratio 1.9).
  > So averages barely tell life stages apart, let alone individual women. **That's why Glitch tests each woman's own data.**"
- **Personal:**
  > "Permutation tests with Benjamini–Hochberg correction on her own check-ins. We tested it: it finds a planted pattern and flags nothing when there's no pattern."
- **Menopause** (one line):
  > "For menopause, the same pipeline shows bone density really does drop, while blood pressure tracks age, not menopause."

**2:10–2:40 · Ethics & data literacy** (speaker 1)
- *"With the BU librarians, we checked every health claim against **66 PubMed records** and rewrote 13 that overstated the evidence."*
- *"We refuse to repeat myths. Research shows only small, inconsistent cycle effects on strength, so we never tell a woman she'll be weak. We test her data."*
- *"We chose what not to use: Apple Women's Health Study data isn't public, and Mintel is licensed."*
- *"Data stays encrypted on the device. In pregnancy and postpartum, persistent low mood links to the national maternal mental health hotline. No calorie deficits in pregnancy."*

**2:40–3:00 · Close** (speaker 2)
- Switch the profile to pregnant (or show a screenshot) to show Home adapts.
> "Periods, pregnancy, postpartum, menopause: one app that learns **you**. Glitch: find the bug, fix your health."

## Likely judge questions
- **"Is the check-in data real?"** No. The demo check-ins are synthetic, generated with a fixed seed, and labelled "synthetic" in the app. NHANES and TSHS are real public data. The unit tests show the test finds real patterns and doesn't invent them.
- **"Isn't 'breastfeeding' a weak postpartum proxy?"** Yes, and we say so. We added a second proxy (birth in the past 12 months), and short sleep holds there too (OR 2.0).
- **"Why not just use the cycle-phase training advice everyone uses?"** Meta-analyses find only trivial, inconsistent average effects, and women vary. Generic phase advice can be wrong for a given woman.
- **"Irregular cycles?"** Phases are calendar estimates and the app says so. Next step: phase from wearable temperature (ovulation detection is already built).
- **"Causal?"** No. NHANES is cross-sectional and n-of-1 is observational. We say "association" everywhere.
