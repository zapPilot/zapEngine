import posthog from 'posthog-js';

const posthogKey = process.env['NEXT_PUBLIC_POSTHOG_KEY']?.trim();

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host:
      process.env['NEXT_PUBLIC_POSTHOG_HOST']?.trim() ||
      'https://us.i.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
  });
}
