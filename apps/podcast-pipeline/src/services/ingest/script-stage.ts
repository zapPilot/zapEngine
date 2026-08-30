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
import { generateScriptWithLLM, type LlmAttemptRecord } from '../llm.js';
import { convertArticleToZhTW } from '../opencc.js';
import {
  packagePodcastScript,
  PODCAST_PACKAGING_VERSION,
} from '../podcast-packaging.js';
import { scrapeArticle } from '../scrape.js';
import { logIngestSkip, step } from './step.js';

export interface EpisodeLocalizationState {
  episode: EpisodeRow | null;
  localization: EpisodeLocalizationRow | null;
}

/**
 * Written to as the stage advances rather than returned.
 *
 * The two things the ledger most needs from a language -- which episode it
 * belonged to, and how long each LLM request ran -- are only knowable from
 * inside a run that may never return at all. `lines` is the same array the
 * stages already push cost onto, so a language that dies mid-flight still
 * leaves its partial spend behind.
 */
export interface IngestLanguageTelemetry {
  lines: UsageCostLine[];
  attempts: LlmAttemptRecord[];
  episodeId: string | null;
  localizationId: string | null;
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
  telemetry?: IngestLanguageTelemetry,
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

  // Recorded before script generation, which is the stage most likely to be
  // the one that fails: the run row would otherwise have no episode to point
  // at precisely when someone needs to find it.
  if (telemetry && episode) telemetry.episodeId = episode.id;

  localization = await ensureLocalizationScript({
    article: scraped.article,
    costBreakdown,
    episode,
    languageCode,
    localization,
    needsScrape: scraped.needsScrape,
    telemetry,
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
    logIngestSkip('scrape already completed');
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
  telemetry?: IngestLanguageTelemetry;
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

  if (input.telemetry) input.telemetry.localizationId = localization.id;

  const persistedBody = localization.script_body?.trim();
  const canRepackage =
    persistedBody &&
    localization.status !== 'pending' &&
    localization.status !== 'scraped' &&
    (!localization.script ||
      localization.packaging_version !== PODCAST_PACKAGING_VERSION);

  if (canRepackage) {
    const packagedScript = await step('packagePodcastScript', () =>
      Promise.resolve(packagePodcastScript(persistedBody)),
    );
    localization = await step(
      'updateEpisodeLocalizationStatus:script_generated',
      () =>
        updateEpisodeLocalizationStatus(localization!.id, 'script_generated', {
          script: packagedScript,
          scriptBody: persistedBody,
          packagingVersion: PODCAST_PACKAGING_VERSION,
        }),
    );
  } else if (needsGeneratedScript(localization)) {
    const attempts = input.telemetry?.attempts;
    const generated = await step('generateScript', () =>
      generateScriptWithLLM(input.article.title, input.article.text, {
        ...(attempts
          ? {
              onAttempt: (record) => {
                attempts.push(record);
              },
            }
          : {}),
      }),
    );
    input.costBreakdown.push(
      buildLlmCostLine('LLM script', {
        provider: generated.provider,
        model: generated.model,
        costUsd: generated.costUsd,
      }),
    );
    const packagedScript = await step('packagePodcastScript', () =>
      Promise.resolve(packagePodcastScript(generated.script)),
    );
    localization = await step(
      'updateEpisodeLocalizationStatus:script_generated',
      () =>
        updateEpisodeLocalizationStatus(localization!.id, 'script_generated', {
          ...(generated.title === null ? {} : { title: generated.title }),
          script: packagedScript,
          scriptBody: generated.script.trim(),
          packagingVersion: PODCAST_PACKAGING_VERSION,
          llmModel: generated.model,
          llmThinkingModel: generated.thinkingModel,
          llmProvider: generated.provider,
        }),
    );
  } else {
    logIngestSkip('script already generated');
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

  // A pending canonical localization is intentionally refreshed from source.
  // This same run regenerates and persists its editorial title before advancing.
  return step('updateEpisodeLocalizationStatus:scraped', async () => {
    await updateEpisodeLocalizationArticleContent(localization.id, article);
    return updateEpisodeLocalizationStatus(localization.id, 'scraped', {
      hlsUrl: '',
      script: '',
      scriptBody: null,
      packagingVersion: null,
      r2Prefix: null,
      ttsLanguageCode: null,
      ttsVoiceName: null,
    });
  });
}

export function normalizeArticleForLanguage(
  article: Article,
  languageCode: string,
): Article {
  if (languageCode !== DEFAULT_LANGUAGE_CODE) {
    return article;
  }

  return convertArticleToZhTW(article);
}
