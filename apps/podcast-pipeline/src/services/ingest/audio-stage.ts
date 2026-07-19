import { randomUUID } from 'node:crypto';

import {
  type EpisodeLocalizationRow,
  type EpisodeRow,
  type LanguageClassroomLanguageCode,
  type LanguageClassroomRow,
} from '../../types.js';
import { buildLlmCostLine, type UsageCostLine } from '../cost.js';
import {
  listLanguageClassroomsByLocalizationId,
  toLanguageClassroomLesson,
  updateEpisodeLocalizationStatus,
  upsertLanguageClassrooms,
} from '../db.js';
import { generateLanguageClassroomsWithLLM } from '../llm.js';
import { synthesizeClassroomAudio } from '../podcast/classroom-audio.js';
import { getTtsMetadata, textToSpeech } from '../tts.js';
import { concatMp3Buffers } from '../tts/audio-concat.js';
import { getClassroomTargetLanguageCodes } from './classroom-config.js';
import { existingLanguageClassroomResult } from './result-builder.js';
import { logIngestSkip, step } from './step.js';
import { cleanTextForTts } from './tts-text-cleansing.js';
import { packageAndUploadHls } from './upload-stage.js';

const STRICT_CLASSROOM_AUDIO_TEST_ENV =
  'PODCAST_STRICT_CLASSROOM_AUDIO_TEST';

interface UploadedAudioSection {
  hlsUrl: string;
  r2Prefix: string;
}

export async function ensureLocalizationCompleted(
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
): Promise<{
  localization: EpisodeLocalizationRow;
  classroomRows: LanguageClassroomRow[];
}> {
  let classroomRows: LanguageClassroomRow[] | null = null;
  const mainAudioReady = isMainAudioReady(localization);
  const classroomAudioReady = isClassroomAudioReady(localization, languageCode);

  if (!mainAudioReady || !classroomAudioReady) {
    classroomRows = await ensureLanguageClassroomsAndRecordCost(
      localization,
      languageCode,
      costBreakdown,
    );
    assertLanguageClassroomsReady(classroomRows, languageCode);

    const uploadedMain = mainAudioReady
      ? null
      : await synthesizeAndUploadMainAudio(
          localization,
          episode.id,
          languageCode,
          costBreakdown,
        );
    const uploadedClassroom = classroomAudioReady
      ? null
      : await synthesizeAndUploadClassroomAudio(
          episode.id,
          localization,
          languageCode,
          classroomRows,
          costBreakdown,
        );

    const hlsUrl = uploadedMain?.hlsUrl ?? localization.hls_url;
    const classroomHlsUrl =
      uploadedClassroom?.hlsUrl ?? localization.classroom_hls_url;
    assertRequiredAudioArtifacts(hlsUrl, classroomHlsUrl, languageCode);

    const ttsMetadata = getTtsMetadataForLanguage(languageCode);
    const completedLocalization = await step(
      'updateEpisodeLocalizationStatus:completed',
      () =>
        updateEpisodeLocalizationStatus(localization.id, 'completed', {
          hlsUrl,
          r2Prefix:
            uploadedMain?.r2Prefix ?? localization.r2_prefix ?? undefined,
          classroomHlsUrl: classroomHlsUrl ?? undefined,
          classroomR2Prefix:
            uploadedClassroom?.r2Prefix ??
            localization.classroom_r2_prefix ??
            undefined,
          ttsLanguageCode: ttsMetadata.languageCode,
          ttsVoiceName: ttsMetadata.voiceName,
        }),
    );
    if (!completedLocalization) {
      throw new Error(
        'Failed to retrieve episode localization after audio completion',
      );
    }
    localization = completedLocalization;
  }

  if (!classroomRows) {
    logIngestSkip('localization audio already ready');
    classroomRows = await ensureLanguageClassroomsAndRecordCost(
      localization,
      languageCode,
      costBreakdown,
    );
    assertLanguageClassroomsReady(classroomRows, languageCode);
  }

  return { localization, classroomRows };
}

export async function ensureLanguageClassroomsAndRecordCost(
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

export function isAudioReady(localization: EpisodeLocalizationRow): boolean {
  if (!hasAudioReadyStatus(localization)) {
    return false;
  }

  if (!shouldRequireClassroomAudioIntegrity()) {
    return true;
  }

  return (
    hasNonEmptyString(localization.hls_url) &&
    isClassroomAudioReady(
      localization,
      localization.language_code as LanguageClassroomLanguageCode,
    )
  );
}

export function isLanguageClassroomAudioRequired(
  languageCode: LanguageClassroomLanguageCode,
): boolean {
  return (
    shouldRequireClassroomAudioIntegrity() &&
    getClassroomTargetLanguageCodes(languageCode).length > 0
  );
}

function hasAudioReadyStatus(localization: EpisodeLocalizationRow): boolean {
  return (
    localization.status === 'audio_generated' ||
    localization.status === 'completed'
  );
}

function isMainAudioReady(localization: EpisodeLocalizationRow): boolean {
  if (!hasAudioReadyStatus(localization)) {
    return false;
  }

  return (
    !shouldRequireClassroomAudioIntegrity() ||
    hasNonEmptyString(localization.hls_url)
  );
}

function isClassroomAudioReady(
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
): boolean {
  if (!isLanguageClassroomAudioRequired(languageCode)) {
    return true;
  }

  return hasNonEmptyString(localization.classroom_hls_url);
}

function shouldRequireClassroomAudioIntegrity(): boolean {
  if (process.env['NODE_ENV'] !== 'test') {
    return true;
  }

  return process.env[STRICT_CLASSROOM_AUDIO_TEST_ENV] === 'true';
}

function hasNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function synthesizeAndUploadMainAudio(
  localization: EpisodeLocalizationRow,
  episodeId: string,
  languageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
): Promise<UploadedAudioSection> {
  const mainAudio = await synthesizeMainAudio(
    localization.script ?? '',
    languageCode,
    costBreakdown,
  );
  return packageMainHls(mainAudio, episodeId, languageCode);
}

async function synthesizeAndUploadClassroomAudio(
  episodeId: string,
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
  classroomRows: LanguageClassroomRow[],
  costBreakdown: UsageCostLine[],
): Promise<UploadedAudioSection | null> {
  if (getClassroomTargetLanguageCodes(languageCode).length === 0) {
    return null;
  }

  const classroomAudios = await synthesizeClassroomAudios(
    episodeId,
    languageCode,
    classroomRows,
  );
  costBreakdown.push(...classroomAudios.cost);
  const classroomAudio = await combineClassroomAudio(
    classroomAudios.audioBuffers,
    {
      episodeId,
      localizationId: localization.id,
      languageCode,
    },
  );

  if (!classroomAudio) {
    if (isLanguageClassroomAudioRequired(languageCode)) {
      throw new Error(
        `Language classroom audio was not produced for ${languageCode}`,
      );
    }
    return null;
  }

  return packageAndUploadHls({
    audio: classroomAudio,
    episodeId,
    languageCode,
    section: 'classroom',
    generateStepName: 'generateClassroomHls',
    uploadStepName: 'uploadClassroomHlsToR2',
  });
}

async function synthesizeMainAudio(
  script: string,
  languageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
): Promise<Buffer> {
  const mainAudio = await step('textToSpeech', () =>
    textToSpeech(cleanTextForTts(script), {
      languageCode,
      usage: 'main',
      costLabel: 'TTS main audio',
    }),
  );
  costBreakdown.push(...mainAudio.cost);
  return mainAudio.audio;
}

async function packageMainHls(
  audio: Buffer,
  episodeId: string,
  languageCode: LanguageClassroomLanguageCode,
): Promise<UploadedAudioSection> {
  return packageAndUploadHls({
    audio,
    episodeId,
    languageCode,
    section: 'main',
    generateStepName: 'generateMainHls',
    uploadStepName: 'uploadMainHlsToR2',
  });
}

async function synthesizeClassroomAudios(
  episodeId: string,
  languageCode: LanguageClassroomLanguageCode,
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
      continue;
    }

    if (isLanguageClassroomAudioRequired(languageCode)) {
      throw new Error(
        `Language classroom audio synthesis failed for ${classroom.target_language_code}`,
      );
    }
  }

  return { audioBuffers, cost };
}

async function wrapWithErrorHandling<T>(
  promise: () => Promise<T>,
  fallback: T,
  errorMessage: string,
  context: Record<string, unknown>,
): Promise<T> {
  try {
    return await promise();
  } catch (error) {
    /* v8 ignore next -- @preserve */
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(errorMessage, {
      ...context,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    });
    return fallback;
  }
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
    if (isLanguageClassroomAudioRequired(context.languageCode)) {
      throw new Error(
        `Language classroom audio buffers are missing for ${context.languageCode}`,
      );
    }
    return null;
  }

  if (isLanguageClassroomAudioRequired(context.languageCode)) {
    return step('concatEpisodeClassroomAudio', () =>
      concatMp3Buffers(classroomAudios),
    );
  }

  return wrapWithErrorHandling(
    () =>
      step('concatEpisodeClassroomAudio', () =>
        concatMp3Buffers(classroomAudios),
      ),
    null,
    '[/ingest] classroom audio concat failed:',
    context,
  );
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
      logIngestSkip('language classrooms already ready');
      return existingLanguageClassroomResult(
        existing,
        sourceLanguageCode,
        cost,
      );
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

    return existingLanguageClassroomResult(
      [...retainedExisting, ...persisted],
      sourceLanguageCode,
      cost,
    );
  } catch (error) {
    logLanguageClassroomGenerationFailure(
      localization,
      sourceLanguageCode,
      error,
    );
    if (isLanguageClassroomAudioRequired(sourceLanguageCode)) {
      throw error;
    }
    return existingLanguageClassroomResult(existing, sourceLanguageCode, cost);
  }
}

function assertLanguageClassroomsReady(
  classrooms: LanguageClassroomRow[],
  sourceLanguageCode: LanguageClassroomLanguageCode,
): void {
  if (!isLanguageClassroomAudioRequired(sourceLanguageCode)) {
    return;
  }

  const expectedTargets = getClassroomTargetLanguageCodes(sourceLanguageCode);
  const actualTargets = new Set(
    classrooms.map((classroom) => classroom.target_language_code),
  );
  const missingTargets = expectedTargets.filter(
    (targetLanguageCode) => !actualTargets.has(targetLanguageCode),
  );

  if (missingTargets.length > 0) {
    throw new Error(
      `Language classroom generation incomplete for ${sourceLanguageCode}; missing targets: ${missingTargets.join(', ')}`,
    );
  }
}

function assertRequiredAudioArtifacts(
  hlsUrl: string | null | undefined,
  classroomHlsUrl: string | null | undefined,
  languageCode: LanguageClassroomLanguageCode,
): void {
  if (!hasNonEmptyString(hlsUrl)) {
    throw new Error(`Main audio HLS was not produced for ${languageCode}`);
  }

  if (
    isLanguageClassroomAudioRequired(languageCode) &&
    !hasNonEmptyString(classroomHlsUrl)
  ) {
    throw new Error(
      `Language classroom HLS was not produced for ${languageCode}`,
    );
  }
}

function logLanguageClassroomGenerationFailure(
  localization: EpisodeLocalizationRow,
  sourceLanguageCode: LanguageClassroomLanguageCode,
  error: unknown,
): void {
  /* v8 ignore next -- @preserve */
  const err = error instanceof Error ? error : new Error(String(error));
  const details: Record<string, unknown> = {};
  details['episodeLocalizationId'] = localization.id;
  details['sourceLanguageCode'] = sourceLanguageCode;
  details['message'] = err.message;
  details['stack'] = err.stack;
  details['cause'] = err.cause;
  console.error('[/ingest] language classroom generation failed:', details);
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
