'use client';

import posthog from 'posthog-js';
import { useEffect } from 'react';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (key && typeof window !== 'undefined') {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: true,
      });
    }
  }, []);

  // Always render children directly - no conditional wrapper
  // PostHog runs via autocapture, no React context needed for basic tracking
  return <>{children}</>;
}
