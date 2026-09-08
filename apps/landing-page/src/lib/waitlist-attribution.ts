export interface WaitlistAttribution {
  landingPath: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
}

const STORAGE_KEY = 'zap-pilot:waitlist-first-touch:v1';

export function captureWaitlistFirstTouch(): WaitlistAttribution | null {
  if (typeof window === 'undefined') return null;

  const stored = readStoredAttribution();
  if (stored) return stored;

  const params = new URLSearchParams(window.location.search);
  const attribution: WaitlistAttribution = {
    landingPath: `${window.location.pathname}${window.location.search}`,
    ...(document.referrer ? { referrer: document.referrer } : {}),
    ...utmField(params, 'utm_source', 'utmSource'),
    ...utmField(params, 'utm_medium', 'utmMedium'),
    ...utmField(params, 'utm_campaign', 'utmCampaign'),
    ...utmField(params, 'utm_content', 'utmContent'),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Storage is an attribution enhancement, never a blocker for signup.
  }
  return attribution;
}

export function readWaitlistAttribution(): WaitlistAttribution | null {
  return readStoredAttribution() ?? captureWaitlistFirstTouch();
}

function readStoredAttribution(): WaitlistAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WaitlistAttribution>;
    if (typeof parsed.landingPath !== 'string' || !parsed.landingPath) {
      return null;
    }
    return {
      landingPath: parsed.landingPath,
      ...(text(parsed.referrer) ? { referrer: text(parsed.referrer) } : {}),
      ...(text(parsed.utmSource) ? { utmSource: text(parsed.utmSource) } : {}),
      ...(text(parsed.utmMedium) ? { utmMedium: text(parsed.utmMedium) } : {}),
      ...(text(parsed.utmCampaign)
        ? { utmCampaign: text(parsed.utmCampaign) }
        : {}),
      ...(text(parsed.utmContent) ? { utmContent: text(parsed.utmContent) } : {}),
    };
  } catch {
    return null;
  }
}

function utmField(
  params: URLSearchParams,
  queryKey: string,
  property: 'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmContent',
): Partial<WaitlistAttribution> {
  const value = params.get(queryKey)?.trim();
  return value ? { [property]: value } : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
