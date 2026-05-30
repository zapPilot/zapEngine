import { randomUUID } from 'node:crypto';

import {
  type Article,
  DEFAULT_LANGUAGE_CODE,
  type EpisodeLocalizationRow,
  type EpisodeRow,
  type LanguageClassroomLanguageCode,
} from '../../types.js';
import { buildLlmCostLine, type UsageCostLine } from '../cost.js';
import {
  findEpisodeBySourceUrl,
  findEpisodeLocalizationByEpisodeId,
  insertEpisode,
  insertEpisodeLocalization,
  updateEpisodeLocalizationArticleContent,
  updateEpisodeLocalizationStatus,
} from '../db.js';
import { generateScriptWithLLM } from '../llm.js';
import { convertArticleToZhTW } from '../opencc.js';
import { scrapeArticle } from '../scrape.js';
import { step } from './step.js';

export interface EpisodeLocalizationState {
  episode: EpisodeRow | null;
  localization: EpisodeLocalizationRow | null;
}

interface ScrapedArticleState {
  article: Article;
  sourceTitle: string;
  needsScrape: boolean;
}

export async function findEpisodeAndLocalization(
  url: string,
  languageCode: LanguageClassroomLanguageCode,
): Promise<EpisodeLocalizationState> {
  const episode = await step('findEpisodeBySourceUrl', () =>
    findEpisodeBySourceUrl(url),
  );
  let localization: EpisodeLocalizationRow | null = null;
  if (episode) {
    const episodeId = episode.id;
    localization = await step('findEpisodeLocalizationByEpisodeId', () =>
      findEpisodeLocalizationByEpisodeId(episodeId, languageCode),
    );
  }

  return { episode, localization };
}

export async function ensureEpisodeLocalizationScript(
  url: string,
  languageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
  state?: EpisodeLocalizationState,
): Promise<{
  episode: EpisodeRow;
  localization: EpisodeLocalizationRow;
}> {
  let { episode, localization } =
    state ?? (await findEpisodeAndLocalization(url, languageCode));
  const scraped = await scrapeAndNormalize(url, languageCode, localization);

  if (scraped.needsScrape) {
    episode = await ensureEpisodeRow(url, scraped.sourceTitle, episode);
  }

  localization = await ensureLocalizationScript({
    article: scraped.article,
    costBreakdown,
    episode,
    languageCode,
    localization,
    needsScrape: scraped.needsScrape,
  });

  if (!episode || !localization) {
    throw new Error(
      'Failed to retrieve episode localization after script generation',
    );
  }

  return {
    episode,
    localization,
  };
}

export function needsGeneratedScript(
  localization: EpisodeLocalizationRow,
): boolean {
  return (
    localization.status === 'scraped' ||
    localization.status === 'pending' ||
    !localization.status ||
    !localization.script
  );
}

async function scrapeAndNormalize(
  url: string,
  languageCode: LanguageClassroomLanguageCode,
  localization: EpisodeLocalizationRow | null,
): Promise<ScrapedArticleState> {
  const needsScrape = !localization || localization.status === 'pending';
  if (!needsScrape) {
    return {
      article: {
        title: localization.title,
        text: localization.raw_text ?? '',
      },
      sourceTitle: localization.title,
      needsScrape,
    };
  }

  const scrapedArticle = await step('scrapeArticle', () => scrapeArticle(url));
  return {
    article: normalizeArticleForLanguage(scrapedArticle, languageCode),
    sourceTitle: scrapedArticle.title,
    needsScrape,
  };
}

async function ensureEpisodeRow(
  url: string,
  sourceTitle: string,
  episode: EpisodeRow | null,
): Promise<EpisodeRow> {
  if (episode) {
    return episode;
  }

  return step('insertEpisode', () =>
    insertEpisode({
      id: randomUUID(),
      sourceUrl: url,
      sourceTitle,
    }),
  );
}

async function ensureLocalizationScript(input: {
  article: Article;
  costBreakdown: UsageCostLine[];
  episode: EpisodeRow | null;
  languageCode: LanguageClassroomLanguageCode;
  localization: EpisodeLocalizationRow | null;
  needsScrape: boolean;
}): Promise<EpisodeLocalizationRow | null> {
  let { localization } = input;

  if (input.needsScrape) {
    /* v8 ignore next -- @preserve */
    if (!input.episode) {
      throw new Error('Failed to create episode localization after scrape');
    }

    localization = await persistScrapedLocalization(
      input.episode,
      input.languageCode,
      input.article,
      localization,
    );
  }

  if (!localization) {
    throw new Error(
      'Failed to create episode localization after scrape persistence',
    );
  }

  if (needsGeneratedScript(localization)) {
    const generated = await step('generateScript', () =>
      generateScriptWithLLM(input.article.title, input.article.text),
    );
    input.costBreakdown.push(
      buildLlmCostLine('LLM script', {
        provider: generated.provider,
        model: generated.model,
        costUsd: generated.costUsd,
      }),
    );
    localization = await step(
      'updateEpisodeLocalizationStatus:script_generated',
      () =>
        updateEpisodeLocalizationStatus(localization!.id, 'script_generated', {
          script: generated.script,
          llmModel: generated.model,
          llmThinkingModel: generated.thinkingModel,
          llmProvider: generated.provider,
        }),
    );
  }

  return localization;
}

async function persistScrapedLocalization(
  episode: EpisodeRow,
  languageCode: LanguageClassroomLanguageCode,
  article: Article,
  localization: EpisodeLocalizationRow | null,
): Promise<EpisodeLocalizationRow | null> {
  if (!localization) {
    return step('insertEpisodeLocalization', () =>
      insertEpisodeLocalization({
        id: randomUUID(),
        episodeId: episode.id,
        languageCode,
        title: article.title,
        hlsUrl: '',
        rawText: article.text,
        script: '',
        llmModel: '',
        llmThinkingModel: null,
        llmProvider: '',
        ttsLanguageCode: null,
        ttsVoiceName: null,
        r2Prefix: null,
        status: 'scraped',
      }),
    );
  }

  return step('updateEpisodeLocalizationStatus:scraped', async () => {
    await updateEpisodeLocalizationArticleContent(localization.id, article);
    return updateEpisodeLocalizationStatus(localization.id, 'scraped', {
      hlsUrl: '',
      script: '',
      r2Prefix: null,
      ttsLanguageCode: null,
      ttsVoiceName: null,
    });
  });
}

function normalizeArticleForLanguage(
  article: Article,
  languageCode: string,
): Article {
  // Secondary ingest currently normalizes through the canonical zh-Hant script path.
  /* v8 ignore next 3 -- @preserve: secondary ingest always uses the canonical zh-Hant path */
  if (languageCode !== DEFAULT_LANGUAGE_CODE) {
    return article;
  }

  return convertArticleToZhTW(article);
}
