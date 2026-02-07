"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

const SHORTCUTS = [
  { keys: ["j", "↓"], desc: "Next item" },
  { keys: ["k", "↑"], desc: "Previous item" },
  { keys: ["o", "Enter"], desc: "Open in new tab" },
  { keys: ["/"], desc: "Focus search" },
  { keys: ["s"], desc: "Toggle Source filter" },
  { keys: ["c"], desc: "Toggle Company filter" },
  { keys: ["Esc"], desc: "Close filters / unfocus" },
  { keys: ["1"], desc: "Toggle Feed panel" },
  { keys: ["2"], desc: "Toggle Signal panel" },
  { keys: ["3"], desc: "Toggle Companies panel" },
  { keys: ["[", "]"], desc: "Resize left/right split" },
  { keys: ["-", "="], desc: "Resize top/bottom split" },
  { keys: ["?"], desc: "Toggle this help" },
];

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "?") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const modal = open && mounted ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      
      {/* Modal content */}
      <div className="relative bg-ast-surface border border-ast-border rounded-lg shadow-2xl p-6 w-[340px] max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-ast-text font-semibold text-base">
            ⌨️ Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="w-6 h-6 rounded border border-ast-border text-ast-muted hover:text-ast-text flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3">
          {SHORTCUTS.map((s) => (
            <div
              key={s.desc}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-ast-muted text-xs">{s.desc}</span>
              <div className="flex gap-1 flex-shrink-0">
                {s.keys.map((key) => (
                  <kbd
                    key={key}
                    className="px-2 py-1 bg-ast-bg border border-ast-border rounded text-[11px] text-ast-text font-mono min-w-[28px] text-center"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-ast-border">
          <p className="text-ast-muted text-[10px] text-center">
            Press <kbd className="px-1 py-0.5 bg-ast-bg border border-ast-border rounded text-[10px]">?</kbd> or <kbd className="px-1 py-0.5 bg-ast-bg border border-ast-border rounded text-[10px]">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="text-ast-muted hover:text-ast-text text-xs transition-colors"
        title="Keyboard shortcuts (?)"
      >
        <kbd className="px-1.5 py-0.5 bg-ast-surface border border-ast-border rounded text-[10px]">?</kbd>
      </button>

      {/* Portal the modal to body */}
      {mounted && modal && createPortal(modal, document.body)}
    </>
  );
}
