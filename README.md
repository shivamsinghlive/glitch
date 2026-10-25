# Glitch — find the bug, fix your health

A voice-first health coach for women in **perimenopause and menopause**. It uses WHOOP data to track
hot flashes, night sweats, broken sleep, HRV and blood pressure, then turns them into simple visuals,
alerts and a doctor-ready summary. Built for Hackachusetts 2026 (Healthcare track H1: *wearable data
into better care*).

> Wellness insights, not a diagnosis. Treatment decisions belong with a clinician.

---

## Quick start (about 5 minutes)

### 1. Prerequisites

| Tool | Version | Check | Install |
|---|---|---|---|
| **Node.js** | 20 or newer (22 recommended) | `node -v` | https://nodejs.org or `nvm install 22` |
| **pnpm** | 10 | `pnpm -v` | `corepack enable` (ships with Node), or use `npx pnpm@10 …` |
| **Git** | any | `git --version` | https://git-scm.com |
| **Chrome / Edge** | recent | | Needed for voice input, camera and speech |
| **Groq API key** | free | | https://console.groq.com/keys |
| *Python 3.10+* | optional | `python3 --version` | Only to retrain the hot-flash model |

### 2. Clone and install

```bash
git clone https://github.com/rohinimachavolu/Glitch.git
cd Glitch
git checkout rohini            # or your own branch (see "Working together")
pnpm install                   # or: npx pnpm@10 install
```

### 3. Add your API key

```bash
cp .env.example .env
```

Open `.env` and paste your Groq key:

```
GROQ_API_KEY=gsk_your_key_here
```

`.env` is git-ignored. **Never commit it.** Each teammate uses their own key. The key is only read by the
server-side `/api/llm` proxy, never bundled into the browser. (The older name `VITE_GROQ_API_KEY` still works.)

### 4. Run it

```bash
pnpm dev                       # or: npx pnpm@10 dev
```

Open **http://localhost:3000** in Chrome.

### 5. Try the demo

1. On the first screen, tap **"Here for menopause support?"**: a 1-minute setup.
2. On Home, tap **Connect WHOOP → demo**. This loads 90 days of realistic sample data (no band needed).
3. Tap the **mic** and say *"I'm having a hot flash"* or *"My blood pressure is 132 over 84"*.
4. Tap the 📄 icon (top right) for the **doctor summary**.

**Start over any time:** open **http://localhost:3000/?reset**. It wipes all local data.

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server on http://localhost:3000 (hot reload) |
| `pnpm test` | Run the unit tests (Vitest) |
| `pnpm check` | TypeScript type-check |
| `pnpm build` | Production build into `dist/` |
| `pnpm start` | Serve the production build |
| `pnpm format` | Format code with Prettier |
| `pnpm train:hotflash` | Retrain the hot-flash model (see below) |
| `pnpm evidence` | Regenerate fairness audit, NHANES reference and detector evaluation |
| `pnpm validate:ovulation` | Optional: validate ovulation on mcPHASES (needs restricted data) |

---

## Features

- **Menopause Home**: dark, glanceable dashboard. Rings for hot flashes, sleep and HRV; tiles for night temperature, blood pressure, mood and resting HR; a sleep-stage donut; a 4-week trend chart; alert pills.
- **Glitchy, the voice coach**: talk instead of typing. Logs meals, hot flashes, blood pressure and mood from speech; reads mood on-device from face, voice tone and words; talks back with a lip-synced avatar; hands-free conversation.
- **Night-sweat detection**: nights with warm skin temperature *and* broken sleep, from WHOOP.
- **Perimenopause staging and alerts**: STRAW+10 stages, early (<45) and premature (<40) menopause flags, high-BP (ACC/AHA), sleep, hot-flash and mental-health alerts, optional notifications.
- **Doctor summary**: one-page weekly table to print or save as PDF.
- **Plans built from your choices, grounded in evidence (RAG)**: pick your goal, equipment, favourite training styles and days per week, and the weekly plan and food targets rebuild instantly. Every exercise says why it's there, and the plan lists the cited passages it was retrieved from (BM25 retrieval over a small cited library, on-device). The coach is grounded the same way.
- **Food that updates correctly**: calorie and protein targets are computed from your age, weight, height, goal and training days (Mifflin-St Jeor, menopause protein guidance). Log by voice, photo or by typing it in; a failed photo analysis never invents numbers.
- **Also included**: cycle-adjusted recovery, ovulation confirmation, a camera Form Coach (MediaPipe), food-photo logging, supplement timing rules, an appraisal-based check-in, PHQ-2/GAD-2 screening.

### Privacy
- All personal data is **encrypted on the device** (AES-GCM, non-extractable key). There's no backend database yet.
- Camera and microphone are analysed **in the browser**. The AI coach only receives text, and **you choose how much**: *AI off*, *Chat only* (default: just the messages you say or type) or *Chat + health summary* (also name, conditions, meals, WHOOP scores, menopause stage, consented hormone details). Open **Progress → Your data & privacy** to switch, and to see exactly what was sent this session.
- Full write-up of bias, harms and mitigations: [ETHICS.md](ETHICS.md).
- Ethnicity and hormone details are **optional and consented**, and used only for context, never for scoring.

---

## Project structure

```
client/src/
  pages/           Screens (MenopauseHome, Dashboard, WomensHealth, FormCoach, Progress…)
  components/      UI pieces (CoachChat, TalkingAvatar, MenopausePanel, MoodOrb…)
  hooks/           Data hooks (useHealthInsights, useMenopauseDashboard, useVoice, useFaceEmotion…)
  lib/             Logic, no UI. Each file has unit tests (*.test.ts)
    whoop/         WHOOP v2 types + demo data generator
    healthMetrics  Ovulation, stress, energy, VO2max, cycle-adjusted recovery
    menopause*     Staging, symptom scale, night sweats, triggers, BP, alerts
    coachAgent     AI coach prompt + validated actions + BP safety net
    models/        Trained model coefficients (JSON). No raw data.
  contexts/        App state (AppContext) with encrypted persistence
  index.css        Design system tokens (colours, fonts)
scripts/           Model training / validation (data downloaded locally, never committed)
server/            Express server for production + /api/llm Groq proxy (llmProxy.ts, also mounted in dev)
```

**Design system:** all colours come from CSS variables in `client/src/index.css`
(`--app-bg`, `--card-bg`, `--surface-2`, `--line`, `--ink`, `--txt-muted`, `--accent`, `--on-accent`).
Use these instead of hard-coded colours so every screen looks the same.

---

## Datasets and model training

Raw datasets are **never committed**. `scripts/data/` is git-ignored. Only trained coefficients and
aggregate settings live in `client/src/lib/models/`.

### Hot-flash risk model (TSHS Hot Flashes dataset)
- Source: https://www.causeweb.org/tshs/hot-flashes/ (CC BY-NC-SA 4.0, educational use).
- Logistic regression; cross-validated AUC 0.735 (profile) / 0.753 (with FSH and estradiol labs). Race and education are deliberately excluded.

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/train_hotflash_model.py   # downloads the data, writes models/hotflashRisk.json
```

### Fairness audit and calibration (TSHS)
`pnpm evidence` runs `scripts/evidence_hotflash.py`: out-of-fold AUC with a bootstrap interval, calibration by risk
quintile, and AUC by race and education (neither is a model feature). Writes `models/hotflashEvidence.json`.

### US population reference (NHANES 2017-2018, public)
`scripts/nhanes_reference.py` downloads the CDC DEMO, BPX and SLQ files and writes survey-weighted blood-pressure and
sleep percentiles for women 35-79 by age band (`models/nhanesReference.json`). The app uses it for "you vs US women your age".

### Detector evaluation (simulated ground truth)
No public dataset pairs wearable nights with confirmed night sweats, so `scripts/evaluate_detectors.ts` simulates nights
and cycles with known answers (plus confounders and anovulatory cycles) and reports precision, recall, false-alarm rate,
a threshold sweep and ovulation timing error (`models/detectorEvaluation.json`). This is a stress test, not clinical validation.

### Ovulation on real data (optional, mcPHASES: restricted)
Needs a PhysioNet account and a signed data use agreement: https://physionet.org/content/mcphases/1.0.0/
Put the CSVs in `scripts/data/mcphases/` (git-ignored), then `pnpm validate:ovulation -- --inspect` and `pnpm validate:ovulation`.
Not run for this submission; the thresholds are the standard "3 over 6" rule. Never commit mcPHASES files.

---

## Working together

```bash
git checkout -b your-name          # your own branch
# …make changes…
pnpm test && pnpm check            # make sure nothing broke
git add -A && git commit -m "Describe your change"
git push -u origin your-name
```

Then open a Pull Request into `main` on GitHub. Don't push directly to `main`.

**Before committing:** make sure `.env`, `scripts/data/` and any downloaded datasets are not staged (`git status`).

---

## Deploy to Render

`render.yaml` is a Render Blueprint, so Render reads it and sets everything up for you.

1. Push your branch to GitHub. `render.yaml` deploys the `rohini` branch; change `branch:` if you use another.
2. Go to https://dashboard.render.com, sign in with GitHub, then **New → Blueprint**.
3. Pick the `Glitch` repo and click **Connect**. If it isn't listed, choose *Configure account* and give Render access to the repo.
4. When asked for `GROQ_API_KEY`, paste your Groq key. Click **Apply**.
5. Wait for the first build (about 3–5 minutes). Your app is live at `https://glitch-xxxx.onrender.com`.
6. Check `https://<your-app>.onrender.com/api/health`. It should return `{"ok":true,"llm":true}`.

Every push to the branch redeploys automatically.

**How the AI stays up**
- The Groq key lives only on the server. The browser calls `/api/llm/chat` and `/api/llm/vision`.
- On a rate limit, the proxy tries the fallback model, then any extra keys in `GROQ_API_KEYS`, then waits once if Groq asks for a short pause.
- If Groq is still unavailable, the app keeps working without AI. Plans, food analysis and coaching use built-in defaults, and the voice coach still logs hot flashes, night sweats, blood pressure and mood.
- Each visitor IP is limited to `LLM_RATE_LIMIT_PER_MIN` AI requests per minute (default 40), so one user can't use up the quota.

**Free plan notes:** the service sleeps after 15 minutes without traffic, so the first visit after that takes
about a minute. App data lives in each visitor's browser, so nothing is lost on restarts. Open the app once
before a demo to wake it up.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `pnpm: command not found` | Run `corepack enable`, or prefix commands with `npx pnpm@10` |
| `npm ERR! EACCES` on install | Your npm cache has root-owned files. Run `sudo chown -R $(whoami) ~/.npm`, or use pnpm |
| AI replies say "using fallback" / generic text | Check `GROQ_API_KEY` in `.env` (or on Render), then restart. http://localhost:3000/api/health shows `"llm":true` when a key is set |
| `model … does not exist` from Groq | Groq retired a model. Set `GROQ_TEXT_MODEL` / `GROQ_FALLBACK_MODEL` / `GROQ_VISION_MODEL` in `.env` (or on Render) to a current model from https://console.groq.com/docs/models |
| Camera or mic doesn't work | Use Chrome/Edge on **localhost** (browsers block camera/mic on plain `http://` LAN addresses). Allow permissions in the address bar |
| Voice input button does nothing | Speech recognition needs Chrome, Edge or Safari (not Firefox) |
| Stuck on old data / weird state | Open http://localhost:3000/?reset |
| Port 3000 busy | Vite will pick the next free port. Check the terminal for the URL |

---

## Tech stack

React 19 · TypeScript · Vite 7 · Tailwind 4 · framer-motion · Recharts · MediaPipe Tasks Vision
(pose + face) · Web Speech API · Groq (LLM) · Vitest · Zod.

## License

MIT. See [LICENSE](LICENSE). Dataset licenses are listed above and apply to the data, not this code.
