import type { Metadata } from "next";
import { KeyboardNav } from "@/components/KeyboardNav";
import { FeedbackButton } from "@/components/FeedbackButton";
import { PostHogProvider } from "@/components/PostHogProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Always Scheming | Terminal",
  description: "Gaming industry intelligence, real-time.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Prevent flash of wrong theme - runs before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var theme = localStorage.getItem('ast-theme');
                if (theme === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                }
              })();
            `,
          }}
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#00d4aa" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AST" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="AST" />
        <meta name="msapplication-TileColor" content="#0d1117" />
        <meta name="msapplication-tap-highlight" content="no" />
        
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Always Scheming | Terminal RSS Feed"
          href="/api/feed.xml"
        />
      </head>
      <body className="bg-ast-bg text-ast-text font-mono antialiased min-h-screen">
        <ThemeProvider>
          <PostHogProvider>
            <KeyboardNav />
            {children}
            <FeedbackButton />
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
// Force rebuild 1771709642
