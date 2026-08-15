import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Article,
  EpisodeLocalizationRow,
  EpisodeRow,
} from '../../types.js';

const mocks = vi.hoisted(() => ({
  findEpisodeBySourceUrl: vi.fn(),
  findEpisodeLocalizationByEpisodeId: vi.fn(),
  generateScriptWithLLM: vi.fn(),
  insertEpisode: vi.fn(),
  insertEpisodeLocalization: vi.fn(),
  convertArticleToZhTW: vi.fn(),
  scrapeArticle: vi.fn(),
  step: vi.fn(),
  updateEpisodeLocalizationArticleContent: vi.fn(),
  updateEpisodeLocalizationStatus: vi.fn(),
}));

vi.mock('../opencc.js', () => ({
  convertArticleToZhTW: mocks.convertArticleToZhTW,
}));

vi.mock('../db.js', () => ({
  findEpisodeBySourceUrl: mocks.findEpisodeBySourceUrl,
  findEpisodeLocalizationByEpisodeId: mocks.findEpisodeLocalizationByEpisodeId,
  insertEpisode: mocks.insertEpisode,
  insertEpisodeLocalization: mocks.insertEpisodeLocalization,
  updateEpisodeLocalizationArticleContent:
    mocks.updateEpisodeLocalizationArticleContent,
  updateEpisodeLocalizationStatus: mocks.updateEpisodeLocalizationStatus,
}));

vi.mock('../scrape.js', () => ({
  scrapeArticle: mocks.scrapeArticle,
}));

vi.mock('../llm.js', () => ({
  generateScriptWithLLM: mocks.generateScriptWithLLM,
}));

vi.mock('./step.js', () => ({
  logIngestSkip: vi.fn(),
  step: mocks.step,
}));

import {
  ensureEpisodeLocalizationScript,
  normalizeArticleForLanguage,
} from './script-stage.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.step.mockImplementation((_name: string, work: () => unknown) => work());
  mocks.convertArticleToZhTW.mockImplementation((article: Article) => article);
});

describe('normalizeArticleForLanguage', () => {
  it('returns the article unchanged for a non-default language code', () => {
    const article: Article = { title: 'Test', text: 'Body' };
    expect(normalizeArticleForLanguage(article, 'en')).toBe(article);
  });

  it('normalizes the canonical article to zh-TW', () => {
    const article: Article = { title: '软件更新', text: '鼠标市场' };
    const converted: Article = { title: '軟體更新', text: '滑鼠市場' };
    mocks.convertArticleToZhTW.mockReturnValue(converted);

    expect(normalizeArticleForLanguage(article, 'zh-Hant')).toBe(converted);
    expect(mocks.convertArticleToZhTW).toHaveBeenCalledWith(article);
  });
});

describe('ensureEpisodeLocalizationScript editorial title persistence', () => {
  it('persists a valid editorial title with the generated script atomically', async () => {
    const existing = localizationRow({ status: 'scraped', script: '' });
    const editorialTitle = '市場流動性正在重新定價';
    mocks.generateScriptWithLLM.mockResolvedValue(
      generatedScript({ title: editorialTitle }),
    );
    mocks.updateEpisodeLocalizationStatus.mockResolvedValue(
      localizationRow({
        title: editorialTitle,
        script: 'Generated script',
        status: 'script_generated',
      }),
    );

    const result = await ensureEpisodeLocalizationScript(
      'https://example.com/article',
      'zh-Hant',
      [],
      { episode: episodeRow(), localization: existing },
    );

    expect(mocks.updateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      existing.id,
      'script_generated',
      {
        title: editorialTitle,
        script: 'Generated script',
        llmModel: 'test/model',
        llmThinkingModel: null,
        llmProvider: 'test-provider',
      },
    );
    expect(result.localization.title).toBe(editorialTitle);
  });

  it('omits a fallback title so the scraped title remains unchanged', async () => {
    const existing = localizationRow({
      title: '保留現有 canonical 標題',
      status: 'scraped',
      script: '',
    });
    mocks.generateScriptWithLLM.mockResolvedValue(
      generatedScript({ title: null }),
    );
    mocks.updateEpisodeLocalizationStatus.mockResolvedValue(
      localizationRow({
        title: existing.title,
        script: 'Generated script',
        status: 'script_generated',
      }),
    );

    const result = await ensureEpisodeLocalizationScript(
      'https://example.com/article',
      'zh-Hant',
      [],
      { episode: episodeRow(), localization: existing },
    );

    const updates = mocks.updateEpisodeLocalizationStatus.mock.calls[0]?.[2];
    expect(updates).toEqual({
      script: 'Generated script',
      llmModel: 'test/model',
      llmThinkingModel: null,
      llmProvider: 'test-provider',
    });
    expect(updates).not.toHaveProperty('title');
    expect(result.localization.title).toBe(existing.title);
  });

  it('resumes after script generation without clearing the editorial title', async () => {
    const existing = localizationRow({
      title: '已持久化的編輯標題',
      status: 'script_generated',
      script: 'Existing script',
    });

    const result = await ensureEpisodeLocalizationScript(
      'https://example.com/article',
      'zh-Hant',
      [],
      { episode: episodeRow(), localization: existing },
    );

    expect(mocks.generateScriptWithLLM).not.toHaveBeenCalled();
    expect(mocks.updateEpisodeLocalizationStatus).not.toHaveBeenCalled();
    expect(result.localization).toBe(existing);
  });

  it('regenerates an editorial title in the same run after a pending re-scrape', async () => {
    const existing = localizationRow({
      title: '舊的編輯標題',
      raw_text: '舊文章',
      status: 'pending',
      script: 'Old script',
    });
    const scrapedArticle: Article = {
      title: '重新抓取的來源標題',
      text: '重新抓取的文章',
    };
    const editorialTitle = '重新抓取後的編輯觀點';
    mocks.scrapeArticle.mockResolvedValue(scrapedArticle);
    mocks.generateScriptWithLLM.mockResolvedValue(
      generatedScript({ title: editorialTitle }),
    );
    mocks.updateEpisodeLocalizationStatus
      .mockResolvedValueOnce(
        localizationRow({
          title: scrapedArticle.title,
          raw_text: scrapedArticle.text,
          status: 'scraped',
          script: '',
        }),
      )
      .mockResolvedValueOnce(
        localizationRow({
          title: editorialTitle,
          raw_text: scrapedArticle.text,
          status: 'script_generated',
          script: 'Generated script',
        }),
      );

    const result = await ensureEpisodeLocalizationScript(
      'https://example.com/article',
      'zh-Hant',
      [],
      { episode: episodeRow(), localization: existing },
    );

    expect(mocks.updateEpisodeLocalizationArticleContent).toHaveBeenCalledWith(
      existing.id,
      scrapedArticle,
    );
    expect(mocks.updateEpisodeLocalizationStatus).toHaveBeenNthCalledWith(
      2,
      existing.id,
      'script_generated',
      expect.objectContaining({ title: editorialTitle }),
    );
    expect(
      mocks.updateEpisodeLocalizationArticleContent.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.generateScriptWithLLM.mock.invocationCallOrder[0]!);
    expect(result.localization.title).toBe(editorialTitle);
  });
});

function generatedScript(overrides: { title: string | null }) {
  return {
    title: overrides.title,
    script: 'Generated script',
    model: 'test/model',
    thinkingModel: null,
    provider: 'test-provider',
    costUsd: 0.01,
  };
}

function episodeRow(overrides: Partial<EpisodeRow> = {}): EpisodeRow {
  return {
    id: 'episode-id',
    source_url: 'https://example.com/article',
    source_title: '原始來源標題',
    created_at: '2026-08-15T00:00:00.000Z',
    listened: false,
    ...overrides,
  };
}

function localizationRow(
  overrides: Partial<EpisodeLocalizationRow> = {},
): EpisodeLocalizationRow {
  return {
    id: 'localization-id',
    episode_id: 'episode-id',
    language_code: 'zh-Hant',
    title: '抓取後標題',
    hls_url: '',
    classroom_hls_url: null,
    raw_text: '文章內容',
    script: '',
    llm_model: null,
    llm_thinking_model: null,
    llm_provider: null,
    tts_language_code: null,
    tts_voice_name: null,
    r2_prefix: null,
    classroom_r2_prefix: null,
    status: 'scraped',
    created_at: '2026-08-15T00:00:00.000Z',
    updated_at: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}
