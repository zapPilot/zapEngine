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
  buildRednoteDescription,
  createPlaywrightRednotePublisher,
} from './rednote-playwright.js';

const PAYLOAD = {
  title: '利率真的轉向？',
  body: '這集拆解了三個訊號。',
  hashtags: ['宏觀經濟', '市場結構'],
  videoPath: '/fixtures/episode.mp4',
};

function fakePage(titleValues: string[]) {
  const title = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    pressSequentially: vi.fn().mockResolvedValue(undefined),
    inputValue: vi.fn(),
  };
  for (const value of titleValues)
    title.inputValue.mockResolvedValueOnce(value);

  const body = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
  };
  const generic = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    setInputFiles: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
  };

  const page = {
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    url: () => 'https://creator.rednote.com/new/note-manager',
    waitForURL: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn((selector: string) => {
      if (selector.includes('标题') || selector.includes('標題')) {
        return { ...title, first: () => title };
      }
      if (selector.includes('contenteditable')) {
        return { ...body, first: () => body };
      }
      return {
        ...generic,
        first: () => generic,
        locator: () => generic,
      };
    }),
  };
  return { page, title, body, generic };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPublisherReady.mockResolvedValue(true);
});

describe('buildRednoteDescription', () => {
  it('puts the full Rednote copy and hashtags in the description field', () => {
    expect(
      buildRednoteDescription('支付市場正在變化\n\n六成資金移動發生在境內。', [
        '支付產業',
        '#金融科技',
        '市場結構',
      ]),
    ).toBe(
      '支付市場正在變化\n\n六成資金移動發生在境內。\n\n#支付產業 #金融科技 #市場結構',
    );
  });
});

describe('createPlaywrightRednotePublisher', () => {
  it('fills the native title after the body and confirms it was kept', async () => {
    const { page, title, body } = fakePage([PAYLOAD.title]);
    mocks.page = page;

    await expect(
      createPlaywrightRednotePublisher().publishRednote(PAYLOAD),
    ).resolves.toMatchObject({ status: 'published' });

    // The description no longer carries the hook title; the title field does.
    expect(body.fill).toHaveBeenCalledWith(
      buildRednoteDescription(PAYLOAD.body, PAYLOAD.hashtags),
    );
    expect(title.fill).toHaveBeenCalledWith(PAYLOAD.title);
    expect(title.pressSequentially).not.toHaveBeenCalled();
    // Filled after the body and after the topic panel was dismissed, because
    // the SPA re-renders the form and drops a title written earlier.
    expect(body.fill.mock.invocationCallOrder[0]).toBeLessThan(
      title.fill.mock.invocationCallOrder[0] ?? 0,
    );
    expect(page.keyboard.press.mock.invocationCallOrder[0]).toBeLessThan(
      title.fill.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('retypes the title key by key when the SPA discarded the first write', async () => {
    const { page, title } = fakePage(['', PAYLOAD.title]);
    mocks.page = page;

    await expect(
      createPlaywrightRednotePublisher().publishRednote(PAYLOAD),
    ).resolves.toMatchObject({ status: 'published' });
    expect(title.pressSequentially).toHaveBeenCalledWith(PAYLOAD.title);
  });

  it('fails the publish instead of shipping an untitled note', async () => {
    const { page } = fakePage(['', '']);
    mocks.page = page;

    await expect(
      createPlaywrightRednotePublisher().publishRednote(PAYLOAD),
    ).rejects.toThrow(/verify_title/);
  });
});
