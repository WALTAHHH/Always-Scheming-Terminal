"use client";

import { useEffect } from "react";

/**
 * Keyboard shortcuts:
 *   j / ↓  — next item
 *   k / ↑  — previous item
 *   o / Enter — open selected item in new tab
 *   /  — focus search
 *   s  — toggle/focus Source filter
 *   c  — toggle/focus Company filter
 *   Esc — clear focus / close dropdowns
 *   1  — toggle Feed panel
 *   2  — toggle Signal panel
 *   3  — toggle Companies panel
 *   [  — shrink left pane
 *   ]  — grow left pane
 *   -  — shrink top-right pane
 *   =  — grow top-right pane
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

    function dispatchShortcut(key: string) {
      window.dispatchEvent(
        new CustomEvent("ast-shortcut", { detail: { key } })
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Escape always works — close dropdowns, blur inputs, clear selection
      if (e.key === "Escape") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") {
          (e.target as HTMLElement).blur();
        }
        setActive(getItems(), -1);
        dispatchShortcut("close");
        return;
      }

      // Don't capture other shortcuts if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
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
          dispatchShortcut("search");
          break;
        }
        case "s": {
          e.preventDefault();
          dispatchShortcut("source");
          break;
        }
        case "c": {
          e.preventDefault();
          dispatchShortcut("company");
          break;
        }
        case "1": {
          e.preventDefault();
          dispatchShortcut("toggle-feed");
          break;
        }
        case "2": {
          e.preventDefault();
          dispatchShortcut("toggle-signal");
          break;
        }
        case "3": {
          e.preventDefault();
          dispatchShortcut("toggle-companies");
          break;
        }
        case "[": {
          e.preventDefault();
          dispatchShortcut("shrink-left");
          break;
        }
        case "]": {
          e.preventDefault();
          dispatchShortcut("grow-left");
          break;
        }
        case "-": {
          e.preventDefault();
          dispatchShortcut("shrink-top");
          break;
        }
        case "=": {
          e.preventDefault();
          dispatchShortcut("grow-top");
          break;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
