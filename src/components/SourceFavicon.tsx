"use client";

import Image from "next/image";

interface SourceFaviconProps {
  url: string | undefined;
  size?: number;
  className?: string;
}

export function getFaviconUrl(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null;
  try {
    const domain = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return null;
  }
}

export function SourceFavicon({ url, size = 14, className = "" }: SourceFaviconProps) {
  const faviconUrl = getFaviconUrl(url);
  
  if (!faviconUrl) return null;
  
  return (
    <Image
      src={faviconUrl}
      alt=""
      width={size}
      height={size}
      className={`rounded-sm flex-shrink-0 ${className}`}
      unoptimized
    />
  );
}
