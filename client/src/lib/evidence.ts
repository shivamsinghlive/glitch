/**
 * Glitch — verified evidence library.
 *
 * Every health claim the app makes should point at an entry here. Each citation was retrieved from
 * PubMed (NCBI E-utilities) and its title / journal / year copied from the PubMed record, not written
 * from memory. Claims are worded to match what the cited papers actually show. `appMismatch` records
 * gaps that are still open; mismatches already fixed in app copy are logged in docs/claim-audit.md.
 *
 * Evidence levels:
 *  - guideline       clinical practice guideline, consensus or position statement
 *  - meta-analysis   systematic review with pooled analysis
 *  - rct             randomised controlled trial
 *  - cohort          prospective / longitudinal observational study
 *  - cross-sectional single time-point survey or validation study
 *  - review          narrative or systematic review without pooling
 *  - preclinical     animal or lab study (not yet shown in humans)
 *
 * Retrieved 2026-10-24.
 */

export type EvidenceLevel = "guideline" | "meta-analysis" | "rct" | "cohort" | "cross-sectional" | "review" | "preclinical";

export interface EvidenceCitation {
  pmid: string;
  title: string;
  journal: string;
  year: number;
  url: string;
}

export interface EvidenceItem {
  /** Stable kebab-case id, referenced from UI copy and the coach */
  id: string;
  /** One plain-language sentence that the citations actually support */
  claim: string;
  evidenceLevel: EvidenceLevel;
  citations: EvidenceCitation[];
  /** Where the app's current wording overstates or contradicts the evidence (to fix in copy) */
  appMismatch?: string;
}

const pm = (pmid: string, title: string, journal: string, year: number): EvidenceCitation => ({
  pmid,
  title,
  journal,
  year,
  url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
});

// ── Sources (one definition per paper, reused across claims) ─────────────────
const AVIS_2015 = pm("25686030", "Duration of menopausal vasomotor symptoms over the menopause transition.", "JAMA internal medicine", 2015);
const STRAW10_MENOPAUSE = pm("22343510", "Executive summary of the Stages of Reproductive Aging Workshop + 10: addressing the unfinished agenda of staging reproductive aging.", "Menopause (New York, N.Y.)", 2012);
const STRAW10_JCEM = pm("22344196", "Executive summary of the Stages of Reproductive Aging Workshop + 10: addressing the unfinished agenda of staging reproductive aging.", "The Journal of clinical endocrinology and metabolism", 2012);
const ACC_AHA_2017 = pm("29133356", "2017 ACC/AHA/AAPA/ABC/ACPM/AGS/APhA/ASH/ASPC/NMA/PCNA Guideline for the Prevention, Detection, Evaluation, and Management of High Blood Pressure in Adults: A Report of the American College of Cardiology/American Heart Association Task Force on Clinical Practice Guidelines.", "Hypertension (Dallas, Tex. : 1979)", 2017);
const AHA_ACC_2025 = pm("40811497", "2025 AHA/ACC/AANP/AAPA/ABC/ACCP/ACPM/AGS/AMA/ASPC/NMA/PCNA/SGIM Guideline for the Prevention, Detection, Evaluation and Management of High Blood Pressure in Adults: A Report of the American College of Cardiology/American Heart Association Joint Committee on Clinical Practice Guidelines.", "Circulation", 2025);
const SAMARGANDY_2022 = pm("35113663", "Trajectories of Blood Pressure in Midlife Women: Does Menopause Matter?", "Circulation research", 2022);
const AHA_MT_CVD_2020 = pm("33251828", "Menopause Transition and Cardiovascular Disease Risk: Implications for Timing of Early Prevention: A Scientific Statement From the American Heart Association.", "Circulation", 2020);
const VMS_BP_SWAN_2016 = pm("27404767", "Hot Flash Frequency and Blood Pressure: Data from the Study of Women's Health Across the Nation.", "Journal of women's health (2002)", 2016);
const KRAVITZ_2008 = pm("18652093", "Sleep disturbance during the menopausal transition in a multi-ethnic community sample of women.", "Sleep", 2008);
const JOFFE_2013 = pm("24293774", "A gonadotropin-releasing hormone agonist model demonstrates that nocturnal hot flashes interrupt objective sleep.", "Sleep", 2013);
const FREEDMAN_2014 = pm("24929849", "Postmenopausal physiological changes.", "Current topics in behavioral neurosciences", 2014);
const FREEDMAN_2001 = pm("11400216", "Physiology of hot flashes.", "American journal of human biology : the official journal of the Human Biology Council", 2001);
const FREEDMAN_2005 = pm("16414337", "Hot flashes: behavioral treatments, mechanisms, and relation to sleep.", "The American journal of medicine", 2005);
const FAUBION_2015 = pm("25051286", "Caffeine and menopausal symptoms: what is the association?", "Menopause (New York, N.Y.)", 2015);
const WIHS_SUBSTANCE_2024 = pm("39319622", "Substance use and menopausal symptoms among people with and without HIV in the US, 2008-2020.", "Menopause (New York, N.Y.)", 2024);
const NAMS_NONHORMONE_2023 = pm("37252752", "The 2023 nonhormone therapy position statement of The North American Menopause Society.", "Menopause (New York, N.Y.)", 2023);
const GOLD_2004 = pm("15191936", "Lifestyle and demographic factors in relation to vasomotor symptoms: baseline results from the Study of Women's Health Across the Nation.", "American journal of epidemiology", 2004);
const MENOS2_2012 = pm("22336748", "Effectiveness of group and self-help cognitive behavior therapy in reducing problematic menopausal hot flushes and night sweats (MENOS 2): a randomized controlled trial.", "Menopause (New York, N.Y.)", 2012);
const CTBT_META_2022 = pm("35199638", "Efficacy of cognitive therapy and behavior therapy for menopausal symptoms: a systematic review and meta-analysis.", "Psychological medicine", 2022);
const MINDFUL_UMBRELLA_2017 = pm("28286985", "Use of mindfulness, meditation and relaxation to treat vasomotor symptoms.", "Climacteric : the journal of the International Menopause Society", 2017);
const FREEMAN_2006 = pm("16585466", "Associations of hormones and menopausal status with depressed mood in women with no history of depression.", "Archives of general psychiatry", 2006);
const MAKI_2018 = pm("30179986", "Guidelines for the evaluation and treatment of perimenopausal depression: summary and recommendations.", "Menopause (New York, N.Y.)", 2018);
const BROMBERGER_2011 = pm("21961723", "Mood and menopause: findings from the Study of Women's Health Across the Nation (SWAN) over 10 years.", "Obstetrics and gynecology clinics of North America", 2011);
const KROENKE_PHQ2_2003 = pm("14583691", "The Patient Health Questionnaire-2: validity of a two-item depression screener.", "Medical care", 2003);
const KROENKE_GAD_2007 = pm("17339617", "Anxiety disorders in primary care: prevalence, impairment, comorbidity, and detection.", "Annals of internal medicine", 2007);
const HEINEMANN_MRS_2004 = pm("15345062", "The Menopause Rating Scale (MRS) scale: a methodological review.", "Health and quality of life outcomes", 2004);
const KEMP_HRV_2010 = pm("20138254", "Impact of depression and antidepressant treatment on heart rate variability: a review and meta-analysis.", "Biological psychiatry", 2010);
const THURSTON_HRV_2016 = pm("26926327", "Changes in heart rate variability during vasomotor symptoms among midlife women.", "Menopause (New York, N.Y.)", 2016);
const RAMESH_HRV_2022 = pm("35608101", "Heart rate variability as a function of menopausal status, menstrual cycle phase, and estradiol level.", "Physiological reports", 2022);
const MANN_HUNTER_2011 = pm("21326119", "Concordance between self-reported and sternal skin conductance measures of hot flushes in symptomatic perimenopausal and postmenopausal women: a systematic review.", "Menopause (New York, N.Y.)", 2011);
const STEFANOPOULOU_2013 = pm("23591256", "Does pattern recognition software using the Bahr monitor improve the sensitivity, specificity, and concordance of ambulatory skin conductance monitoring of hot flushes?", "Menopause (New York, N.Y.)", 2013);
const TSIARTAS_2021 = pm("34891695", "A novel Hot-Flash classification algorithm via multi-sensor features integration.", "Annual International Conference of the IEEE Engineering in Medicine and Biology Society. IEEE Engineering in Medicine and Biology Society. Annual International Conference", 2021);
const GREENDALE_2012 = pm("21976317", "Bone mineral density loss in relation to the final menstrual period in a multiethnic cohort: results from the Study of Women's Health Across the Nation (SWAN).", "Journal of bone and mineral research : the official journal of the American Society for Bone and Mineral Research", 2012);
const LIFTMOR_2017 = pm("28975661", "High-Intensity Resistance and Impact Training Improves Bone Mineral Density and Physical Function in Postmenopausal Women With Osteopenia and Osteoporosis: The LIFTMOR Randomized Controlled Trial.", "Journal of bone and mineral research : the official journal of the American Society for Bone and Mineral Research", 2017);
const LIFTMOR_SAFETY_2019 = pm("30612163", "High-intensity exercise did not cause vertebral fractures and improves thoracic kyphosis in postmenopausal women with low to very low bone mass: the LIFTMOR trial.", "Osteoporosis international : a journal established as result of cooperation between the European Foundation for Osteoporosis and the National Osteoporosis Foundation of the USA", 2019);
const MOHEBBI_2023 = pm("36749350", "Exercise training and bone mineral density in postmenopausal women: an updated systematic review and meta-analysis of intervention studies with emphasis on potential moderators.", "Osteoporosis international : a journal established as result of cooperation between the European Foundation for Osteoporosis and the National Osteoporosis Foundation of the USA", 2023);
const KEMMLER_2020 = pm("32785775", "Effects of Different Types of Exercise on Bone Mineral Density in Postmenopausal Women: A Systematic Review and Meta-analysis.", "Calcified tissue international", 2020);
const ZHAO_2025 = pm("40420105", "Optimal resistance training parameters for improving bone mineral density in postmenopausal women: a systematic review and meta-analysis.", "Journal of orthopaedic surgery and research", 2025);
const USPSTF_OSTEO_2025 = pm("39808425", "Screening for Osteoporosis to Prevent Fractures: US Preventive Services Task Force Recommendation Statement.", "JAMA", 2025);
const USPSTF_VITD_CA_2018 = pm("29677309", "Vitamin D, Calcium, or Combined Supplementation for the Primary Prevention of Fractures in Community-Dwelling Adults: US Preventive Services Task Force Recommendation Statement.", "JAMA", 2018);
const RIZZOLI_2014 = pm("25482487", "Nutrition and bone health in women after the menopause.", "Women's health (London, England)", 2014);
const ZAMFIRESCU_2011 = pm("21595516", "Absorption of levothyroxine when coadministered with various calcium formulations.", "Thyroid : official journal of the American Thyroid Association", 2011);
const SKELIN_2017 = pm("28153426", "Factors Affecting Gastrointestinal Absorption of Levothyroxine: A Review.", "Clinical therapeutics", 2017);
const ROLIC_2024 = pm("38969940", "Iron Metabolism, Calcium, Magnesium and Trace Elements: A Review.", "Biological trace element research", 2024);
const DAWSON_HUGHES_2014 = pm("25441954", "Dietary fat increases vitamin D-3 absorption.", "Journal of the Academy of Nutrition and Dietetics", 2014);

// ── Pivot additions: all life stages (retrieved 2026-10-25) ──
const MCNULTY_2020 = pm("32661839", "The Effects of Menstrual Cycle Phase on Exercise Performance in Eumenorrheic Women: A Systematic Review and Meta-Analysis.", "Sports medicine (Auckland, N.Z.)", 2020);
const COLENSO_SEMPLE_2023 = pm("37033884", "Current evidence shows no influence of women's menstrual cycle phase on acute strength performance or adaptations to resistance exercise training.", "Frontiers in sports and active living", 2023);
const THOMPSON_2020 = pm("31677121", "The Effect of the Menstrual Cycle and Oral Contraceptives on Acute Responses and Chronic Adaptations to Resistance Training: A Systematic Review of the Literature.", "Sports medicine (Auckland, N.Z.)", 2020);
const COLENSO_SEMPLE_2024 = pm("39630025", "Menstrual cycle phase does not influence muscle protein synthesis or whole-body myofibrillar proteolysis in response to resistance exercise.", "The Journal of physiology", 2024);
const TUCKER_2025 = pm("39008822", "The Effect of the Menstrual Cycle on Energy Intake: A Systematic Review and Meta-analysis.", "Nutrition reviews", 2025);
const REILLY_PMDD_2024 = pm("38199397", "The prevalence of premenstrual dysphoric disorder: Systematic review and meta-analysis.", "Journal of affective disorders", 2024);
const USPSTF_PERINATAL_2019 = pm("30747971", "Interventions to Prevent Perinatal Depression: US Preventive Services Task Force Recommendation Statement.", "JAMA", 2019);
const WANG_PPD_2021 = pm("34671011", "Mapping global prevalence of depression among postpartum women.", "Translational psychiatry", 2021);
const SHOREY_PPD_2018 = pm("30114665", "Prevalence and incidence of postpartum depression among healthy mothers: A systematic review and meta-analysis.", "Journal of psychiatric research", 2018);
const ACOG_CPG4_2023 = pm("37486660", "Screening and Diagnosis of Mental Health Conditions During Pregnancy and Postpartum: ACOG Clinical Practice Guideline No. 4.", "Obstetrics and gynecology", 2023);
const CANADA_PREGNANCY_PA_2018 = pm("30337460", "2019 Canadian guideline for physical activity throughout pregnancy.", "British journal of sports medicine", 2018);
const WHO_PA_2020 = pm("33239350", "World Health Organization 2020 guidelines on physical activity and sedentary behaviour.", "British journal of sports medicine", 2020);
const ZUCKER_2020 = pm("32503637", "Sex differences in pharmacokinetics predict adverse drug reactions in women.", "Biology of sex differences", 2020);
const BEERY_ZUCKER_2011 = pm("20620164", "Sex bias in neuroscience and biomedical research.", "Neuroscience and biobehavioral reviews", 2011);
const STEINBERG_2021 = pm("34143192", "Analysis of Female Enrollment and Participant Sex by Burden of Disease in US Clinical Trials Between 2000 and 2020.", "JAMA network open", 2021);
const GREENBLATT_ZOLPIDEM_2014 = pm("24203450", "Gender differences in pharmacokinetics and pharmacodynamics of zolpidem following sublingual administration.", "Journal of clinical pharmacology", 2014);
const GREENBLATT_ZOLPIDEM_2019 = pm("30939589", "Zolpidem and Gender: Are Women Really At Risk?", "Journal of clinical psychopharmacology", 2019);
const ANBARCI_RETE_2025 = pm("40105200", "Rediscovering the rete ovarii, a secreting auxiliary structure to the ovary.", "eLife", 2025);
const NOETEL_2024 = pm("38355154", "Effect of exercise for depression: systematic review and network meta-analysis of randomised controlled trials.", "BMJ (Clinical research ed.)", 2024);
const SIROIS_2015 = pm("25243717", "Self-compassion, affect, and health-promoting behaviors.", "Health psychology : official journal of the Division of Health Psychology, American Psychological Association", 2015);
const BREINES_CHEN_2012 = pm("22645164", "Self-compassion increases self-improvement motivation.", "Personality & social psychology bulletin", 2012);

export const EVIDENCE: EvidenceItem[] = [
  // ── Vasomotor symptoms (hot flashes / night sweats) ──────────
  {
    id: "swan-vms-duration-by-ethnicity",
    claim:
      "In SWAN, women with frequent hot flashes or night sweats had them for a median of 7.4 years in total (about 4.5 years after the final period); medians were 10.1 years for African American, 8.9 for Hispanic, 6.5 for non-Hispanic white, 5.4 for Chinese and 4.8 for Japanese women. These are group medians, not predictions for an individual.",
    evidenceLevel: "cohort",
    citations: [AVIS_2015],
  },
  {
    id: "vms-longer-with-stress-and-low-mood",
    claim:
      "Higher perceived stress, anxiety and depressive symptoms are associated with reporting hot flashes and with hot flashes lasting longer; these are associations, and the direction of cause is not established.",
    evidenceLevel: "cohort",
    citations: [AVIS_2015, GOLD_2004],
    appMismatch:
      "hotFlashTriggers() in menopause.ts (owned by another teammate, not edited) still tests 'high-stress days' as a same-day trigger. The SWAN evidence links perceived stress to VMS prevalence and duration, not same-day triggering; the UI frames results as associations in the user's own logs, which is acceptable.",
  },
  {
    id: "hot-flash-heat-trigger",
    claim:
      "Lab studies suggest hot flashes are set off by small rises in core body temperature in women whose comfortable temperature range (thermoneutral zone) has narrowed, so being warm can plausibly tip off a flash.",
    evidenceLevel: "review",
    citations: [FREEDMAN_2001, FREEDMAN_2005, FREEDMAN_2014],
  },
  {
    id: "hot-flash-diet-triggers",
    claim:
      "Evidence that alcohol, caffeine or spicy food trigger hot flashes is limited and inconsistent: some surveys link caffeine use and heavy drinking with more bothersome or frequent VMS, but the 2023 NAMS position statement does not recommend 'avoiding triggers' as a treatment because the evidence is insufficient.",
    evidenceLevel: "cross-sectional",
    citations: [FAUBION_2015, WIHS_SUBSTANCE_2024, NAMS_NONHORMONE_2023],
  },
  {
    id: "hormone-therapy-most-effective-vms",
    claim:
      "Hormone therapy remains the most effective treatment for hot flashes and should be considered for suitable women within 10 years of their final period; evidence-based non-hormone options exist for women who can't or prefer not to use it.",
    evidenceLevel: "guideline",
    citations: [NAMS_NONHORMONE_2023],
  },
  {
    id: "cbt-for-vms",
    claim:
      "Cognitive behavioural therapy (group or guided self-help) reduces how much hot flashes and night sweats bother women, with small-to-moderate effects in pooled trials, and is a Level I recommended non-hormone option.",
    evidenceLevel: "meta-analysis",
    citations: [CTBT_META_2022, MENOS2_2012, NAMS_NONHORMONE_2023],
  },
  {
    id: "paced-breathing-not-effective-vms",
    claim:
      "Paced (slow) breathing has not been shown to reduce hot-flash frequency or severity in pooled trials, and the 2023 NAMS statement does not recommend it for hot flashes.",
    evidenceLevel: "guideline",
    citations: [NAMS_NONHORMONE_2023, MINDFUL_UMBRELLA_2017],
  },
  {
    id: "night-sweats-disrupt-sleep",
    claim:
      "Trouble falling and staying asleep becomes more common through the menopause transition and is more likely with frequent hot flashes; in an experimental study each extra night-time hot flash was linked to more time awake after sleep onset.",
    evidenceLevel: "cohort",
    citations: [KRAVITZ_2008, JOFFE_2013, FREEDMAN_2014],
  },

  // ── Staging ──────────────────────────────────────────────────
  {
    id: "straw10-staging",
    claim:
      "STRAW+10 stages the menopause transition by bleeding pattern: early transition is a persistent difference of 7+ days between consecutive cycle lengths (recurring within 10 cycles), late transition is 60+ days without a period, and menopause is confirmed after 12 months without one; early postmenopause lasts roughly 5–8 years.",
    evidenceLevel: "guideline",
    citations: [STRAW10_MENOPAUSE, STRAW10_JCEM],
  },

  // ── Blood pressure & heart ───────────────────────────────────
  {
    id: "bp-categories-acc-aha",
    claim:
      "US guidelines classify adult blood pressure as normal (<120/<80), elevated (120–129/<80), stage 1 hypertension (130–139 or 80–89) and stage 2 (≥140 or ≥90), with diagnosis based on repeated readings rather than a single measurement.",
    evidenceLevel: "guideline",
    citations: [ACC_AHA_2017, AHA_ACC_2025],
    appMismatch:
      "App now cites the 2025 AHA/ACC guideline (PMID 40811497), which replaces 2017, and keeps the 2017 thresholds. Neither guideline's full text is in PMC and the abstracts omit the category table, so the thresholds (and the >180/>120 'very high' wording) still need a human check against the published 2025 table.",
  },
  {
    id: "bp-rises-after-menopause",
    claim:
      "Cardiovascular risk accelerates over the menopause transition, and in SWAN some groups of women showed a faster rise in systolic blood pressure starting about a year after menopause.",
    evidenceLevel: "cohort",
    citations: [SAMARGANDY_2022, AHA_MT_CVD_2020],
  },
  {
    id: "vms-linked-to-hypertension",
    claim:
      "In SWAN, women with frequent hot flashes were more likely to go on to develop prehypertension or hypertension than women without them (an association, not proof of cause).",
    evidenceLevel: "cohort",
    citations: [VMS_BP_SWAN_2016],
  },

  // ── Mental health ────────────────────────────────────────────
  {
    id: "depression-risk-perimenopause",
    claim:
      "The menopause transition is a window of higher risk for depressive symptoms and major depression, including in women with no prior history of depression.",
    evidenceLevel: "cohort",
    citations: [FREEMAN_2006, MAKI_2018, BROMBERGER_2011],
  },
  {
    id: "phq2-validity",
    claim:
      "A PHQ-2 score of 3 or more detected major depression with 83% sensitivity and 92% specificity in primary-care and OB-GYN patients; it is a screen that should prompt a professional conversation, not a diagnosis.",
    evidenceLevel: "cross-sectional",
    citations: [KROENKE_PHQ2_2003],
  },
  {
    id: "gad2-validity",
    claim:
      "The two core GAD items (GAD-2) performed well as a screen for common anxiety disorders in primary care (area under the curve 0.80–0.91).",
    evidenceLevel: "cross-sectional",
    citations: [KROENKE_GAD_2007],
    appMismatch:
      "mentalHealth.ts applies a ≥3 cut-point to GAD-2. The cited abstract reports GAD-2 accuracy (AUC) but not a specific cut-point, so the ≥3 threshold wasn't verified here.",
  },
  {
    id: "mrs-scale-validity",
    claim:
      "The Menopause Rating Scale is a widely used self-rated symptom scale with good reliability and validity across countries; total scores of 0–4, 5–8, 9–16 and 17+ correspond to no/little, mild, moderate and severe complaints.",
    evidenceLevel: "review",
    citations: [HEINEMANN_MRS_2004],
  },
  {
    id: "hrv-lower-in-depression",
    claim:
      "On average, people with major depression have modestly lower heart rate variability than healthy controls, and lower HRV tracks with greater depression severity at the group level.",
    evidenceLevel: "meta-analysis",
    citations: [KEMP_HRV_2010],
  },
  {
    id: "hrv-and-menopause",
    claim:
      "Heart rate variability falls briefly during physiologically measured hot flashes; lower HRV in postmenopausal women in a small study was explained largely by age and body size.",
    evidenceLevel: "cross-sectional",
    citations: [THURSTON_HRV_2016, RAMESH_HRV_2022],
  },

  // ── Wearables ────────────────────────────────────────────────
  {
    id: "wearable-hot-flash-detection",
    claim:
      "Sternal skin conductance is the research standard for objectively measuring hot flashes, but it agrees with women's own reports only about 29% of the time in ambulatory studies; consumer wrist-sensor algorithms are promising but have only been tested in very small pilots.",
    evidenceLevel: "review",
    citations: [MANN_HUNTER_2011, STEFANOPOULOU_2013, TSIARTAS_2021],
  },

  // ── Bone & muscle ────────────────────────────────────────────
  {
    id: "bone-loss-around-final-period",
    claim:
      "In SWAN, bone loss began about a year before the final period and was fastest from 1 year before to 2 years after it; over 10 years women lost about 10.6% of spine and 9.1% of hip (femoral neck) bone density, most of it in that window.",
    evidenceLevel: "cohort",
    citations: [GREENDALE_2012],
  },
  {
    id: "liftmor-heavy-resistance-impact",
    claim:
      "In the LIFTMOR trial, 8 months of supervised, twice-weekly high-intensity resistance and impact training improved spine and hip bone density and physical function in postmenopausal women with low bone mass, without causing vertebral fractures.",
    evidenceLevel: "rct",
    citations: [LIFTMOR_2017, LIFTMOR_SAFETY_2019],
  },
  {
    id: "exercise-improves-bmd",
    claim:
      "Across many trials, exercise produces small but significant gains in spine and hip bone density in postmenopausal women; resistance, weight-bearing and combined programmes all help, with higher-intensity resistance training about three times a week possibly best.",
    evidenceLevel: "meta-analysis",
    citations: [MOHEBBI_2023, KEMMLER_2020, ZHAO_2025],
  },
  {
    id: "dexa-screening",
    claim:
      "USPSTF recommends bone-density screening for osteoporosis in all women 65 and older, and in postmenopausal women under 65 who are at increased fracture risk.",
    evidenceLevel: "guideline",
    citations: [USPSTF_OSTEO_2025],
  },
  {
    id: "calcium-vitamin-d-supplements",
    claim:
      "Getting enough calcium, vitamin D and protein supports bone health, but for community-dwelling postmenopausal women USPSTF recommends against routine low-dose supplements (≤400 IU vitamin D, ≤1000 mg calcium) to prevent fractures and finds the evidence insufficient for higher doses; supplements also raise kidney-stone risk.",
    evidenceLevel: "guideline",
    citations: [USPSTF_VITD_CA_2018, RIZZOLI_2014],
  },
  {
    id: "protein-intake-bone",
    claim:
      "European guidance summarised for women over 50 recommends about 1 g of protein per kg of body weight per day, alongside calcium, vitamin D and weight-bearing exercise, to reduce osteoporosis risk.",
    evidenceLevel: "review",
    citations: [RIZZOLI_2014],
  },

  // ── Supplement timing ────────────────────────────────────────
  {
    id: "levothyroxine-separate-from-calcium-iron",
    claim:
      "Calcium (carbonate, citrate or acetate) cut levothyroxine absorption by about 20–25% when taken together, and iron, coffee and some other drugs also interfere, so levothyroxine should be taken separately from them.",
    evidenceLevel: "review",
    citations: [ZAMFIRESCU_2011, SKELIN_2017],
  },
  {
    id: "calcium-reduces-iron-absorption",
    claim: "Calcium can reduce iron absorption in a dose-dependent way by inhibiting the gut iron transporter (DMT1).",
    evidenceLevel: "review",
    citations: [ROLIC_2024],
  },
  {
    id: "vitamin-d-with-fat",
    claim: "Taking a vitamin D3 supplement with a meal that contains fat raised absorption by about 32% compared with a fat-free meal.",
    evidenceLevel: "rct",
    citations: [DAWSON_HUGHES_2014],
  },

  // ── Menstrual cycle ──────────────────────────────────────────
  {
    id: "cycle-phase-performance-small",
    claim:
      "Exercise performance may be trivially lower in the early follicular phase (around your period) than at other times, but the effect is so small and varies so much between women that researchers recommend going by how you respond rather than general cycle rules.",
    evidenceLevel: "meta-analysis",
    citations: [MCNULTY_2020],
  },
  {
    id: "cycle-phase-strength-no-clear-effect",
    claim:
      "There is no consistent evidence that cycle phase changes strength, muscle growth or muscle-building after lifting; studies are small and mixed, so planning strength training around cycle phase isn't well supported.",
    evidenceLevel: "review",
    citations: [COLENSO_SEMPLE_2023, THOMPSON_2020, COLENSO_SEMPLE_2024],
  },
  {
    id: "luteal-energy-intake-higher",
    claim:
      "On average women eat a little more in the luteal phase (the two weeks before a period) than in the follicular phase, roughly 170 kcal a day more in pooled studies, though study methods varied.",
    evidenceLevel: "meta-analysis",
    citations: [TUCKER_2025],
  },
  {
    id: "premenstrual-mood-symptoms",
    claim:
      "Premenstrual dysphoric disorder (PMDD), with mood symptoms confined to the days before a period, affects about 3% of women when confirmed by daily tracking over two cycles (about 8% on provisional diagnosis).",
    evidenceLevel: "meta-analysis",
    citations: [REILLY_PMDD_2024],
  },

  // ── Pregnancy & postpartum ───────────────────────────────────
  {
    id: "perinatal-depression-common",
    claim:
      "Depression during pregnancy or after birth is common: it affects up to about 1 in 7 women (USPSTF), and global reviews estimate about 17% of new mothers have postpartum depression.",
    evidenceLevel: "meta-analysis",
    citations: [USPSTF_PERINATAL_2019, WANG_PPD_2021, SHOREY_PPD_2018],
  },
  {
    id: "postpartum-depression-screening",
    claim:
      "ACOG (2023) recommends screening for depression and anxiety during pregnancy and postpartum, and USPSTF recommends counselling such as CBT or interpersonal therapy for women at increased risk of perinatal depression.",
    evidenceLevel: "guideline",
    citations: [ACOG_CPG4_2023, USPSTF_PERINATAL_2019],
  },
  {
    id: "exercise-in-pregnancy-recommended",
    claim:
      "Guidelines recommend regular physical activity during pregnancy and after birth: the Canadian guideline found moderate benefits and no identified harms, and WHO 2020 includes specific recommendations for pregnant and postpartum women.",
    evidenceLevel: "guideline",
    citations: [CANADA_PREGNANCY_PA_2018, WHO_PA_2020],
  },

  // ── Women in research & medicines ────────────────────────────
  {
    id: "women-adverse-drug-reactions",
    claim:
      "Women have adverse drug reactions nearly twice as often as men; in a review of 86 drugs, 76 reached higher blood levels in women, and that strongly predicted more side effects in women.",
    evidenceLevel: "review",
    citations: [ZUCKER_2020],
  },
  {
    id: "women-underrepresented-trials",
    claim:
      "Female animals have long been left out of biomedical research (in neuroscience, male-only studies outnumbered female-only 5.5 to 1), and in US trials from 2000 to 2020 women were still underrepresented relative to disease burden in fields like cancer and neurology.",
    evidenceLevel: "cross-sectional",
    citations: [BEERY_ZUCKER_2011, STEINBERG_2021],
  },
  {
    id: "zolpidem-sex-dose",
    claim:
      "Women clear the sleep drug zolpidem more slowly than men (about 35% lower clearance), which led the FDA in 2013 to halve the recommended dose for women; some researchers argue the dose cut wasn't necessary.",
    evidenceLevel: "review",
    citations: [GREENBLATT_ZOLPIDEM_2019, GREENBLATT_ZOLPIDEM_2014],
  },
  {
    id: "rete-ovarii-function",
    claim:
      "In mice, the rete ovarii, a small structure attached to the ovary long dismissed as a leftover, turns out to be a network of tubules that secretes proteins flowing toward the ovary, hinting at a role in ovary function; this hasn't been studied in humans yet.",
    evidenceLevel: "preclinical",
    citations: [ANBARCI_RETE_2025],
  },

  // ── Mental health & habits ───────────────────────────────────
  {
    id: "exercise-reduces-depression",
    claim:
      "In trials of people with depression, exercise moderately reduced symptoms, with walking or jogging, yoga and strength training among the most effective; most trials had a high risk of bias.",
    evidenceLevel: "meta-analysis",
    citations: [NOETEL_2024],
  },
  {
    id: "self-compassion-health-behaviour",
    claim:
      "People higher in self-compassion report slightly more healthy habits (eating, exercise, sleep, stress management), and in experiments self-compassion after a setback increased motivation to improve; this is early, mostly correlational evidence.",
    evidenceLevel: "cross-sectional",
    citations: [SIROIS_2015, BREINES_CHEN_2012],
  },
];

const BY_ID = new Map(EVIDENCE.map((e) => [e.id, e]));

/** Look up a verified evidence item by id (undefined if the id isn't in the library). */
export function evidenceFor(id: string): EvidenceItem | undefined {
  return BY_ID.get(id);
}

/**
 * The claims the coach is most likely to make, with a short label for the prompt. The full
 * library is ~1.9k tokens, too heavy to send on every turn, so the coach gets this trimmed list.
 */
export const COACH_EVIDENCE: { id: string; short: string }[] = [
  { id: "swan-vms-duration-by-ethnicity", short: "Frequent hot flashes last a median ~7.4 years (SWAN), longer for some groups" },
  { id: "hormone-therapy-most-effective-vms", short: "Hormone therapy is the most effective hot-flash treatment; non-hormone options exist" },
  { id: "cbt-for-vms", short: "CBT reduces how much hot flashes bother women" },
  { id: "hot-flash-diet-triggers", short: "Evidence for alcohol/caffeine/spicy-food triggers is mixed" },
  { id: "night-sweats-disrupt-sleep", short: "Night-time hot flashes disrupt sleep" },
  { id: "depression-risk-perimenopause", short: "Depression risk rises during the menopause transition" },
  { id: "bp-rises-after-menopause", short: "Heart risk accelerates over menopause; BP often (not always) rises" },
  { id: "bone-loss-around-final-period", short: "Bone loss is fastest from 1 year before to 2 years after the final period" },
  { id: "exercise-improves-bmd", short: "Exercise modestly improves bone density; resistance/impact loading helps most" },
  { id: "calcium-vitamin-d-supplements", short: "Routine low-dose calcium/vitamin D supplements don't prevent fractures (USPSTF)" },
  { id: "cycle-phase-performance-small", short: "Cycle phase has at most a trivial effect on performance; go by her own response" },
  { id: "exercise-in-pregnancy-recommended", short: "Regular activity in pregnancy/postpartum is recommended (guidelines)" },
  { id: "perinatal-depression-common", short: "Perinatal depression is common (~1 in 7 to 1 in 5)" },
  { id: "exercise-reduces-depression", short: "Exercise moderately reduces depressive symptoms" },
];

/** Compact, prompt-ready list (~250 tokens) of verified PubMed sources for the coach. */
export function evidencePromptBlock(): string {
  return COACH_EVIDENCE.map(({ id, short }) => `- ${short}: ${evidenceFor(id)?.citations[0].url ?? ""}`).join("\n");
}
