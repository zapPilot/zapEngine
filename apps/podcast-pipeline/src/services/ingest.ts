import { randomUUID } from 'node:crypto';

import {
  type Article,
  DEFAULT_LANGUAGE_CODE,
  type EpisodeLocalizationRow,
  type EpisodeResponse,
  LANGUAGE_CLASSROOM_LANGUAGE_CODES,
  type LanguageClassroomLanguageCode,
  type LanguageClassroomRow,
} from '../types.js';
import {
  findEpisodeBySourceUrl,
  findEpisodeLocalizationByEpisodeId,
  insertEpisode,
  insertEpisodeLocalization,
  listLanguageClassroomsByLocalizationId,
  toEpisodeResponseFromLocalization,
  updateEpisodeLocalizationArticleContent,
  updateEpisodeLocalizationStatus,
  upsertLanguageClassrooms,
} from './db.js';
import { generateHls } from './hls.js';
import {
  generateLanguageClassroomsWithLLM,
  generateScriptWithLLM,
} from './llm.js';
import { convertArticleToZhTW } from './opencc.js';
import { scrapeArticle } from './scrape.js';
import { uploadHlsToR2 } from './storage.js';
import { textToSpeech } from './tts.js';

export interface IngestResult {
  episode: EpisodeResponse;
  statusCode: 200 | 201;
}

export async function performIngest(
  url: string,
  languageCode: LanguageClassroomLanguageCode,
): Promise<IngestResult> {
  let episode = await step('findEpisodeBySourceUrl', () =>
    findEpisodeBySourceUrl(url),
  );
  let localization: EpisodeLocalizationRow | null = null;
  if (episode) {
    const episodeId = episode.id;
    localization = await step('findEpisodeLocalizationByEpisodeId', () =>
      findEpisodeLocalizationByEpisodeId(episodeId, languageCode),
    );
  }

  if (
    episode &&
    localization &&
    (localization.status === 'audio_generated' ||
      localization.status === 'completed')
  ) {
    const classrooms = await ensureLanguageClassrooms(
      localization,
      languageCode,
    );
    return {
      episode: toEpisodeResponseFromLocalization(
        episode,
        localization,
        classrooms,
      ),
      statusCode: 200,
    };
  }

  const needsScrape =
    !episode || !localization || localization.status === 'pending';
  let article: Article = localization
    ? {
        title: localization.title,
        text: localization.raw_text ?? '',
      }
    : {
        title: '',
        text: '',
      };

  if (needsScrape) {
    const scrapedArticle = await step('scrapeArticle', () =>
      scrapeArticle(url),
    );
    article = normalizeArticleForLanguage(scrapedArticle, languageCode);

    if (!episode) {
      episode = await step('insertEpisode', () =>
        insertEpisode({
          id: randomUUID(),
          sourceUrl: url,
          sourceTitle: scrapedArticle.title,
        }),
      );
    }

    localization = await (!localization
      ? step('insertEpisodeLocalization', () =>
          insertEpisodeLocalization({
            id: randomUUID(),
            episodeId: episode!.id,
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
        )
      : step('updateEpisodeLocalizationStatus:scraped', async () => {
          await updateEpisodeLocalizationArticleContent(
            localization!.id,
            article,
          );
          return updateEpisodeLocalizationStatus(localization!.id, 'scraped', {
            hlsUrl: '',
            script: '',
            r2Prefix: null,
            ttsLanguageCode: null,
            ttsVoiceName: null,
          });
        }));
  }

  if (!episode || !localization) {
    throw new Error('Failed to create episode localization');
  }

  if (
    localization.status === 'scraped' ||
    localization.status === 'pending' ||
    !localization.status
  ) {
    const generated = await step('generateScript', () =>
      generateScriptWithLLM(article.title, article.text),
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

  if (!localization) {
    throw new Error('Failed to retrieve episode localization');
  }

  if (
    localization.status !== 'audio_generated' &&
    localization.status !== 'completed'
  ) {
    const script = localization.script ?? '';
    const audio = await step('textToSpeech', () => textToSpeech(script));
    const { files } = await step('generateHls', () => generateHls(audio));
    const uploaded = await step('uploadHlsToR2', () =>
      uploadHlsToR2(files, episode.id, languageCode),
    );
    const ttsMetadata = getTtsMetadataForLanguage(languageCode);
    localization = await step('updateEpisodeLocalizationStatus:completed', () =>
      updateEpisodeLocalizationStatus(localization!.id, 'completed', {
        hlsUrl: uploaded.hlsUrl,
        r2Prefix: uploaded.r2Prefix,
        ttsLanguageCode: ttsMetadata.languageCode,
        ttsVoiceName: ttsMetadata.voiceName,
      }),
    );
  }

  const classrooms = await ensureLanguageClassrooms(
    localization!,
    languageCode,
  );
  return {
    episode: toEpisodeResponseFromLocalization(
      episode,
      localization!,
      classrooms,
    ),
    statusCode: 201,
  };
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const wrapped = new Error(`[step:${name}] ${err.message}`, { cause: err });
    const meta = (err as { $metadata?: unknown }).$metadata;
    if (meta !== undefined) {
      (wrapped as { $metadata?: unknown }).$metadata = meta;
    }
    throw wrapped;
  }
}

function normalizeArticleForLanguage(
  article: Article,
  languageCode: string,
): Article {
  if (languageCode !== DEFAULT_LANGUAGE_CODE) {
    return article;
  }

  return convertArticleToZhTW(article);
}

function getTtsMetadataForLanguage(languageCode: string): {
  languageCode: string;
  voiceName: string;
} {
  if (languageCode !== DEFAULT_LANGUAGE_CODE) {
    return {
      languageCode,
      voiceName: '',
    };
  }

  return {
    languageCode: process.env['GOOGLE_TTS_LANGUAGE_CODE'] || 'cmn-TW',
    voiceName: process.env['GOOGLE_TTS_VOICE_NAME'] || 'cmn-TW-Wavenet-A',
  };
}

async function ensureLanguageClassrooms(
  localization: EpisodeLocalizationRow,
  sourceLanguageCode: LanguageClassroomLanguageCode,
): Promise<LanguageClassroomRow[]> {
  let existing: LanguageClassroomRow[] = [];

  try {
    existing = await step('listLanguageClassroomsByLocalizationId', () =>
      listLanguageClassroomsByLocalizationId(localization.id),
    );

    const existingTargets = new Set(
      existing.map((row) => row.target_language_code),
    );
    const missingTargets = getClassroomTargetLanguageCodes(
      sourceLanguageCode,
    ).filter((targetLanguageCode) => !existingTargets.has(targetLanguageCode));

    if (missingTargets.length === 0) {
      return orderLanguageClassrooms(existing, sourceLanguageCode);
    }

    const generated = await step('generateLanguageClassrooms', () =>
      generateLanguageClassroomsWithLLM({
        title: localization.title,
        articleText: localization.raw_text ?? '',
        script: localization.script ?? '',
        sourceLanguageCode,
        targetLanguageCodes: missingTargets,
      }),
    );

    const persisted = await step('upsertLanguageClassrooms', () =>
      upsertLanguageClassrooms(
        generated.lessons.map((lesson) => ({
          id: randomUUID(),
          episodeLocalizationId: localization.id,
          sourceLanguageCode: lesson.sourceLanguageCode,
          targetLanguageCode: lesson.targetLanguageCode,
          oneLiner: lesson.oneLiner,
          keywords: lesson.keywords,
          llmModel: generated.model,
          llmThinkingModel: generated.thinkingModel,
          llmProvider: generated.provider,
        })),
      ),
    );

    const persistedTargets = new Set(
      persisted.map((row) => row.target_language_code),
    );
    const retainedExisting = existing.filter(
      (row) => !persistedTargets.has(row.target_language_code),
    );

    return orderLanguageClassrooms(
      [...retainedExisting, ...persisted],
      sourceLanguageCode,
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[/ingest] language classroom generation failed:', {
      episodeLocalizationId: localization.id,
      sourceLanguageCode,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    });
    return orderLanguageClassrooms(existing, sourceLanguageCode);
  }
}

function getClassroomTargetLanguageCodes(
  sourceLanguageCode: LanguageClassroomLanguageCode,
): LanguageClassroomLanguageCode[] {
  return LANGUAGE_CLASSROOM_LANGUAGE_CODES.filter(
    (languageCode) => languageCode !== sourceLanguageCode,
  );
}

function orderLanguageClassrooms(
  rows: LanguageClassroomRow[],
  sourceLanguageCode: LanguageClassroomLanguageCode,
): LanguageClassroomRow[] {
  const order = new Map(
    getClassroomTargetLanguageCodes(sourceLanguageCode).map(
      (languageCode, index) => [languageCode, index],
    ),
  );

  return [...rows].sort(
    (a, b) =>
      (order.get(a.target_language_code as LanguageClassroomLanguageCode) ??
        Number.MAX_SAFE_INTEGER) -
      (order.get(b.target_language_code as LanguageClassroomLanguageCode) ??
        Number.MAX_SAFE_INTEGER),
  );
}
