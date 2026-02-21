"use client";

import Link from "next/link";
import Image from "next/image";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { useTheme } from "./ThemeProvider";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <button
      onClick={toggleTheme}
      className="text-ast-muted hover:text-ast-accent transition-colors p-1 rounded"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}

export function Header() {
  return (
    <header className="h-12 sm:h-14 border-b border-ast-border sticky top-0 z-50 bg-ast-bg/95 backdrop-blur-sm">
      <div className="h-full max-w-5xl mx-auto px-3 sm:px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Always Scheming"
            width={24}
            height={24}
            className="w-5 h-5 sm:w-6 sm:h-6"
          />
          <h1 className="font-semibold text-sm sm:text-lg tracking-tight">
            <span className="text-ast-text hidden sm:inline">
              <span className="text-ast-accent">Always</span>{" "}
              <span className="text-ast-pink">Scheming</span>{" "}
            </span>
            <span className="text-ast-text">Terminal</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden sm:inline"><ShortcutsHelp /></span>
          <a
            href="/api/feed.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ast-muted hover:text-orange-400 text-xs transition-colors flex items-center gap-1"
            title="RSS Feed"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="6.18" cy="17.82" r="2.18"/>
              <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z"/>
            </svg>
            <span className="hidden sm:inline">RSS</span>
          </a>
          <ThemeToggle />
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
