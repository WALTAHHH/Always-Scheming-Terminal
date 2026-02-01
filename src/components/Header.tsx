import Link from "next/link";
import { ShortcutsHelp } from "./ShortcutsHelp";

export function Header() {
  return (
    <header className="border-b border-ast-border sticky top-0 z-50 bg-ast-bg/95 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-ast-accent text-lg">⚡</span>
          <h1 className="font-semibold text-lg tracking-tight">
            <span className="text-ast-accent">Always</span>{" "}
            <span className="text-ast-pink">Scheming</span>{" "}
            <span className="text-ast-text">Terminal</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <ShortcutsHelp />
          <Link
            href="/admin"
            className="text-ast-muted hover:text-ast-accent text-xs transition-colors"
          >
            ⚙ Admin
          </Link>
          <span className="text-ast-muted text-xs">v0.1</span>
        </div>
      </div>
    </header>
  );
}
