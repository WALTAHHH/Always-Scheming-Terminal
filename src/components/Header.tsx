import Link from "next/link";
import { ShortcutsHelp } from "./ShortcutsHelp";

export function Header() {
  return (
    <header className="h-12 sm:h-14 border-b border-ast-border sticky top-0 z-50 bg-ast-bg/95 backdrop-blur-sm">
      <div className="h-full max-w-5xl mx-auto px-3 sm:px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-ast-accent text-base sm:text-lg">⚡</span>
          <h1 className="font-semibold text-sm sm:text-lg tracking-tight">
            <span className="text-ast-accent">AS</span>{" "}
            <span className="text-ast-text hidden sm:inline">
              <span className="text-ast-accent">Always</span>{" "}
              <span className="text-ast-pink">Scheming</span>{" "}
            </span>
            <span className="text-ast-text">Terminal</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden sm:inline"><ShortcutsHelp /></span>
          <Link
            href="/admin"
            className="hidden sm:inline text-ast-muted hover:text-ast-accent text-xs transition-colors"
          >
            ⚙ Admin
          </Link>
          <span className="text-ast-muted text-[10px] sm:text-xs">v0.1</span>
        </div>
      </div>
    </header>
  );
}
