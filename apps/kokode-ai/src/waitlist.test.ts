// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCALES } from './story/locales';
import { storyFor } from './story/localized';
import { createLanding } from './site/landing';
import { FORM, INTEREST } from './story/ja/form';

const SUPABASE_URL = 'https://example-ref.supabase.co';
const ENDPOINT = `${SUPABASE_URL}/functions/v1/genba-lead`;
const QUEUE_KEY = 'genba-ai-lead-queue-v2';

const MSG_SUCCESS = FORM.messages.success;
const MSG_INVALID_EMAIL = FORM.messages.invalidEmail;
const MSG_INVALID_INTEREST = FORM.messages.invalidInterest;
const MSG_RETRY = FORM.messages.retry;
const MSG_NOT_CONFIGURED = FORM.messages.notConfigured;
const REFERRAL = INTEREST[0].label;

type Waitlist = typeof import('./waitlist');

const fetchMock = vi.fn<typeof fetch>();
// initWaitlist() registers `online` listeners on the shared window; remove
// them between tests so stale module instances never flush.
const windowListeners: Array<[string, EventListenerOrEventListenerObject]> = [];

function lead(email: string): Record<string, string> {
  return {
    email,
    interest: REFERRAL,
    organization: '',
    name: '',
    source: 'kokode-website',
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_term: '',
    utm_content: '',
    referrer: '',
    landing_url: '',
    page_url: '',
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function readStoredQueue(): Array<Record<string, string>> {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as Array<
    Record<string, string>
  >;
}

function seedQueue(items: Array<Record<string, string>>): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

function mountForm(): void {
  document.body.innerHTML = `
    <select id="interest" form="waitlist-form" required>
      <option value="">-</option>
      ${INTEREST.map((option) => `<option>${option.label}</option>`).join('')}
    </select>
    <form id="waitlist-form">
      <input id="organization" />
      <input id="contact-name" />
      <input id="email" type="email" />
      <button type="submit" disabled>Submit</button>
    </form>
    <div id="form-message"></div>`;
  const interest = document.querySelector<HTMLSelectElement>('#interest');
  if (interest) interest.value = REFERRAL;
}

async function load(supabaseUrl = SUPABASE_URL): Promise<Waitlist> {
  vi.stubEnv('VITE_SUPABASE_URL', supabaseUrl);
  vi.resetModules();
  return import('./waitlist');
}

function message(): string {
  return document.querySelector('#form-message')?.textContent ?? '';
}

function submit(email: string): void {
  const input = document.querySelector<HTMLInputElement>('#email');
  const form = document.querySelector<HTMLFormElement>('#waitlist-form');
  if (!input || !form) throw new Error('form fixture missing');
  input.value = email;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  document.documentElement.lang = 'ja';
  localStorage.clear();
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation(
    (type: string, listener: EventListenerOrEventListenerObject, options?) => {
      windowListeners.push([type, listener]);
      add(type, listener, options);
    },
  );
  mountForm();
});

afterEach(() => {
  for (const [type, listener] of windowListeners.splice(0)) {
    window.removeEventListener(type, listener);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('form submission', () => {
  it('posts JSON without any Supabase key and shows success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true }));
    const { initWaitlist } = await load();
    initWaitlist();

    submit('user@example.com');

    await vi.waitFor(() => expect(message()).toBe(MSG_SUCCESS));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.has('apikey')).toBe(false);
    expect(headers.has('authorization')).toBe(false);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      email: 'user@example.com',
      interest: REFERRAL,
      source: 'kokode-website',
    });
    expect(readStoredQueue()).toEqual([]);
  });

  it('locks the submit button and ignores repeated submits while in flight', async () => {
    const response = deferred<Response>();
    fetchMock.mockReturnValue(response.promise);
    const { initWaitlist } = await load();
    initWaitlist();

    submit('user@example.com');
    const button = document.querySelector<HTMLButtonElement>(
      '#waitlist-form button[type="submit"]',
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(button?.disabled).toBe(true);
    expect(button?.classList.contains('is-loading')).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(button?.textContent).toBe(FORM.submitting);

    submit('user@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    response.resolve(jsonResponse(201, { ok: true }));
    await vi.waitFor(() => expect(message()).toBe(MSG_SUCCESS));

    expect(button?.disabled).toBe(false);
    expect(button?.classList.contains('is-loading')).toBe(false);
    expect(button?.hasAttribute('aria-busy')).toBe(false);
    expect(button?.textContent).toBe('Submit');
  });

  it('enables the submit button that ships disabled for no-JS visitors', async () => {
    const button = document.querySelector<HTMLButtonElement>(
      '#waitlist-form button[type="submit"]',
    );
    expect(button?.disabled).toBe(true);
    const { initWaitlist } = await load();
    initWaitlist();
    expect(button?.disabled).toBe(false);
  });

  it('asks for a task before posting when none is selected', async () => {
    const { initWaitlist } = await load();
    initWaitlist();
    const interest = document.querySelector<HTMLSelectElement>('#interest');
    if (interest) interest.value = '';

    submit('user@example.com');

    expect(message()).toBe(MSG_INVALID_INTEREST);
    expect(document.activeElement).toBe(interest);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readStoredQueue()).toEqual([]);
  });

  it.each([
    ['invalid_email', MSG_INVALID_EMAIL],
    ['invalid_interest', MSG_INVALID_INTEREST],
  ])('does not queue a lead rejected with %s', async (code, expected) => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: code }));
    const { initWaitlist } = await load();
    initWaitlist();

    submit('user@example.com');

    await vi.waitFor(() => expect(message()).toBe(expected));
    expect(readStoredQueue()).toEqual([]);
  });

  const retryable: Array<[string, () => Promise<Response>]> = [
    ['401', async () => jsonResponse(401, { msg: 'Invalid JWT' })],
    ['403', async () => jsonResponse(403, { error: 'origin_not_allowed' })],
    ['404', async () => jsonResponse(404, { error: 'not_found' })],
    ['405', async () => jsonResponse(405, { error: 'method_not_allowed' })],
    ['429', async () => jsonResponse(429, { error: 'rate_limited' })],
    ['500', async () => jsonResponse(500, { error: 'save_failed' })],
    ['503', async () => new Response('unavailable', { status: 503 })],
    [
      '400 unknown code',
      async () => jsonResponse(400, { error: 'invalid_json' }),
    ],
    [
      '400 non-JSON body',
      async () => new Response('<html>bad request</html>', { status: 400 }),
    ],
    [
      'network TypeError',
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ];

  it.each(retryable)('queues the lead for retry on %s', async (_, respond) => {
    fetchMock.mockImplementation(respond);
    const { initWaitlist } = await load();
    initWaitlist();

    submit('user@example.com');

    await vi.waitFor(() => expect(message()).toBe(MSG_RETRY));
    const queued = readStoredQueue();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ email: 'user@example.com' });
  });

  it('queues without fetching while the endpoint is not configured', async () => {
    const { initWaitlist } = await load('');
    initWaitlist();

    submit('user@example.com');

    await vi.waitFor(() => expect(message()).toBe(MSG_NOT_CONFIGURED));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readStoredQueue()).toHaveLength(1);
  });
});

describe('flushQueue', () => {
  it('empties the queue when every lead is delivered', async () => {
    seedQueue([lead('a@example.com'), lead('b@example.com')]);
    fetchMock.mockImplementation(async () => jsonResponse(201, { ok: true }));
    const { flushQueue } = await load();

    await flushQueue();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readStoredQueue()).toEqual([]);
  });

  it('stops at the first retryable failure and keeps the queue', async () => {
    const items = [lead('a@example.com'), lead('b@example.com')];
    seedQueue(items);
    fetchMock.mockImplementation(async () =>
      jsonResponse(503, { error: 'unavailable' }),
    );
    const { flushQueue } = await load();

    await flushQueue();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readStoredQueue()).toEqual(items);
  });

  it('drops invalid leads and removes delivered ones', async () => {
    seedQueue([lead('bad'), lead('ok@example.com')]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { error: 'invalid_email' }))
      .mockResolvedValueOnce(jsonResponse(201, { ok: true }));
    const { flushQueue } = await load();

    await flushQueue();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readStoredQueue()).toEqual([]);
  });

  it('does not fetch while offline', async () => {
    seedQueue([lead('a@example.com')]);
    vi.stubGlobal('navigator', { onLine: false });
    const { flushQueue } = await load();

    await flushQueue();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readStoredQueue()).toHaveLength(1);
  });

  it('posts each lead once when flushes overlap', async () => {
    seedQueue([lead('a@example.com'), lead('b@example.com')]);
    const gate = deferred<void>();
    fetchMock.mockImplementation(async () => {
      await gate.promise;
      return jsonResponse(201, { ok: true });
    });
    const { flushQueue } = await load();

    const first = flushQueue();
    const second = flushQueue();
    gate.resolve();
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readStoredQueue()).toEqual([]);
  });

  it('keeps leads queued while a flush is in flight', async () => {
    seedQueue([lead('a@example.com')]);
    const response = deferred<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    const { flushQueue } = await load();

    const flushing = flushQueue();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    seedQueue([...readStoredQueue(), lead('late@example.com')]);
    response.resolve(jsonResponse(201, { ok: true }));
    await flushing;

    expect(readStoredQueue()).toEqual([lead('late@example.com')]);
  });

  it('removes a lead left by a previous page only after a 201', async () => {
    seedQueue([lead('a@example.com')]);
    const response = deferred<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    // Fresh import = what a reload sees: module state gone, storage kept.
    const { flushQueue } = await load();

    const flushing = flushQueue();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(readStoredQueue()).toEqual([lead('a@example.com')]);
    response.resolve(jsonResponse(201, { ok: true }));
    await flushing;

    expect(readStoredQueue()).toEqual([]);
  });
});

describe.each(LOCALES)('%s localized submission', (locale) => {
  async function initialize() {
    document.documentElement.lang = locale;
    document.body.innerHTML = createLanding(
      storyFor(locale),
    ).renderPilotForm().html;
    const interest = document.querySelector<HTMLSelectElement>('#interest')!;
    interest.value = INTEREST.find((option) => option.id === 'partner')!.label;
    const { initWaitlist } = await load();
    initWaitlist();
    return interest;
  }
  it('posts Japanese labels and shows localized success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true }));
    await initialize();
    submit('partner@example.com');
    await vi.waitFor(() =>
      expect(message()).toBe(storyFor(locale).FORM.messages.success),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).interest,
    ).toBe(INTEREST.find((option) => option.id === 'partner')!.label);
  });
  it('shows localized validation and retry messages', async () => {
    const interest = await initialize();
    interest.value = '';
    submit('partner@example.com');
    expect(message()).toBe(storyFor(locale).FORM.messages.invalidInterest);
    interest.value = REFERRAL;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: 'invalid_email' }),
    );
    submit('partner@example.com');
    await vi.waitFor(() =>
      expect(message()).toBe(storyFor(locale).FORM.messages.invalidEmail),
    );
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>('button[type="submit"]')!
          .disabled,
      ).toBe(false),
    );
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    submit('partner@example.com');
    await vi.waitFor(() =>
      expect(message()).toBe(storyFor(locale).FORM.messages.retry),
    );
    expect(readStoredQueue()[0]?.interest).toBe(REFERRAL);
  });
});
