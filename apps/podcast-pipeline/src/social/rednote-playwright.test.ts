import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted<{
  isPublisherReady: ReturnType<typeof vi.fn>;
  page: unknown;
}>(() => ({ isPublisherReady: vi.fn(), page: null }));

vi.mock('./rednote-browser.js', () => ({
  UPLOAD_INPUT_SELECTOR: 'input[type="file"]',
  isPublisherReady: mocks.isPublisherReady,
  withRednotePublishPage: async (run: (page: unknown) => Promise<unknown>) =>
    run(mocks.page),
}));

import { createPlaywrightRednotePublisher } from './rednote-playwright.js';

const PAYLOAD = {
  title: '利率真的轉向？',
  body: '第一段。\n\n第二段。',
  hashtags: ['宏觀經濟', '市場結構'],
  videoPath: '/fixtures/episode.mp4',
};

/**
 * Models the parts of the creator page this publisher depends on.
 *
 * The title input is modelled as two separate values on purpose: `dom` is what
 * `inputValue()` reads back, and `model` is what the SPA itself holds and
 * renders as a character counter. Production drifts between them -- a write
 * issued while the form is re-rendering sets `dom` and never reaches `model` --
 * and `titleAcceptsOnWrite` is which write finally lands.
 *
 * `existingTopics` are Simplified, because that is what the real search indexes.
 */
function fakePage(options: {
  existingTopics: string[];
  titleAcceptsOnWrite?: number;
  declarationOpens?: boolean;
}) {
  const state = {
    query: '',
    attached: [] as string[],
    declarationOpen: false,
    declared: false,
    titleDom: '',
    titleModel: '',
    titleWrites: 0,
  };
  const acceptsOn = options.titleAcceptsOnWrite ?? 1;

  const title = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn(async (value: string) => {
      state.titleDom = value;
      if (value === '') {
        state.titleModel = '';
        return;
      }
      state.titleWrites += 1;
      if (state.titleWrites >= acceptsOn) state.titleModel = value;
    }),
    inputValue: vi.fn(async () => state.titleDom),
    // Stands in for reading the counter beside the field.
    evaluate: vi.fn(async () =>
      state.titleModel ? `${Array.from(state.titleModel).length} / 20` : null,
    ),
    page: () => page,
  };

  const body = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
  };

  const row = {
    waitFor: vi.fn(async () => {
      if (options.existingTopics.includes(state.query)) return;
      throw new Error('no matching topic row');
    }),
    click: vi.fn(async () => {
      state.attached.push(state.query);
    }),
  };
  const rowChain = { filter: () => rowChain, first: () => row };

  const generic = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    setInputFiles: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    filter: () => generic,
  };

  // The declaration is a `d-select`: its options stay hidden until the
  // placeholder is clicked, and the chosen label then replaces the placeholder.
  const declarationPlaceholder = {
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    click: vi.fn(async () => {
      state.declarationOpen = options.declarationOpens ?? true;
    }),
  };
  const aiOption = {
    waitFor: vi.fn(async () => {
      if (!state.declarationOpen) throw new Error('option is hidden');
    }),
    click: vi.fn(async () => {
      state.declared = true;
    }),
  };
  const selectedDeclaration = {
    filter: () => selectedDeclaration,
    first: () => selectedDeclaration,
    waitFor: vi.fn(async () => {
      if (!state.declared) throw new Error('no declaration is selected');
    }),
  };

  const keyboard = {
    type: vi.fn(async (text: string) => {
      state.query = text.replace(/^#/, '');
    }),
    press: vi.fn().mockResolvedValue(undefined),
  };

  const page = {
    keyboard,
    url: () => 'https://creator.rednote.com/new/note-manager',
    waitForURL: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    // Only `editorTopics` evaluates on the page, and it reports the entities the
    // editor currently holds.
    evaluate: vi.fn(async () => [...state.attached]),
    locator: vi.fn((selector: string) => {
      if (selector.includes('标题') || selector.includes('標題')) {
        return { ...title, first: () => title };
      }
      if (selector.includes('contenteditable')) {
        return { ...body, first: () => body };
      }
      if (selector.includes('creator-editor-topic-container')) {
        return { ...rowChain, ...row };
      }
      if (selector.includes('添加内容类型声明')) {
        return {
          ...declarationPlaceholder,
          first: () => declarationPlaceholder,
        };
      }
      if (selector.includes('笔记含AI合成内容')) {
        return { ...aiOption, first: () => aiOption };
      }
      if (selector.includes('d-select-description')) {
        return selectedDeclaration;
      }
      return { ...generic, first: () => generic, locator: () => generic };
    }),
  };
  return { page, title, body, row, keyboard, aiOption, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPublisherReady.mockResolvedValue(true);
});

describe('createPlaywrightRednotePublisher', () => {
  it('attaches every hashtag as a real topic instead of literal text', async () => {
    const { page, body, keyboard, state } = fakePage({
      existingTopics: ['宏观经济', '市场结构'],
    });
    mocks.page = page;

    await expect(
      createPlaywrightRednotePublisher().publishRednote(PAYLOAD),
    ).resolves.toMatchObject({
      status: 'published',
      hashtags: ['宏觀經濟', '市場結構'],
    });

    // The description carries the body alone -- a hashtag typed in as text has
    // no topic page behind it and is what this replaced.
    expect(body.fill).toHaveBeenCalledWith(PAYLOAD.body);
    // Queried in Simplified: 宏觀經濟 and 宏观经济 are separate topics, and the
    // audience is on the Simplified one.
    expect(keyboard.type).toHaveBeenNthCalledWith(
      1,
      '#宏观经济',
      expect.anything(),
    );
    expect(keyboard.type).toHaveBeenNthCalledWith(
      2,
      '#市场结构',
      expect.anything(),
    );
    expect(state.attached).toEqual(['宏观经济', '市场结构']);
  });

  it('skips a hashtag with no topic and removes what it typed', async () => {
    const { page, row, keyboard } = fakePage({ existingTopics: ['宏观经济'] });
    mocks.page = page;

    await expect(
      createPlaywrightRednotePublisher().publishRednote(PAYLOAD),
    ).resolves.toMatchObject({ hashtags: ['宏觀經濟'] });

    expect(row.click).toHaveBeenCalledTimes(1);
    // Escape closes the panel but leaves the typed characters in the body, so
    // the publisher backspaces "#" plus every character of the query.
    expect(keyboard.press).toHaveBeenCalledWith('Escape');
    expect(
      keyboard.press.mock.calls.filter(([key]) => key === 'Backspace'),
    ).toHaveLength('市场结构'.length + 1);
  });

  it('fails the publish when no hashtag matched a topic', async () => {
    const { page } = fakePage({ existingTopics: [] });
    mocks.page = page;

    await expect(
      createPlaywrightRednotePublisher().publishRednote(PAYLOAD),
    ).rejects.toThrow(/attach_topics/);
  });

  it('declares the note as AI-synthesized', async () => {
    const { page, aiOption, state } = fakePage({
      existingTopics: ['宏观经济', '市场结构'],
    });
    mocks.page = page;

    await createPlaywrightRednotePublisher().publishRednote(PAYLOAD);

    expect(aiOption.click).toHaveBeenCalledTimes(1);
    expect(state.declared).toBe(true);
  });

  it('fails the publish when the AI declaration cannot be set', async () => {
    const { page } = fakePage({
      existingTopics: ['宏观经济', '市场结构'],
      declarationOpens: false,
    });
    mocks.page = page;

    await expect(
      createPlaywrightRednotePublisher().publishRednote(PAYLOAD),
    ).rejects.toThrow(/declare_ai_content/);
  });

  it('fills the native title after the topics', async () => {
    const { page, title, body, row, state } = fakePage({
      existingTopics: ['宏观经济', '市场结构'],
    });
    mocks.page = page;

    await createPlaywrightRednotePublisher().publishRednote(PAYLOAD);

    expect(state.titleModel).toBe(PAYLOAD.title);
    // Ordering is load-bearing: the SPA re-renders the form while the topic
    // panel is open and drops a title written earlier.
    expect(body.fill.mock.invocationCallOrder[0]).toBeLessThan(
      row.click.mock.invocationCallOrder[0] ?? 0,
    );
    expect(row.click.mock.invocationCallOrder.at(-1) ?? 0).toBeLessThan(
      title.fill.mock.invocationCallOrder[0] ?? 0,
    );
  });

  // The regression this whole check exists for: notes shipped with `title: ""`
  // for weeks while `inputValue()` read back exactly what had just been written.
  it('rewrites the title when the form took the value but not the model', async () => {
    const { page, title, state } = fakePage({
      existingTopics: ['宏观经济', '市场结构'],
      titleAcceptsOnWrite: 2,
    });
    mocks.page = page;

    await expect(
      createPlaywrightRednotePublisher().publishRednote(PAYLOAD),
    ).resolves.toMatchObject({ status: 'published' });

    expect(state.titleModel).toBe(PAYLOAD.title);
    expect(
      title.fill.mock.calls.filter(([value]) => value === PAYLOAD.title),
    ).toHaveLength(2);
  });

  it('fails the publish instead of shipping an untitled note', async () => {
    const { page } = fakePage({
      existingTopics: ['宏观经济', '市场结构'],
      titleAcceptsOnWrite: 99,
    });
    mocks.page = page;

    await expect(
      createPlaywrightRednotePublisher().publishRednote(PAYLOAD),
    ).rejects.toThrow(/fill_title/);
  });
});
