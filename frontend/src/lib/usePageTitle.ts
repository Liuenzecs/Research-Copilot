"use client";

import { useEffect } from 'react';

import { buildPageTitle } from '@/lib/branding';

export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = buildPageTitle(title);
  }, [title]);
}
