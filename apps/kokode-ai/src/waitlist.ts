import { getAttribution, trackEvent } from './analytics';
import { LEAD_ENDPOINT, LEAD_SOURCE } from './config';
import { DOM_IDS } from './dom-ids';
// The file, not the story barrel: only the form copy enters the page bundle.
import { formForPage } from '@zapengine/kokode-story/form-locales';

// Payload mirrors the `kokode_ai.leads` columns (snake_case). The Edge
// Function whitelists these keys; `page_url` is submit-time context kept
// for forward compatibility (currently not stored).
interface LeadPayload {
  email: string;
  interest: string;
  organization: string;
  name: string;
  source: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  referrer: string;
  landing_url: string;
  page_url: string;
}

// Keep the legacy storage key so leads queued by older KOKODE builds survive the rename.
const QUEUE_KEY = 'genba-ai-lead-queue-v2';
// Previous Basin/Formspree-era queue (different shape) -- migrated once.
const LEGACY_QUEUE_KEY = 'genba-ai-waitlist-queue';

function isConfigured(): boolean {
  return Boolean(LEAD_ENDPOINT);
}

type InvalidLeadCode = 'invalid_email' | 'invalid_interest';

const INVALID_LEAD_MESSAGES: Record<
  InvalidLeadCode,
  'invalidEmail' | 'invalidInterest'
> = {
  invalid_email: 'invalidEmail',
  invalid_interest: 'invalidInterest',
};

function isInvalidLeadCode(code: string): code is InvalidLeadCode {
  return Object.prototype.hasOwnProperty.call(INVALID_LEAD_MESSAGES, code);
}

/** The function validated the payload and rejected it: resending can't help. */
class InvalidLeadError extends Error {
  readonly code: InvalidLeadCode;

  constructor(code: InvalidLeadCode) {
    super(code);
    this.code = code;
  }
}

function readQueue(key: string): LeadPayload[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LeadPayload[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: LeadPayload[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage unavailable: retry is best-effort.
  }
}

function queueLead(payload: LeadPayload): void {
  writeQueue([...readQueue(QUEUE_KEY), payload]);
}

/**
 * Remove one entry identical to `payload` from the *current* storage, so
 * leads queued while a flush was awaiting the network are kept.
 */
function dequeueLead(payload: LeadPayload): void {
  const target = JSON.stringify(payload);
  const queue = readQueue(QUEUE_KEY);
  const index = queue.findIndex((item) => JSON.stringify(item) === target);
  if (index === -1) return;
  queue.splice(index, 1);
  writeQueue(queue);
}

/** One-time migration of the old queue shape into the Supabase payload. */
function migrateLegacyQueue(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_QUEUE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    localStorage.removeItem(LEGACY_QUEUE_KEY);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    const migrated: LeadPayload[] = [];
    for (const item of parsed as Array<Record<string, unknown>>) {
      if (typeof item !== 'object' || item === null) continue;
      const attr = (item['attribution'] ?? {}) as Record<string, unknown>;
      const s = (v: unknown): string => (typeof v === 'string' ? v : '');
      const email = s(item['email']).trim();
      const interest = s(item['interest']).trim();
      if (!email || !interest) continue;
      migrated.push({
        email,
        interest,
        organization: s(item['organization']),
        name: s(item['name']),
        source: s(item['source']) || LEAD_SOURCE,
        utm_source: s(attr['utmSource']),
        utm_medium: s(attr['utmMedium']),
        utm_campaign: s(attr['utmCampaign']),
        utm_term: s(attr['utmTerm']),
        utm_content: s(attr['utmContent']),
        referrer: s(attr['referrer']),
        landing_url: s(attr['landingUrl']),
        page_url: s(item['pageUrl']),
      });
    }
    if (migrated.length > 0) {
      writeQueue([...readQueue(QUEUE_KEY), ...migrated]);
    }
  } catch {
    // Corrupt legacy queue: already removed, nothing to migrate.
  }
}

async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as unknown;
    if (typeof body === 'object' && body !== null) {
      const code = (body as Record<string, unknown>)['error'];
      if (typeof code === 'string') return code;
    }
  } catch {
    // Non-JSON body (gateway / proxy error page): no code.
  }
  return '';
}

async function postLead(payload: LeadPayload): Promise<void> {
  const response = await fetch(LEAD_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (response.ok) return;

  // Only the function's own validation verdict is final. Any other status
  // (auth, CORS, missing deploy, rate limit, 5xx, unknown codes) can be a
  // transient or config problem, so the lead must stay queued.
  const code = await errorCode(response);
  if (response.status === 400 && isInvalidLeadCode(code)) {
    throw new InvalidLeadError(code);
  }
  throw new Error(`request failed: ${response.status} ${code}`.trim());
}

async function drainQueue(): Promise<void> {
  if (!isConfigured()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  for (const payload of readQueue(QUEUE_KEY)) {
    try {
      await postLead(payload);
    } catch (error) {
      // Retryable: keep this and every later lead for the next flush.
      if (!(error instanceof InvalidLeadError)) return;
      dequeueLead(payload);
      continue;
    }
    dequeueLead(payload);
    trackEvent('lead_retried', { interest: payload.interest });
  }
}

let inFlight: Promise<void> | null = null;

/**
 * Re-send leads that were queued while offline or when the POST failed.
 * A lead leaves the queue only once the function stored it (2xx) or
 * rejected it as invalid. Concurrent callers (page load, `online`, after a
 * submit) share one flush so no lead is posted twice.
 */
export function flushQueue(): Promise<void> {
  inFlight ??= drainQueue().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function initWaitlist(): void {
  const FORM = formForPage(document.documentElement.lang);
  const form = document.querySelector<HTMLFormElement>(`#${DOM_IDS.form}`);
  const message = document.querySelector<HTMLElement>(`#${DOM_IDS.message}`);
  const interest = document.querySelector<HTMLSelectElement>(
    `#${DOM_IDS.interest}`,
  );
  const emailInput = document.querySelector<HTMLInputElement>(
    `#${DOM_IDS.email}`,
  );
  if (!form || !message || !interest || !emailInput) return;
  const submitButton = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  const orgInput = document.querySelector<HTMLInputElement>(
    `#${DOM_IDS.organization}`,
  );
  const nameInput = document.querySelector<HTMLInputElement>(
    `#${DOM_IDS.name}`,
  );
  const idleSubmitLabel = submitButton?.textContent ?? FORM.submit;
  let submitting = false;

  const setSubmitting = (active: boolean): void => {
    submitting = active;
    if (!submitButton) return;
    submitButton.disabled = active;
    submitButton.classList.toggle('is-loading', active);
    if (active) {
      submitButton.setAttribute('aria-busy', 'true');
      submitButton.textContent = FORM.submitting;
    } else {
      submitButton.removeAttribute('aria-busy');
      submitButton.textContent = idleSubmitLabel;
    }
  };

  // The button ships disabled so the form cannot submit (as a GET carrying
  // the email in the URL) before this handler exists.
  if (submitButton) submitButton.disabled = false;

  // Best-effort: migrate the old queue, then re-send previous visits.
  migrateLegacyQueue();
  void flushQueue();
  window.addEventListener('online', () => {
    void flushQueue();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (submitting) return;

    const email = emailInput.value.trim();
    if (!email) return;
    if (!interest.value) {
      message.textContent = FORM.messages.invalidInterest;
      interest.focus();
      return;
    }

    const attribution = getAttribution();
    const payload: LeadPayload = {
      email,
      interest: interest.value,
      organization: orgInput?.value.trim() ?? '',
      name: nameInput?.value.trim() ?? '',
      source: LEAD_SOURCE,
      utm_source: attribution.utmSource,
      utm_medium: attribution.utmMedium,
      utm_campaign: attribution.utmCampaign,
      utm_term: attribution.utmTerm,
      utm_content: attribution.utmContent,
      referrer: attribution.referrer,
      landing_url: attribution.landingUrl,
      page_url: window.location.href,
    };

    if (!isConfigured()) {
      queueLead(payload);
      message.textContent = FORM.messages.notConfigured;
      return;
    }

    setSubmitting(true);
    void (async () => {
      try {
        await postLead(payload);
        form.reset();
        message.textContent = FORM.messages.success;
        trackEvent('lead_submitted', { interest: payload.interest });
        // A previous queue may exist; try to drain it now that we are online.
        void flushQueue();
      } catch (error) {
        if (error instanceof InvalidLeadError) {
          message.textContent =
            FORM.messages[INVALID_LEAD_MESSAGES[error.code]];
          return;
        }
        queueLead(payload);
        message.textContent = FORM.messages.retry;
        trackEvent('lead_failed', { interest: payload.interest });
      } finally {
        setSubmitting(false);
      }
    })();
  });
}
