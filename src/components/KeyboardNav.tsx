"use client";

import { useEffect } from "react";

/**
 * Keyboard shortcuts:
 *   j / ↓  — next item
 *   k / ↑  — previous item
 *   o / Enter — open selected item in new tab
 *   /  — focus search
 *   Esc — clear focus / close dropdowns
 */
export function KeyboardNav() {
  useEffect(() => {
    function getItems(): HTMLAnchorElement[] {
      return Array.from(
        document.querySelectorAll<HTMLAnchorElement>("[data-feed-item]")
      );
    }

    function getActiveIndex(items: HTMLAnchorElement[]): number {
      const active = document.querySelector("[data-feed-item].ring-1");
      return active ? items.indexOf(active as HTMLAnchorElement) : -1;
    }

    function setActive(items: HTMLAnchorElement[], index: number) {
      // Remove highlight from all
      items.forEach((el) => {
        el.classList.remove("ring-1", "ring-ast-accent/50", "bg-ast-surface/30");
      });

      if (index >= 0 && index < items.length) {
        const el = items[index];
        el.classList.add("ring-1", "ring-ast-accent/50", "bg-ast-surface/30");
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      const items = getItems();
      const current = getActiveIndex(items);

      switch (e.key) {
        case "j":
        case "ArrowDown": {
          e.preventDefault();
          const next = Math.min(current + 1, items.length - 1);
          setActive(items, next);
          break;
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault();
          const prev = Math.max(current - 1, 0);
          setActive(items, prev);
          break;
        }
        case "o":
        case "Enter": {
          if (current >= 0 && items[current]) {
            e.preventDefault();
            window.open(items[current].href, "_blank");
          }
          break;
        }
        case "/": {
          e.preventDefault();
          const search = document.querySelector<HTMLInputElement>(
            'input[placeholder="Search..."]'
          );
          search?.focus();
          break;
        }
        case "Escape": {
          setActive(items, -1);
          break;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
