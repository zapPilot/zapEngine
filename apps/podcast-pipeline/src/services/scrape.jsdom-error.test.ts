import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { jsdomState } = vi.hoisted(() => ({
  jsdomState: {
    errors: [] as unknown[],
    handler: null as ((error: unknown) => void) | null,
  },
}));

vi.mock('jsdom', () => {
  class MockVirtualConsole {
    on(event: string, handler: (error: unknown) => void): this {
      if (event === 'jsdomError') {
        jsdomState.handler = handler;
      }
      return this;
    }
  }

  class MockJSDOM {
    window = {
      document: { title: 'Fallback document title' },
      close: vi.fn(),
    };

    constructor() {
      for (const error of jsdomState.errors) {
        jsdomState.handler?.(error);
      }
    }
  }

  return {
    JSDOM: MockJSDOM,
    VirtualConsole: MockVirtualConsole,
  };
});

vi.mock('@mozilla/readability', () => ({
  Readability: vi.fn().mockImplementation(function MockReadability() {
    return {
      parse: vi.fn(() => ({
        title: 'Readable title',
        textContent: 'Readable article text',
      })),
    };
  }),
}));

const { scrapeArticle } = await import('./scrape.js');

describe('scrapeArticle jsdomError logging', () => {
  beforeEach(() => {
    jsdomState.errors = [];
    jsdomState.handler = null;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>Readable</body></html>', {
          status: 200,
          statusText: 'OK',
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('logs non-CSS jsdomError stack and detail', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    jsdomState.errors = [
      Object.assign(new Error('MSG'), {
        stack: 'STK',
        detail: { url: 'https://example.com/style.css' },
        type: 'resource loading',
      }),
    ];

    await scrapeArticle('https://example.com/article');

    expect(consoleError).toHaveBeenCalledWith('STK', {
      url: 'https://example.com/style.css',
    });
  });

  it('falls back to the jsdomError message when stack is absent', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    jsdomState.errors = [
      {
        message: 'MSG',
        detail: { phase: 'parse' },
        type: 'resource loading',
      },
    ];

    await scrapeArticle('https://example.com/article');

    expect(consoleError).toHaveBeenCalledWith('MSG', { phase: 'parse' });
  });

  it('suppresses noisy CSS parsing jsdomErrors', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    jsdomState.errors = [
      {
        message: 'CSS parse failed',
        detail: { selector: ':root' },
        type: 'css parsing',
      },
    ];

    await scrapeArticle('https://example.com/article');

    expect(consoleError).not.toHaveBeenCalled();
  });
});
