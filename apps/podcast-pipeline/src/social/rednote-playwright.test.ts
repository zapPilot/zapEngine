import { JSDOM } from 'jsdom';
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

import {
  countedTitleCharacters,
  createPlaywrightRednotePublisher,
  readTitleField,
} from './rednote-playwright.js';

// The title row as the live form renders it, verified 2026-08-27. The body's own
// `0 /1000` counter sits outside `.input` deliberately: the title's scope must
// not be able to pick it up.
const FORM_HTML = `
  <div class="edit-container">
    <div class="flex">
      <div class="input">
        <div class="d-input-wrapper d-inline-block c-input_inner">
          <div class="d-input"><input class="d-text" type="text"></div>
        </div>
        <div class="suffix"></div>
      </div>
    </div>
    <div class="bottom-wrapper"><div class="editor-length-wrapper">0 /1000</div></div>
  </div>`;

/**
 * Rednote's own counting model, defined here independently of the publisher's.
 *
 * A half-width character weighs half a full-width one: the live form counts
 * `AI代理不等於公鏈繁榮？` -- twelve code points -- as 11. Deriving this from
 * `Array.from(value).length` is what made the old fake agree with the publisher
 * by construction and hid a fatal `fill_title` for every title carrying Latin
 * text. The rounding for an odd number of half-width characters was not
 * measured; no test here depends on it.
 */
function rednoteCount(value: string): number {
  let weight = 0;
  for (const character of value) {
    weight += /[\u0020-\u007e]/u.test(character) ? 0.5 : 1;
  }
  return Math.floor(weight);
}

const PAYLOAD = {
  title: '利率真的轉向？',
  hashtags: ['宏觀經濟', '市場結構'],
  videoPath: '/fixtures/episode.mp4',
};

/**
 * Models the parts of the creator page this publisher depends on.
 *
 * The title input is modelled as two separate values on purpose: `dom` is the
 * input's own value, and `model` is what the SPA itself holds and renders as a
 * character counter. Production drifts between them -- a write issued while the
 * form is re-rendering sets `dom` and never reaches `model` -- and
 * `titleAcceptsOnWrite` is which write finally lands.
 *
 * Both live in a real DOM built from `FORM_HTML`, and `title.evaluate` runs the
 * publisher's own `readTitleField` against it, so the traversal under test is the
 * one that ships rather than a stand-in that cannot disagree with it.
 *
 * `existingTopics` are Simplified, because that is what the real search indexes.
 */
function fakePage(options: {
  existingTopics: string[];
  titleAcceptsOnWrite?: number;
  declarationOpens?: boolean;
  counter?: 'rendered' | 'absent' | 'stuck-at-zero';
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
  const counterMode = options.counter ?? 'rendered';

  const document = new JSDOM(FORM_HTML).window.document;
  const input = document.querySelector<HTMLInputElement>('input.d-text')!;
  const suffix = document.querySelector<HTMLElement>('.suffix')!;

  // The live form drops the whole `.count-tip` element while the model is empty,
  // rather than rendering it as "0 / 20".
  const renderCounter = () => {
    suffix.replaceChildren();
    if (!state.titleModel || counterMode === 'absent') return;
    const tip = document.createElement('div');
    tip.className = 'count-tip';
    const counted =
      counterMode === 'stuck-at-zero' ? 0 : rednoteCount(state.titleModel);
    tip.textContent = `${counted} / 20`;
    suffix.append(tip);
  };

  const title = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn(async (value: string) => {
      state.titleDom = value;
      input.value = value;
      if (value === '') {
        state.titleModel = '';
      } else {
        state.titleWrites += 1;
        if (state.titleWrites >= acceptsOn) state.titleModel = value;
      }
      renderCounter();
    }),
    // Runs the shipped traversal against the real DOM above.
    evaluate: vi.fn(
      async (
        run: typeof readTitleField,
        selectors: { container: string; counter: string },
      ) => run(input, selectors),
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

    // The note carries no prose body -- the editor only ever receives the
    // `#`-typed topic anchors `attachTopics` types into it.
    expect(body.fill).not.toHaveBeenCalled();
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
    expect(body.click.mock.invocationCallOrder[0]).toBeLessThan(
      row.click.mock.invocationCallOrder[0] ?? 0,
    );
    expect(row.click.mock.invocationCallOrder.at(-1) ?? 0).toBeLessThan(
      title.fill.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('reports an empty published body, since the note carries none', async () => {
    const { page } = fakePage({ existingTopics: ['宏观经济', '市场结构'] });
    mocks.page = page;

    await expect(
      createPlaywrightRednotePublisher().publishRednote(PAYLOAD),
    ).resolves.toMatchObject({ body: '' });
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

  // The regression that took the whole release cohort down on 2026-08-27:
  // Rednote counts `AI` as one character, so its counter read 11 for a
  // twelve-code-point title and an equality check could never be satisfied.
  it('publishes a title the platform counts differently from this side', async () => {
    const { page, state } = fakePage({
      existingTopics: ['宏观经济', '市场结构'],
    });
    mocks.page = page;
    const logs: string[] = [];
    const title = 'AI代理不等於公鏈繁榮？';

    await expect(
      createPlaywrightRednotePublisher({
        onLog: (message) => logs.push(message),
      }).publishRednote({ ...PAYLOAD, title }),
    ).resolves.toMatchObject({ status: 'published' });

    expect(state.titleModel).toBe(title);
    expect(Array.from(title)).toHaveLength(12);
    expect(rednoteCount(title)).toBe(11);
    // A disagreement is reported, never fatal: a real contract change has to
    // stay visible without blocking every episode behind this one.
    expect(logs).toContainEqual(
      expect.stringContaining('title_count_mismatch: platform counted 11'),
    );
  });

  // Both are the empty-model failure this check exists for, and both stay fatal.
  it.each([
    { counter: 'absent' as const, evidence: 'not found in' },
    { counter: 'stuck-at-zero' as const, evidence: '"0 / 20"' },
  ])('fails when the counter reads $counter', async ({ counter, evidence }) => {
    const { page } = fakePage({
      existingTopics: ['宏观经济', '市场结构'],
      counter,
    });
    mocks.page = page;

    const error = await createPlaywrightRednotePublisher()
      .publishRednote(PAYLOAD)
      .catch((thrown: Error) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('fill_title');
    // The evidence has to travel with the failure: diagnosing this once already
    // cost a live session against the creator form.
    expect((error as Error).message).toContain(evidence);
    expect((error as Error).message).toContain(PAYLOAD.title);
  });

  it('writes the title trimmed', async () => {
    const { page, title, state } = fakePage({
      existingTopics: ['宏观经济', '市场结构'],
    });
    mocks.page = page;

    await createPlaywrightRednotePublisher().publishRednote({
      ...PAYLOAD,
      title: `  ${PAYLOAD.title}  `,
    });

    // An untrimmed expectation is unsatisfiable if the SPA trims on commit.
    expect(state.titleModel).toBe(PAYLOAD.title);
    expect(title.fill).toHaveBeenCalledWith(PAYLOAD.title);
  });
});

describe('readTitleField', () => {
  const build = (html: string) => {
    const document = new JSDOM(html).window.document;
    return document.querySelector<HTMLInputElement>('input.d-text')!;
  };
  const selectors = { container: '.input', counter: '.count-tip' };

  it("reads the field's own counter, not the body's", () => {
    const input = build(FORM_HTML);
    input.value = '利率真的轉向？';
    input.closest('.input')!.querySelector<HTMLElement>('.suffix')!.innerHTML =
      '<div class="count-tip">7 / 20</div>';

    // `0 /1000` is the body's counter, outside `.input`; picking it up would
    // report a title the model never received.
    expect(readTitleField(input, selectors)).toEqual({
      value: '利率真的轉向？',
      text: '7 / 20',
    });
  });

  it('reports no counter when the field renders none', () => {
    expect(readTitleField(build(FORM_HTML), selectors)).toEqual({
      value: '',
      text: null,
    });
  });

  // Playwright serializes this function and runs it in the page, where module
  // scope does not exist. A free identifier -- an import, a module constant, a
  // call to a neighbouring helper -- passes every test here and throws
  // `ReferenceError` only in production.
  it('survives being serialized into a page', () => {
    const source = readTitleField.toString();
    expect(source).not.toContain('__name');

    /* eslint-disable no-new-func, @typescript-eslint/no-implied-eval, sonarjs/code-eval --
       Compiling the string is the check: it is how the page receives this
       function, and a free identifier only fails once it runs in a fresh scope.
       The input is this test's own `readTitleField.toString()`. */
    const rebuilt = new Function(
      `return (${source})`,
    )() as typeof readTitleField;
    /* eslint-enable no-new-func, @typescript-eslint/no-implied-eval, sonarjs/code-eval */
    const input = build(FORM_HTML);
    input.value = '利率真的轉向？';

    expect(rebuilt(input, selectors)).toEqual({
      value: '利率真的轉向？',
      text: null,
    });
  });
});

describe('countedTitleCharacters', () => {
  it.each([
    { text: '11 / 20', expected: 11 },
    { text: '0 / 20', expected: 0 },
    { text: '20/20', expected: 20 },
    { text: '11 ／ 20', expected: 11 },
    { text: null, expected: null },
    { text: '', expected: null },
    { text: '11 / 20 字', expected: null },
  ])('reads $text as $expected', ({ text, expected }) => {
    expect(countedTitleCharacters(text)).toBe(expected);
  });
});
