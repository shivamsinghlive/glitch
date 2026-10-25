/**
 * Glitch — small "?" button that expands the numbers, method and caveats behind an analysis card,
 * so the card itself can stay to one or two lines.
 */
import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export default function InfoToggle({ label = "How we know", children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: 0, border: "none", background: "transparent", color: "var(--txt-muted)", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
        <span aria-hidden style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "var(--ink)", background: open ? "var(--surface-2)" : "transparent" }}>?</span>
        {open ? "Hide details" : label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}>
            <div style={{ marginTop: 8, padding: 12, borderRadius: 14, background: "var(--surface-2)", fontSize: 12, lineHeight: 1.5, color: "var(--ink-2)", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column", gap: 6 }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
