"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, markSignedIn } from '@/lib/auth';
import { wakeBackend } from '@/lib/api';

// Runs on the landing page, which is otherwise plain server-rendered HTML
export default function LandingEffects() {
  const router = useRouter();

  useEffect(() => {
    // Someone who signed in before the "signed in" cookie existed: set it and show the dashboard
    if (isAuthenticated()) {
      markSignedIn();
      router.refresh();
      return;
    }
    wakeBackend();
  }, [router]);

  return null;
}
