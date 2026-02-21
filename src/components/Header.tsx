"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { useTheme } from "./ThemeProvider";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return <div className="w-14 h-7" />; // Placeholder for layout stability
  }
  
  const isDark = theme === "dark";
  
  return (
    <button
      onClick={toggleTheme}
      className="relative flex items-center w-14 h-7 rounded-full p-1 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-ast-accent/50"
      style={{ 
        backgroundColor: isDark ? "var(--ast-surface)" : "#e2e8f0",
        border: `1px solid ${isDark ? "var(--ast-border)" : "#cbd5e1"}`,
      }}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {/* Track icons */}
      <span className="absolute left-1.5 top-1/2 -translate-y-1/2">
        <svg className={`w-3.5 h-3.5 transition-opacity ${isDark ? "opacity-100 text-ast-gold" : "opacity-30 text-gray-400"}`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </span>
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
        <svg className={`w-3.5 h-3.5 transition-opacity ${!isDark ? "opacity-100 text-amber-500" : "opacity-30 text-gray-500"}`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
        </svg>
      </span>
      
      {/* Sliding knob */}
      <span 
        className={`absolute w-5 h-5 rounded-full shadow-md transition-all duration-300 ${
          isDark 
            ? "left-1 bg-ast-accent" 
            : "left-[calc(100%-1.5rem)] bg-white"
        }`}
      />
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
