"use client";

import { useState, useEffect } from "react";

const SHORTCUTS = [
  { keys: ["j", "↓"], desc: "Next item" },
  { keys: ["k", "↑"], desc: "Previous item" },
  { keys: ["o", "Enter"], desc: "Open in new tab" },
  { keys: ["/"], desc: "Search" },
  { keys: ["Esc"], desc: "Clear / unfocus" },
  { keys: ["?"], desc: "Toggle this help" },
];

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

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

  return (
    <>
      {/* Small hint in the header area */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="text-ast-muted hover:text-ast-text text-xs transition-colors"
        title="Keyboard shortcuts (?)"
      >
        <kbd className="px-1.5 py-0.5 bg-ast-surface border border-ast-border rounded text-[10px]">?</kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[60]"
            onClick={() => setOpen(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] bg-ast-surface border border-ast-border rounded-lg shadow-2xl p-6 w-[320px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-ast-text font-semibold text-sm">
                Keyboard Shortcuts
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-ast-muted hover:text-ast-text text-xs"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2.5">
              {SHORTCUTS.map((s) => (
                <div
                  key={s.desc}
                  className="flex items-center justify-between"
                >
                  <span className="text-ast-muted text-xs">{s.desc}</span>
                  <div className="flex gap-1">
                    {s.keys.map((key) => (
                      <kbd
                        key={key}
                        className="px-2 py-0.5 bg-ast-bg border border-ast-border rounded text-[11px] text-ast-text font-mono min-w-[28px] text-center"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
