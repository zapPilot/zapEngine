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
import { translateCanonicalScript } from './translate.js';
import { getTtsMetadata, textToSpeech } from './tts.js';
import { concatMp3Buffers } from './tts/audio-concat.js';

export interface IngestResult {
  episode: EpisodeResponse;
  statusCode: 200 | 201;
  costUsd: number;
  costDetails: UsageCostDetails;
}

type SecondaryLanguageCode = Exclude<
  LanguageClassroomLanguageCode,
  typeof DEFAULT_LANGUAGE_CODE
>;

const MULTILINGUAL_INGEST_LANGUAGE_CODES: LanguageClassroomLanguageCode[] = [
  DEFAULT_LANGUAGE_CODE,
  'ja',
  'en',
];

export async function performMultilingualIngest(
  url: string,
  responseLanguageCode: LanguageClassroomLanguageCode,
): Promise<IngestResult> {
  const results: IngestResult[] = [];

  for (const languageCode of MULTILINGUAL_INGEST_LANGUAGE_CODES) {
    results.push(await performIngest(url, languageCode));
  }

  const selectedResult = results.find(
    (result) => result.episode.languageCode === responseLanguageCode,
  );
  if (!selectedResult) {
    throw new Error(
      `Failed to generate requested localization: ${responseLanguageCode}`,
    );
  }

  const costDetails = buildUsageCostDetails(
    results.flatMap((result) => result.costDetails.breakdown),
  );

  return {
    episode: selectedResult.episode,
    statusCode: results.some((result) => result.statusCode === 201)
      ? 201
      : selectedResult.statusCode,
    costUsd: costDetails.totalUsd,
    costDetails,
  };
}

export async function performIngest(
  url: string,
  languageCode: LanguageClassroomLanguageCode,
): Promise<IngestResult> {
  if (isSecondaryLanguageCode(languageCode)) {
    return performSecondaryIngest(url, languageCode);
  }

  const costBreakdown: UsageCostLine[] = [];
  const existing = await findEpisodeAndLocalization(url, languageCode);

  if (
    existing.episode &&
    existing.localization &&
    isAudioReady(existing.localization)
  ) {
    const classrooms = await ensureLanguageClassroomsAndRecordCost(
      existing.localization,
      languageCode,
      costBreakdown,
    );
    return buildIngestResult(
      existing.episode,
      existing.localization,
      classrooms,
      200,
      costBreakdown,
    );
  }

  const { episode, localization } = await ensureEpisodeLocalizationScript(
    url,
    languageCode,
    costBreakdown,
    existing,
  );

  return completeIngestResult(
    episode,
    localization,
    languageCode,
    201,
    costBreakdown,
  );
}

async function performSecondaryIngest(
  url: string,
  languageCode: SecondaryLanguageCode,
): Promise<IngestResult> {
  const costBreakdown: UsageCostLine[] = [];
  const { episode, localization: canonicalLocalization } =
    await ensureEpisodeLocalizationScript(
      url,
      DEFAULT_LANGUAGE_CODE,
      costBreakdown,
    );

  let localization = await step('findEpisodeLocalizationByEpisodeId', () =>
    findEpisodeLocalizationByEpisodeId(episode.id, languageCode),
  );

  if (localization && isAudioReady(localization)) {
    const classrooms = await ensureLanguageClassroomsAndRecordCost(
      localization,
      languageCode,
      costBreakdown,
    );
    return buildIngestResult(
      episode,
      localization,
      classrooms,
      200,
      costBreakdown,
    );
  }

  if (!localization) {
    localization = await step('insertEpisodeLocalization:secondary', () =>
      insertEpisodeLocalization({
        id: randomUUID(),
        episodeId: episode.id,
        languageCode,
        title: '',
        hlsUrl: '',
        rawText: '',
        script: '',
        llmModel: canonicalLocalization.llm_model ?? '',
        llmThinkingModel: canonicalLocalization.llm_thinking_model,
        llmProvider: canonicalLocalization.llm_provider ?? '',
        ttsLanguageCode: null,
        ttsVoiceName: null,
        r2Prefix: null,
        status: 'pending',
      }),
    );
  }

  if (needsTranslatedScript(localization)) {
    const translated = await step('translateCanonicalScript', () =>
      translateCanonicalScript({
        title: canonicalLocalization.title,
        script: canonicalLocalization.script ?? '',
        targetLanguageCode: languageCode,
      }),
    );
    costBreakdown.push(...translated.cost);

    await step('updateEpisodeLocalizationArticleContent:translated', () =>
      updateEpisodeLocalizationArticleContent(localization!.id, {
        title: translated.title,
        text: '',
      }),
    );
    localization = await step(
      'updateEpisodeLocalizationStatus:script_generated',
      () =>
        updateEpisodeLocalizationStatus(localization!.id, 'script_generated', {
          script: translated.script,
          llmModel: canonicalLocalization.llm_model ?? '',
          llmThinkingModel: canonicalLocalization.llm_thinking_model,
          llmProvider: canonicalLocalization.llm_provider ?? '',
        }),
    );
  }

  if (!localization) {
    throw new Error('Failed to retrieve episode localization');
  }

  return completeIngestResult(
    episode,
    localization,
    languageCode,
    201,
    costBreakdown,
  );
}

interface EpisodeLocalizationState {
  episode: EpisodeRow | null;
  localization: EpisodeLocalizationRow | null;
}

async function findEpisodeAndLocalization(
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

async function ensureEpisodeLocalizationScript(
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

  if (needsGeneratedScript(localization)) {
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

  return {
    episode,
    localization,
  };
}

async function ensureLocalizationCompleted(
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
): Promise<{
  localization: EpisodeLocalizationRow;
  classroomRows: LanguageClassroomRow[];
}> {
  let classroomRows: LanguageClassroomRow[] | null = null;

  if (!isAudioReady(localization)) {
    classroomRows = await ensureLanguageClassroomsAndRecordCost(
      localization,
      languageCode,
      costBreakdown,
    );

    const script = localization.script ?? '';
    const mainAudio = await step('textToSpeech', () =>
      textToSpeech(script, {
        languageCode,
        usage: 'main',
        costLabel: 'TTS main audio',
      }),
    );
    costBreakdown.push(...mainAudio.cost);
    const classroomAudios = await synthesizeClassroomAudios(
      episode.id,
      classroomRows,
    );
    costBreakdown.push(...classroomAudios.cost);
    const { files: mainFiles } = await step('generateMainHls', () =>
      generateHls(mainAudio.audio),
    );
    const uploadedMain = await step('uploadMainHlsToR2', () =>
      uploadHlsToR2(mainFiles, episode.id, languageCode, 'main'),
    );
    const classroomAudio = await combineClassroomAudio(
      classroomAudios.audioBuffers,
      {
        episodeId: episode.id,
        localizationId: localization.id,
        languageCode,
      },
    );
    const uploadedClassroom = classroomAudio
      ? await step('uploadClassroomHlsToR2', async () => {
          const { files: classroomFiles } = await step(
            'generateClassroomHls',
            () => generateHls(classroomAudio),
          );
          return uploadHlsToR2(
            classroomFiles,
            episode.id,
            languageCode,
            'classroom',
          );
        })
      : null;
    const ttsMetadata = getTtsMetadataForLanguage(languageCode);
    const completedLocalization = await step(
      'updateEpisodeLocalizationStatus:completed',
      () =>
        updateEpisodeLocalizationStatus(localization.id, 'completed', {
          hlsUrl: uploadedMain.hlsUrl,
          r2Prefix: uploadedMain.r2Prefix,
          classroomHlsUrl: uploadedClassroom?.hlsUrl,
          classroomR2Prefix: uploadedClassroom?.r2Prefix,
          ttsLanguageCode: ttsMetadata.languageCode,
          ttsVoiceName: ttsMetadata.voiceName,
        }),
    );
    if (!completedLocalization) {
      throw new Error('Failed to retrieve episode localization');
    }
    localization = completedLocalization;
  }

  if (!classroomRows) {
    classroomRows = await ensureLanguageClassroomsAndRecordCost(
      localization,
      languageCode,
      costBreakdown,
    );
  }

  return { localization, classroomRows };
}

async function completeIngestResult(
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
  statusCode: 200 | 201,
  costBreakdown: UsageCostLine[],
): Promise<IngestResult> {
  const completed = await ensureLocalizationCompleted(
    episode,
    localization,
    languageCode,
    costBreakdown,
  );

  return buildIngestResult(
    episode,
    completed.localization,
    completed.classroomRows,
    statusCode,
    costBreakdown,
  );
}

async function ensureLanguageClassroomsAndRecordCost(
  localization: EpisodeLocalizationRow,
  sourceLanguageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
): Promise<LanguageClassroomRow[]> {
  const ensuredClassrooms = await ensureLanguageClassrooms(
    localization,
    sourceLanguageCode,
  );
  costBreakdown.push(...ensuredClassrooms.cost);
  return ensuredClassrooms.rows;
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
    // Secondary ingest currently normalizes through the canonical zh-Hant script path.
    /* v8 ignore next -- @preserve */
    return article;
  }

  return convertArticleToZhTW(article);
}

function isSecondaryLanguageCode(
  languageCode: LanguageClassroomLanguageCode,
): languageCode is SecondaryLanguageCode {
  return languageCode !== DEFAULT_LANGUAGE_CODE;
}

function isAudioReady(localization: EpisodeLocalizationRow): boolean {
  return (
    localization.status === 'audio_generated' ||
    localization.status === 'completed'
  );
}

function needsGeneratedScript(localization: EpisodeLocalizationRow): boolean {
  return (
    localization.status === 'scraped' ||
    localization.status === 'pending' ||
    !localization.status ||
    !localization.script
  );
}

function needsTranslatedScript(localization: EpisodeLocalizationRow): boolean {
  return needsGeneratedScript(localization);
}

function getTtsMetadataForLanguage(
  languageCode: LanguageClassroomLanguageCode,
): {
  languageCode: string;
  voiceName: string;
} {
  const metadata = getTtsMetadata({ languageCode, usage: 'main' });
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

async function combineClassroomAudio(
  classroomAudios: Buffer[],
  context: {
    episodeId: string;
    localizationId: string;
    languageCode: LanguageClassroomLanguageCode;
  },
): Promise<Buffer | null> {
  if (classroomAudios.length === 0) {
    return null;
  }

  // Documented soft-failure: keep the main HLS / episode-completed state
  // even when the classroom concat fails. Clients should treat
  // classroom_hls_url as nullable. Failure is surfaced via console.error
  // so it is searchable in logs; retry happens via a manual re-ingest of
  // the episode after fixing the underlying ffmpeg issue.
  try {
    return await step('concatEpisodeClassroomAudio', () =>
      concatMp3Buffers(classroomAudios),
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[/ingest] classroom audio concat failed:', {
      ...context,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    });
    return null;
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
    logLanguageClassroomGenerationFailure(
      localization,
      sourceLanguageCode,
      error,
    );
    return existingLanguageClassroomResult(existing, sourceLanguageCode, cost);
  }
}

function existingLanguageClassroomResult(
  existing: LanguageClassroomRow[],
  sourceLanguageCode: LanguageClassroomLanguageCode,
  cost: UsageCostLine[],
): { rows: LanguageClassroomRow[]; cost: UsageCostLine[] } {
  return {
    rows: orderLanguageClassrooms(existing, sourceLanguageCode),
    cost,
  };
}

function logLanguageClassroomGenerationFailure(
  localization: EpisodeLocalizationRow,
  sourceLanguageCode: LanguageClassroomLanguageCode,
  error: unknown,
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const details: Record<string, unknown> = {};
  details['episodeLocalizationId'] = localization.id;
  details['sourceLanguageCode'] = sourceLanguageCode;
  details['message'] = err.message;
  details['stack'] = err.stack;
  details['cause'] = err.cause;
  console.error('[/ingest] language classroom generation failed:', details);
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
