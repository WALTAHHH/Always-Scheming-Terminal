'use client';

import posthog from 'posthog-js';
import { useEffect } from 'react';

// Detect if running as installed PWA
function isPWA(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check display-mode media query (works on Android + desktop)
  const displayMode = window.matchMedia('(display-mode: standalone)').matches;
  
  // Check iOS standalone mode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iosStandalone = (window.navigator as any).standalone === true;
  
  // Check if launched from TWA (Trusted Web Activity)
  const referrer = document.referrer.includes('android-app://');
  
  return displayMode || iosStandalone || referrer;
}

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

      // Register PWA status as a super property (attached to all events)
      const pwaStatus = isPWA();
      posthog.register({
        is_pwa: pwaStatus,
        app_mode: pwaStatus ? 'pwa' : 'browser',
      });

      // Track PWA launch as distinct event (first time only per session)
      if (pwaStatus && !sessionStorage.getItem('pwa_launch_tracked')) {
        posthog.capture('pwa_launched');
        sessionStorage.setItem('pwa_launch_tracked', 'true');
      }
    }
  }, []);

  // Always render children directly - no conditional wrapper
  // PostHog runs via autocapture, no React context needed for basic tracking
  return <>{children}</>;
}
