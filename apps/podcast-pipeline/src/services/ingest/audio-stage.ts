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
import {
  existingLanguageClassroomResult,
  getClassroomTargetLanguageCodes,
} from './result-builder.js';
import { step } from './step.js';
import { packageAndUploadHls } from './upload-stage.js';

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

  if (!isAudioReady(localization)) {
    classroomRows = await ensureLanguageClassroomsAndRecordCost(
      localization,
      languageCode,
      costBreakdown,
    );

    const mainAudio = await synthesizeMainAudio(
      localization.script ?? '',
      languageCode,
      costBreakdown,
    );
    const classroomAudios = await synthesizeClassroomAudios(
      episode.id,
      classroomRows,
    );
    costBreakdown.push(...classroomAudios.cost);
    const uploadedMain = await packageMainHls(
      mainAudio,
      episode.id,
      languageCode,
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
      ? await packageAndUploadHls({
          audio: classroomAudio,
          episodeId: episode.id,
          languageCode,
          section: 'classroom',
          generateStepName: 'generateClassroomHls',
          uploadStepName: 'uploadClassroomHlsToR2',
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
      throw new Error(
        'Failed to retrieve episode localization after audio completion',
      );
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
  return (
    localization.status === 'audio_generated' ||
    localization.status === 'completed'
  );
}

async function synthesizeMainAudio(
  script: string,
  languageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
): Promise<Buffer> {
  const mainAudio = await step('textToSpeech', () =>
    textToSpeech(script, {
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
): Promise<{
  hlsUrl: string;
  r2Prefix: string;
}> {
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
    /* v8 ignore next -- @preserve */
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
    return existingLanguageClassroomResult(existing, sourceLanguageCode, cost);
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
