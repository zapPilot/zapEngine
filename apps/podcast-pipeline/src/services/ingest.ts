import { randomUUID } from 'node:crypto';

import {
  type Article,
  DEFAULT_LANGUAGE_CODE,
  type EpisodeLocalizationRow,
  type EpisodeResponse,
  type EpisodeRow,
  LANGUAGE_CLASSROOM_LANGUAGE_CODES,
  type LanguageClassroomLanguageCode,
  type LanguageClassroomRow,
} from '../types.js';
import {
  buildUsageCostDetails,
  type UsageCostDetails,
  type UsageCostLine,
} from './cost.js';
import {
  findEpisodeBySourceUrl,
  findEpisodeLocalizationByEpisodeId,
  insertEpisode,
  insertEpisodeLocalization,
  listLanguageClassroomsByLocalizationId,
  toEpisodeResponseFromLocalization,
  toLanguageClassroomLesson,
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
import { synthesizeClassroomAudio } from './podcast/classroom-audio.js';
import { scrapeArticle } from './scrape.js';
import { uploadHlsToR2 } from './storage.js';
import { getTtsMetadata, textToSpeech } from './tts.js';
import { concatMp3Buffers } from './tts/audio-concat.js';

export interface IngestResult {
  episode: EpisodeResponse;
  statusCode: 200 | 201;
  costUsd: number;
  costDetails: UsageCostDetails;
}

export async function performIngest(
  url: string,
  languageCode: LanguageClassroomLanguageCode,
): Promise<IngestResult> {
  const costBreakdown: UsageCostLine[] = [];
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
    const { rows: classrooms, cost } = await ensureLanguageClassrooms(
      localization,
      languageCode,
    );
    costBreakdown.push(...cost);
    return buildIngestResult(
      episode,
      localization,
      classrooms,
      200,
      costBreakdown,
    );
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
    costBreakdown.push(
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

  if (!localization) {
    throw new Error('Failed to retrieve episode localization');
  }

  let classroomRows: LanguageClassroomRow[] | null = null;

  if (
    localization.status !== 'audio_generated' &&
    localization.status !== 'completed'
  ) {
    const ensuredClassrooms = await ensureLanguageClassrooms(
      localization,
      languageCode,
    );
    classroomRows = ensuredClassrooms.rows;
    costBreakdown.push(...ensuredClassrooms.cost);

    const script = localization.script ?? '';
    const mainAudio = await step('textToSpeech', () =>
      textToSpeech(script, {
        languageCode,
        costLabel: 'TTS main audio',
      }),
    );
    costBreakdown.push(...mainAudio.cost);
    const classroomAudios = await synthesizeClassroomAudios(
      episode.id,
      classroomRows,
    );
    costBreakdown.push(...classroomAudios.cost);
    const publishAudio = await combineMainAndClassroomAudio(
      mainAudio.audio,
      classroomAudios.audioBuffers,
      {
        episodeId: episode.id,
        localizationId: localization.id,
        languageCode,
      },
    );
    const { files } = await step('generateHls', () =>
      generateHls(publishAudio),
    );
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

  if (!classroomRows) {
    const ensuredClassrooms = await ensureLanguageClassrooms(
      localization!,
      languageCode,
    );
    classroomRows = ensuredClassrooms.rows;
    costBreakdown.push(...ensuredClassrooms.cost);
  }

  return buildIngestResult(
    episode,
    localization!,
    classroomRows,
    201,
    costBreakdown,
  );
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  console.log(`[/ingest] step: ${name}`);
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

function getTtsMetadataForLanguage(
  languageCode: LanguageClassroomLanguageCode,
): {
  languageCode: string;
  voiceName: string;
} {
  const metadata = getTtsMetadata({ languageCode });
  return {
    languageCode: metadata.languageCode,
    voiceName: metadata.voiceName,
  };
}

async function synthesizeClassroomAudios(
  episodeId: string,
  classrooms: LanguageClassroomRow[],
): Promise<{ audioBuffers: Buffer[]; cost: UsageCostLine[] }> {
  const audioBuffers: Buffer[] = [];
  const cost: UsageCostLine[] = [];

  for (const classroom of classrooms) {
    const result = await synthesizeClassroomAudio(
      toLanguageClassroomLesson(classroom),
      { episodeId },
    );
    cost.push(...result.cost);
    if (result.audio) {
      audioBuffers.push(result.audio);
    }
  }

  return { audioBuffers, cost };
}

async function combineMainAndClassroomAudio(
  mainAudio: Buffer,
  classroomAudios: Buffer[],
  context: {
    episodeId: string;
    localizationId: string;
    languageCode: LanguageClassroomLanguageCode;
  },
): Promise<Buffer> {
  if (classroomAudios.length === 0) {
    return mainAudio;
  }

  try {
    return await step('concatEpisodeClassroomAudio', () =>
      concatMp3Buffers([mainAudio, ...classroomAudios]),
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[/ingest] classroom audio concat failed:', {
      ...context,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    });
    return mainAudio;
  }
}

async function ensureLanguageClassrooms(
  localization: EpisodeLocalizationRow,
  sourceLanguageCode: LanguageClassroomLanguageCode,
): Promise<{ rows: LanguageClassroomRow[]; cost: UsageCostLine[] }> {
  let existing: LanguageClassroomRow[] = [];
  const cost: UsageCostLine[] = [];

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
      return {
        rows: orderLanguageClassrooms(existing, sourceLanguageCode),
        cost,
      };
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
    cost.push(
      buildLlmCostLine('LLM classrooms', {
        provider: generated.provider,
        model: generated.model,
        costUsd: generated.costUsd,
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

    return {
      rows: orderLanguageClassrooms(
        [...retainedExisting, ...persisted],
        sourceLanguageCode,
      ),
      cost,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[/ingest] language classroom generation failed:', {
      episodeLocalizationId: localization.id,
      sourceLanguageCode,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    });
    return {
      rows: orderLanguageClassrooms(existing, sourceLanguageCode),
      cost,
    };
  }
}

function buildLlmCostLine(
  label: string,
  generated: {
    provider: string;
    model: string;
    costUsd: number;
  },
): UsageCostLine {
  return {
    category: 'llm',
    label,
    provider: generated.provider,
    model: generated.model,
    costUsd: generated.costUsd,
  };
}

function buildIngestResult(
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  classrooms: LanguageClassroomRow[],
  statusCode: 200 | 201,
  costBreakdown: UsageCostLine[],
): IngestResult {
  const costDetails = buildUsageCostDetails(costBreakdown);

  return {
    episode: toEpisodeResponseFromLocalization(
      episode,
      localization,
      classrooms,
    ),
    statusCode,
    costUsd: costDetails.totalUsd,
    costDetails,
  };
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
