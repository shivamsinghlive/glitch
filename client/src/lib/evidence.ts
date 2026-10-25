/**
 * Glitch — a small, cited evidence base and the retrieval step that grounds plans in it (RAG).
 *
 * Every passage is a short, checkable statement taken from a source we cite. Retrieval is BM25 over the
 * passage text plus topic tags, so it runs on the device with no AI call and no data leaving the phone.
 * The planner uses the retrieved passages to choose and justify exercises; when the user allows the AI,
 * the same passages are put in its prompt and it must cite them by id.
 *
 * Wellness guidance, not a diagnosis. Passages describe what the sources say, not what will happen to one person.
 */
export interface Passage {
  id: string;
  /** What the source says, in one or two sentences */
  text: string;
  topics: string[];
  label: string;
  url: string;
}

export const EVIDENCE: Passage[] = [
  { id: "liftmor", topics: ["bone", "strength", "impact", "postmenopause", "resistance", "heavy", "lifting", "weights", "weight", "lift", "jump", "jumping", "exercise", "workout"], label: "LIFTMOR trial (Watson 2018)", url: "https://academic.oup.com/jbmr/article/33/2/211/7605709",
    text: "In LIFTMOR, 101 postmenopausal women with low bone mass did supervised heavy lifting and jumping twice a week for eight months, and beat a gentle home programme for spine and hip bone density, height and function." },
  { id: "meta17", topics: ["bone", "strength", "resistance", "postmenopause", "frequency", "intensity", "lifting", "weights", "exercise", "workout"], label: "17-trial meta-analysis (2025)", url: "https://josr-online.biomedcentral.com/articles/10.1186/s13018-025-05890-1",
    text: "A meta-analysis of 17 trials (690 women) found resistance training helps bone density after menopause; lifting at about 70% of one-rep max or more, three times a week, for longer may work best, though studies vary a lot." },
  { id: "bmd-freq", topics: ["bone", "strength", "impact", "frequency", "resistance", "intensity", "lifting", "weights", "exercise", "workout", "jumping", "often", "week"], label: "Exercise and bone density review (Frontiers 2025)", url: "https://www.frontiersin.org/journals/reproductive-health/articles/10.3389/frph.2025.1542746/full",
    text: "The review recommends resistance training two to three times a week at 70 to 85% of one-rep max, plus impact-loading activities such as jogging, jumping or hopping at least three times a week, sustained for more than six months, to preserve bone density around menopause." },
  { id: "stopem", topics: ["bone", "strength", "early", "menopause", "perimenopause"], label: "STOP-EM trial", url: "https://pubmed.ncbi.nlm.nih.gov/39909519/",
    text: "The STOP-EM trial tested strength training for osteoporosis prevention during early menopause." },
  { id: "aaos-loss", topics: ["bone", "loss", "menopause", "perimenopause", "why", "muscle"], label: "AAOS: musculoskeletal syndrome of menopause", url: "https://www.orthoinfo.org/diseases--conditions/musculoskeletal-syndrome-of-menopause-msm/",
    text: "Bone loss speeds up to about 2% a year from roughly a year before the last period and continues at that rate a couple of years after menopause; estradiol loss also contributes to declining muscle." },
  { id: "stanford-50", topics: ["strength", "muscle", "sarcopenia", "older", "resistance"], label: "Stanford: strength training for women 50+", url: "https://lifestylemedicine.stanford.edu/strength-training-for-women-50/",
    text: "Strength training helps women over 50 keep muscle and function as muscle mass declines with age." },
  { id: "yoga-limit", topics: ["yoga", "pilates", "balance", "bone", "gentle", "walking", "low-impact", "walk", "enough", "exercise"], label: "Exercise and bone density review (Frontiers 2025)", url: "https://www.frontiersin.org/journals/reproductive-health/articles/10.3389/frph.2025.1542746/full",
    text: "Low-impact activity such as Tai Chi, walking and Pilates should not be the only intervention for bone; it can help alongside combined resistance and impact training." },
  { id: "cdc-adult", topics: ["cardio", "aerobic", "strength", "general", "weight", "maintain", "diabetes", "guideline", "exercise", "workout", "minutes", "week", "often", "walking", "run", "running"], label: "CDC: physical activity for adults", url: "https://www.cdc.gov/physical-activity-basics/guidelines/adults.html",
    text: "Adults need 150 minutes of moderate-intensity activity a week (or 75 minutes of vigorous activity) and at least 2 days a week of muscle-strengthening activity that works all major muscle groups." },
  { id: "cdc-older", topics: ["balance", "older", "falls", "function", "strength"], label: "CDC: physical activity for older adults", url: "https://www.cdc.gov/physical-activity-basics/guidelines/older-adults.html",
    text: "Adults 65 and over need at least 2 days a week of muscle-strengthening activity and activities to improve balance, alongside aerobic activity." },
  { id: "esceo", topics: ["calcium", "vitamin", "d", "nutrition", "bone", "protein", "muscle", "food", "menopause", "postmenopause"], label: "ESCEO consensus on protein and vitamin D (Rizzoli 2014)", url: "https://acuresearchbank.acu.edu.au/item/89q1z/the-role-of-dietary-protein-and-vitamin-d-in-maintaining-musculoskeletal-health-in-postmenopausal-women-a-consensus-statement-from-the-european-society-for-clinical-and-economic-aspects-of",
    text: "For postmenopausal women the consensus recommends 1.0 to 1.2 g of protein per kg of body weight a day, 800 IU of vitamin D and 1000 mg of calcium a day, with regular exercise three to five times a week." },
  { id: "protein-exercise", topics: ["protein", "muscle", "nutrition", "exercise", "postmenopause"], label: "ESCEO consensus (Rizzoli 2014)", url: "https://acuresearchbank.acu.edu.au/item/89q1z/the-role-of-dietary-protein-and-vitamin-d-in-maintaining-musculoskeletal-health-in-postmenopausal-women-a-consensus-statement-from-the-european-society-for-clinical-and-economic-aspects-of",
    text: "Protein intake and physical activity are the main anabolic stimuli for muscle, and optimal protein combined with exercise builds more muscle than either alone." },
  { id: "dexa", topics: ["bone", "screening", "dexa", "scan", "density", "test", "screen", "osteoporosis", "65"], label: "USPSTF: osteoporosis screening", url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/osteoporosis-screening",
    text: "Bone-density screening is recommended for all women 65 and over, and earlier for postmenopausal women at increased risk." },
  { id: "straw", topics: ["stage", "perimenopause", "menopause", "staging"], label: "STRAW+10 (Harlow 2012)", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3340903/",
    text: "STRAW+10 defines the early transition by a persistent 7-day or greater change in cycle length and the late transition by 60 or more days without a period." },
];

const STOP = new Set(("a an and the of to in on for with at by is are be as it its or if i me my we you your do does did done what how should would could can much many more most than that this these those there their they them was were been am will not no yes so too very just about from into over out up down day today get got have has had").split(" "));
/** Crude stemmer: enough to match "bones/bone", "lifting/lift", "weights/weight" without a library. */
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|es|ed|s)$/, "") : w.length === 4 ? w.replace(/s$/, "") : w);
const tok = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).map(stem);

interface Index { docs: { p: Passage; tf: Map<string, number>; len: number }[]; df: Map<string, number>; avg: number }
let index: Index | null = null;

function build(): Index {
  const docs = EVIDENCE.map((p) => {
    const words = [...tok(p.text), ...p.topics.flatMap((t) => tok(t)).flatMap((t) => [t, t, t])]; // topic tags count triple
    const tf = new Map<string, number>();
    for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
    return { p, tf, len: words.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const w of Array.from(d.tf.keys())) df.set(w, (df.get(w) ?? 0) + 1);
  return { docs, df, avg: docs.reduce((a, d) => a + d.len, 0) / docs.length };
}

/** BM25 retrieval. Returns the top-k passages with their scores (score 0 passages are dropped). */
export function retrieve(query: string, k = 4): { passage: Passage; score: number }[] {
  index ??= build();
  const { docs, df, avg } = index;
  const q = tok(query);
  const k1 = 1.4, b = 0.75, N = docs.length;
  return docs
    .map((d) => {
      let score = 0;
      for (const w of Array.from(new Set(q))) {
        const f = d.tf.get(w);
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avg));
      }
      return { passage: d.p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Passages worth giving the coach for a question. Only strong matches are returned, so small talk and
 * unrelated questions retrieve nothing. The library is public, so this is safe in any privacy mode.
 */
export function evidenceForQuestion(question: string, k = 3, minScore = 3): Passage[] {
  return retrieve(question, k).filter((r) => r.score >= minScore).map((r) => r.passage);
}

export const passageById = (id: string) => EVIDENCE.find((p) => p.id === id);

/** Prompt block for the AI: the retrieved passages, to be cited by id. */
export function evidenceBlock(passages: Passage[]): string {
  return passages.map((p) => `[${p.id}] ${p.text} (${p.label}, ${p.url})`).join("\n");
}
