import { describe, expect, it } from "vitest";
import { COACH_EVIDENCE, EVIDENCE, evidenceFor, evidencePromptBlock } from "./evidence";

const LEVELS = ["guideline", "meta-analysis", "rct", "cohort", "cross-sectional", "review"];

describe("evidence library", () => {
  it("has unique kebab-case ids", () => {
    const ids = EVIDENCE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("every item has a claim, a valid level and 1–3 citations", () => {
    for (const e of EVIDENCE) {
      expect(e.claim.trim().length).toBeGreaterThan(20);
      expect(LEVELS).toContain(e.evidenceLevel);
      expect(e.citations.length).toBeGreaterThanOrEqual(1);
      expect(e.citations.length).toBeLessThanOrEqual(3);
    }
  });

  it("every citation has a numeric PMID and a PubMed URL matching it", () => {
    for (const e of EVIDENCE) {
      for (const c of e.citations) {
        expect(c.pmid).toMatch(/^\d{6,9}$/);
        expect(c.url).toBe(`https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`);
        expect(c.title.trim()).not.toBe("");
        expect(c.journal.trim()).not.toBe("");
        expect(c.year).toBeGreaterThanOrEqual(1990);
        expect(c.year).toBeLessThanOrEqual(new Date().getFullYear());
      }
    }
  });

  it("the same PMID always carries the same title", () => {
    const seen = new Map<string, string>();
    for (const c of EVIDENCE.flatMap((e) => e.citations)) {
      if (seen.has(c.pmid)) expect(seen.get(c.pmid)).toBe(c.title);
      seen.set(c.pmid, c.title);
    }
  });

  it("evidenceFor looks items up by id", () => {
    expect(evidenceFor("swan-vms-duration-by-ethnicity")?.citations[0].pmid).toBe("25686030");
    expect(evidenceFor("does-not-exist")).toBeUndefined();
  });

  it("coach prompt block is compact and every entry resolves to a PubMed link", () => {
    const block = evidencePromptBlock();
    for (const { id } of COACH_EVIDENCE) {
      const e = evidenceFor(id);
      expect(e).toBeDefined();
      expect(block).toContain(e!.citations[0].url);
    }
    // ~4 chars/token: keep it under ~400 tokens
    expect(block.length).toBeLessThan(1600);
  });
});

// ── App copy stays aligned with the verified evidence (see docs/claim-audit.md) ──
import { scoreMrs, stageMenopause, menopauseTraining } from "./menopause";
import { menopauseAlerts } from "./menopauseSignals";
import { buildSystemPrompt } from "./coachAgent";
import { suggestBoneSupplements, CITATIONS, BONE_HEALTH_SUMMARY } from "./boneHealth";

describe("claim alignment", () => {
  it("MRS total 16 is moderate and 17 severe (Heinemann 2004 bands)", () => {
    const base = { hot_flushes: 4, heart: 4, sleep: 4, joints: 4 };
    expect(scoreMrs(base, "2026-10-24").severity).toBe("moderate");
    expect(scoreMrs({ ...base, depressive: 1 }, "2026-10-24").severity).toBe("severe");
  });

  it("stays in early postmenopause for ~5–8 years (STRAW+10)", () => {
    expect(stageMenopause({ periodStarts: ["2022-01-01"], age: 55, today: "2026-10-24" }).stage).toBe("early_postmenopause");
    expect(stageMenopause({ periodStarts: ["2018-01-01"], age: 60, today: "2026-10-24" }).stage).toBe("late_postmenopause");
  });

  it("labels night sweats as possible and doesn't present trigger avoidance as proven", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    const warm = ["2026-10-20", "2026-10-21", "2026-10-22"].map((date) => ({ date, tempDelta: 0.5, likely: true }));
    const a = menopauseAlerts({ stage: { stage: "early_postmenopause", label: "", explanation: "" }, warm, frag: [], flashes: [], bp: [], mind: { level: "ok", hrvChangePct: null, avgMood7: null, reasons: [] }, now });
    const sweat = a.find((x) => x.id.startsWith("sweats-"))!;
    expect(sweat.title).toMatch(/Possible/);
    expect(sweat.detail).toMatch(/not a validated/);
    expect(sweat.detail).not.toMatch(/18 °C|no alcohol within/);
    expect(evidenceFor(sweat.evidenceId!)).toBeDefined();
  });

  it("protein guidance is ~1–1.2 g/kg and triggers are framed as personal", () => {
    const t = menopauseTraining({ weekday: 1, recovery: 70, warmNightLastNight: false, weightKg: 70 });
    expect(t.nutrition[0]).toMatch(/70–84 g/);
    expect(t.nutrition.join(" ")).toMatch(/your own logs/);
  });

  it("bone copy: no blanket supplement doses, no STOP-EM, every citation is a verified PubMed link", () => {
    const s = suggestBoneSupplements();
    expect(s.map((x) => x.dose).join(" ")).not.toMatch(/800 IU|1000 mg/);
    expect(s.map((x) => x.reason).join(" ")).not.toMatch(/run low/);
    for (const c of Object.values(CITATIONS)) {
      expect(c.url).toMatch(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/);
      expect(evidenceFor(c.evidenceId)).toBeDefined();
      expect(c.url).not.toContain("39909519");
    }
    expect(BONE_HEALTH_SUMMARY).not.toMatch(/don't load bone/);
  });

  it("coach prompt carries verified sources and doesn't call slow breathing a treatment", () => {
    const p = buildSystemPrompt({ firstName: "Ana", goal: "health", todayMeals: [], localTime: "9:00", menopause: { stage: "Late perimenopause", flashesToday: 1, nightSweatNights14: 2 } });
    expect(p).toContain("https://pubmed.ncbi.nlm.nih.gov/25686030/");
    expect(p).toMatch(/don't present slow breathing as a hot-flash treatment/);
    expect(p).toMatch(/AHA\/ACC \(2025\)/);
  });
});
