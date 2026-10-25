/**
 * Glitch — small, muted "source" link for a claim, resolved from the verified evidence library
 * (lib/evidence.ts). Renders nothing if the id is unknown, so a typo never shows a broken link.
 */
import { evidenceFor } from "@/lib/evidence";

export default function EvidenceSource({ id, label = "source" }: { id: string; label?: string }) {
  const e = evidenceFor(id);
  if (!e) return null;
  const c = e.citations[0];
  return (
    <a
      href={c.url}
      target="_blank"
      rel="noreferrer"
      title={`${e.claim}\n\n${c.title} (${c.journal}, ${c.year}) · PubMed ${c.pmid}`}
      style={{ fontSize: 10.5, color: "var(--txt-muted)", textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif" }}
    >
      {label} ↗
    </a>
  );
}
