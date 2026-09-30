import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Article,
  EpisodeLocalizationRow,
  EpisodeRow,
} from '../../types.js';
import {
  PODCAST_INTRO,
  PODCAST_PACKAGING_VERSION,
  ZAP_PILOT_OUTRO,
} from '../podcast-packaging.js';

const PACKAGED_SCRIPT = `${PODCAST_INTRO}\n\nGenerated script\n\n${ZAP_PILOT_OUTRO}`;

const mocks = vi.hoisted(() => ({
  findEpisodeBySourceUrl: vi.fn(),
  findEpisodeLocalizationByEpisodeId: vi.fn(),
  generateScriptWithLLM: vi.fn(),
  insertEpisode: vi.fn(),
  insertEpisodeLocalization: vi.fn(),
  scrapeArticle: vi.fn(),
  step: vi.fn(),
  updateEpisodeLocalizationArticleContent: vi.fn(),
  updateEpisodeLocalizationStatus: vi.fn(),
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

import { ensureEpisodeLocalizationScript } from './script-stage.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.step.mockImplementation((_name: string, work: () => unknown) => work());
});

describe('ensureEpisodeLocalizationScript editorial title persistence', () => {
  it.each([
    [
      '硅基程序员意味着什么',
      '硅基程序员的影片显著改变了网络软件。',
      '硅基程序员意味着什么',
      '硅基程序员的影片显著改变了网络软件。',
    ],
    [
      '這個網路是什麼',
      '這個網路連接軟件與數據。',
      '这个网路是什么',
      '这个网路连接软件与数据。',
    ],
  ])(
    'normalizes generated title and body while preserving scraped input: %s',
    async (title, script, expectedTitle, expectedBody) => {
      const article: Article = {
        title: '原始硅基與網路標題',
        text: '原始硅基与网络内容，保留來源字形。',
      };
      const scraped = localizationRow({
        title: article.title,
        raw_text: article.text,
      });
      mocks.scrapeArticle.mockResolvedValue(article);
      mocks.insertEpisodeLocalization.mockResolvedValue(scraped);
      mocks.generateScriptWithLLM.mockResolvedValue({
        ...generatedScript({ title }),
        script,
      });
      mocks.updateEpisodeLocalizationStatus.mockResolvedValue(
        localizationRow({ status: 'script_generated' }),
      );

      await ensureEpisodeLocalizationScript(
        'https://example.com/article',
        'zh-Hant',
        [],
        { episode: episodeRow(), localization: null },
      );

      expect(mocks.insertEpisodeLocalization).toHaveBeenCalledWith(
        expect.objectContaining({
          title: article.title,
          rawText: article.text,
        }),
      );
      expect(mocks.generateScriptWithLLM).toHaveBeenCalledWith(
        article.title,
        article.text,
        expect.any(Object),
      );
      expect(mocks.updateEpisodeLocalizationStatus).toHaveBeenCalledWith(
        scraped.id,
        'script_generated',
        expect.objectContaining({
          title: expectedTitle,
          scriptBody: expectedBody,
          script: `${PODCAST_INTRO}\n\n${expectedBody}\n\n${ZAP_PILOT_OUTRO}`,
        }),
      );
    },
  );

  it('does not repackage or regenerate a completed Traditional v1 episode', async () => {
    const existing = localizationRow({
      status: 'completed',
      script: '歡迎收聽 Zap Podcast。\n\n舊講稿。\n\n舊片尾。',
      script_body: '舊講稿。',
      packaging_version: 'podcast-script.v1',
    });
    const result = await ensureEpisodeLocalizationScript(
      'https://example.com/article',
      'zh-Hant',
      [],
      { episode: episodeRow(), localization: existing },
    );
    expect(result.localization).toBe(existing);
    expect(mocks.generateScriptWithLLM).not.toHaveBeenCalled();
    expect(mocks.updateEpisodeLocalizationStatus).not.toHaveBeenCalled();
  });

  it('persists a valid editorial title with the generated script atomically', async () => {
    const existing = localizationRow({ status: 'scraped', script: '' });
    const editorialTitle = '市场流动性正在重新定价';
    mocks.generateScriptWithLLM.mockResolvedValue(
      generatedScript({ title: editorialTitle }),
    );
    mocks.updateEpisodeLocalizationStatus.mockResolvedValue(
      localizationRow({
        title: editorialTitle,
        script: PACKAGED_SCRIPT,
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
        script: PACKAGED_SCRIPT,
        scriptBody: 'Generated script',
        packagingVersion: PODCAST_PACKAGING_VERSION,
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
        script: PACKAGED_SCRIPT,
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
      script: PACKAGED_SCRIPT,
      scriptBody: 'Generated script',
      packagingVersion: PODCAST_PACKAGING_VERSION,
      llmModel: 'test/model',
      llmThinkingModel: null,
      llmProvider: 'test-provider',
    });
    expect(updates).not.toHaveProperty('title');
    expect(result.localization.title).toBe(existing.title);
  });

  it('runs application packaging inside the observable ingest step', async () => {
    const existing = localizationRow({ status: 'scraped', script: '' });
    const costBreakdown: unknown[] = [];
    mocks.generateScriptWithLLM.mockResolvedValue({
      ...generatedScript({ title: null }),
      script: `${PODCAST_INTRO}\n\n${ZAP_PILOT_OUTRO}`,
    });

    await expect(
      ensureEpisodeLocalizationScript(
        'https://example.com/article',
        'zh-Hant',
        costBreakdown as never[],
        { episode: episodeRow(), localization: existing },
      ),
    ).rejects.toThrow(
      'Podcast body is empty after removing generated packaging',
    );

    expect(mocks.step.mock.calls.map(([name]) => name)).toContain(
      'packagePodcastScript',
    );
    expect(costBreakdown).toHaveLength(1);
    expect(mocks.updateEpisodeLocalizationStatus).not.toHaveBeenCalled();
  });

  it('records per-attempt telemetry from script generation', async () => {
    const existing = localizationRow({ status: 'scraped', script: '' });
    const attempt = {
      operation: 'generateScript' as const,
      attempt: 1,
      model: 'test/model',
      provider: 'test-provider',
      status: 'completed' as const,
      startedAt: new Date('2026-09-29T00:00:00.000Z'),
      finishedAt: new Date('2026-09-29T00:00:00.010Z'),
      elapsedMs: 10,
      timeoutMs: 30_000,
      inputChars: 12,
      outputChars: 16,
      promptTokens: 4,
      completionTokens: 5,
      generationId: 'generation-1',
      routing: 'openrouter',
      errorCategory: null,
      errorMessage: null,
      costUsd: 0.01,
    };
    mocks.generateScriptWithLLM.mockImplementation(
      async (
        _title: string,
        _text: string,
        options?: { onAttempt?: (record: typeof attempt) => void },
      ) => {
        options?.onAttempt?.(attempt);
        return generatedScript({ title: null });
      },
    );
    mocks.updateEpisodeLocalizationStatus.mockResolvedValue(
      localizationRow({ status: 'script_generated', script: PACKAGED_SCRIPT }),
    );
    const telemetry = {
      lines: [],
      attempts: [],
      episodeId: null,
      localizationId: null,
    };

    await ensureEpisodeLocalizationScript(
      'https://example.com/article',
      'zh-Hant',
      [],
      { episode: episodeRow(), localization: existing },
      telemetry,
    );

    expect(telemetry.attempts).toEqual([attempt]);
    expect(telemetry.episodeId).toBe('episode-id');
    expect(telemetry.localizationId).toBe(existing.id);
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

  it('keeps an already-current packaged script even when its raw body is persisted', async () => {
    const existing = localizationRow({
      status: 'script_generated',
      script: PACKAGED_SCRIPT,
      script_body: 'Generated script',
      packaging_version: PODCAST_PACKAGING_VERSION,
    });

    const result = await ensureEpisodeLocalizationScript(
      'https://example.com/article',
      'zh-Hant',
      [],
      { episode: episodeRow(), localization: existing },
    );

    expect(result.localization).toBe(existing);
    expect(mocks.generateScriptWithLLM).not.toHaveBeenCalled();
    expect(mocks.updateEpisodeLocalizationStatus).not.toHaveBeenCalled();
  });

  it('repackages a persisted raw body without another LLM request', async () => {
    const existing = localizationRow({
      status: 'script_generated',
      script: '',
      script_body: '  Generated script  ',
      packaging_version: 'podcast-script.v0',
    });
    mocks.updateEpisodeLocalizationStatus.mockResolvedValue(
      localizationRow({
        status: 'script_generated',
        script: PACKAGED_SCRIPT,
        script_body: 'Generated script',
        packaging_version: PODCAST_PACKAGING_VERSION,
      }),
    );

    await ensureEpisodeLocalizationScript(
      'https://example.com/article',
      'zh-Hant',
      [],
      { episode: episodeRow(), localization: existing },
    );

    expect(mocks.generateScriptWithLLM).not.toHaveBeenCalled();
    expect(mocks.updateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      existing.id,
      'script_generated',
      {
        script: PACKAGED_SCRIPT,
        scriptBody: 'Generated script',
        packagingVersion: PODCAST_PACKAGING_VERSION,
      },
    );
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
    const editorialTitle = '重新抓取后的编辑观点';
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
          script: PACKAGED_SCRIPT,
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
    script_body: null,
    packaging_version: null,
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
