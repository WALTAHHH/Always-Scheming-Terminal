import type { Metadata } from "next";
import { KeyboardNav } from "@/components/KeyboardNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Always Scheming Terminal",
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
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Always Scheming Terminal RSS Feed"
          href="/api/feed.xml"
        />
      </head>
      <body className="bg-ast-bg text-ast-text font-mono antialiased min-h-screen">
        <KeyboardNav />
        {children}
      </body>
    </html>
  );
}
