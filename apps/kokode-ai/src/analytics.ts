// Minimal attribution: capture UTM params + referrer once per session so a
// later form submit keeps the original traffic source. No third-party script
// is loaded; add one explicitly only when you are ready for analytics.

export interface Attribution {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  referrer: string;
  landingUrl: string;
}

const STORAGE_KEY = 'genba-ai-attribution';
const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

type UtmKey = (typeof UTM_KEYS)[number];

function readStored(): Partial<Attribution> & Partial<Record<UtmKey, string>> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Attribution> &
      Partial<Record<UtmKey, string>>;
  } catch {
    return {};
  }
}

function storedUtm(
  stored: Partial<Attribution> & Partial<Record<UtmKey, string>>,
  key: UtmKey,
): string {
  switch (key) {
    case 'utm_source':
      return stored.utmSource ?? stored.utm_source ?? '';
    case 'utm_medium':
      return stored.utmMedium ?? stored.utm_medium ?? '';
    case 'utm_campaign':
      return stored.utmCampaign ?? stored.utm_campaign ?? '';
    case 'utm_term':
      return stored.utmTerm ?? stored.utm_term ?? '';
    case 'utm_content':
      return stored.utmContent ?? stored.utm_content ?? '';
  }
}

export function getAttribution(): Attribution {
  const stored = readStored();
  const query = new URLSearchParams(window.location.search);
  const merged: Attribution = {
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    utmTerm: '',
    utmContent: '',
    // First-touch: keep the original referrer / landing page for the session.
    referrer: stored.referrer ?? '',
    landingUrl: stored.landingUrl ?? '',
  };

  const utmByKey: Record<UtmKey, keyof Attribution> = {
    utm_source: 'utmSource',
    utm_medium: 'utmMedium',
    utm_campaign: 'utmCampaign',
    utm_term: 'utmTerm',
    utm_content: 'utmContent',
  };

  for (const key of UTM_KEYS) {
    const current = query.get(key);
    merged[utmByKey[key]] = current ?? storedUtm(stored, key) ?? '';
  }

  // Only fill referrer / landingUrl once per session (first touch).
  if (!merged.referrer) merged.referrer = document.referrer;
  if (!merged.landingUrl) merged.landingUrl = window.location.href;

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Storage unavailable (private mode etc.): attribution is best-effort.
  }

  return merged;
}

/** Future hook for product analytics. No-ops until VITE_ANALYTICS_ENDPOINT is set. */
export function trackEvent(name: string, data?: Record<string, string>): void {
  const endpoint: string = import.meta.env.VITE_ANALYTICS_ENDPOINT ?? '';
  if (!endpoint) {
    if (import.meta.env.DEV) {
      console.debug(`[analytics] ${name}`, data ?? {});
    }
    return;
  }

  try {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: name, ...data }),
      keepalive: true,
    });
  } catch {
    // Analytics must never break the page.
  }
}
