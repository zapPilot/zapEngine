import { randomUUID } from 'node:crypto';

import {
  DEFAULT_LANGUAGE_CODE,
  type EpisodeLocalizationRow,
  type LanguageClassroomLanguageCode,
} from '../types.js';
import { buildUsageCostDetails, type UsageCostLine } from './cost.js';
import {
  findEpisodeLocalizationByEpisodeId,
  insertEpisodeLocalization,
  updateEpisodeLocalizationArticleContent,
  updateEpisodeLocalizationStatus,
} from './db.js';
import {
  ensureLanguageClassroomsAndRecordCost,
  ensureLocalizationCompleted,
  isAudioReady,
} from './ingest/audio-stage.js';
import {
  buildIngestResult,
  completeIngestResult,
  type IngestResult,
} from './ingest/result-builder.js';
import {
  ensureEpisodeLocalizationScript,
  findEpisodeAndLocalization,
  needsGeneratedScript,
} from './ingest/script-stage.js';
import { logIngestSkip, step, withStepLogContext } from './ingest/step.js';
import {
  type SecondaryLanguageCode,
  translateCanonicalScript,
} from './translate.js';

export type { IngestResult } from './ingest/result-builder.js';

const MULTILINGUAL_INGEST_LANGUAGE_CODES: LanguageClassroomLanguageCode[] = [
  DEFAULT_LANGUAGE_CODE,
  'ja',
  'en',
];
const MAX_TRANSLATED_SCRIPT_CHARACTERS = 30_000;
const MAX_TRANSLATED_TO_CANONICAL_RATIO = 4;

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
  return withStepLogContext({ languageCode }, () =>
    performIngestWithContext(url, languageCode),
  );
}

async function performIngestWithContext(
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
    logIngestSkip('localization audio already completed');
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
    ensureLocalizationCompleted,
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
    logIngestSkip('secondary localization audio already completed');
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

  localization = await ensureSecondaryLocalization(
    episode.id,
    languageCode,
    canonicalLocalization,
    localization,
  );

  if (
    needsGeneratedScript(localization) ||
    hasCorruptedSecondaryScript(
      localization.script ?? '',
      canonicalLocalization.script ?? '',
    )
  ) {
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
    throw new Error(
      'Failed to retrieve episode localization after secondary script generation',
    );
  }

  return completeIngestResult(
    episode,
    localization,
    languageCode,
    201,
    costBreakdown,
    ensureLocalizationCompleted,
  );
}

async function ensureSecondaryLocalization(
  episodeId: string,
  languageCode: SecondaryLanguageCode,
  canonicalLocalization: EpisodeLocalizationRow,
  localization: EpisodeLocalizationRow | null,
): Promise<EpisodeLocalizationRow> {
  if (localization) {
    return localization;
  }

  const inserted = await step('insertEpisodeLocalization:secondary', () =>
    insertEpisodeLocalization({
      id: randomUUID(),
      episodeId,
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

  /* v8 ignore next -- @preserve */
  if (!inserted) {
    throw new Error(
      'Failed to retrieve episode localization after secondary localization insert',
    );
  }

  return inserted;
}

function isSecondaryLanguageCode(
  languageCode: LanguageClassroomLanguageCode,
): languageCode is SecondaryLanguageCode {
  return languageCode !== DEFAULT_LANGUAGE_CODE;
}

function hasCorruptedSecondaryScript(
  script: string,
  canonicalScript: string,
): boolean {
  if (!script.trim()) {
    return true;
  }

  const scriptCharacters = [...script].length;
  const canonicalCharacters = Math.max([...canonicalScript].length, 1);
  if (
    scriptCharacters > MAX_TRANSLATED_SCRIPT_CHARACTERS &&
    scriptCharacters > canonicalCharacters * MAX_TRANSLATED_TO_CANONICAL_RATIO
  ) {
    return true;
  }

  return hasRunawayRepeatedPhrase(script);
}

function hasRunawayRepeatedPhrase(script: string): boolean {
  const normalized = script.replace(/\s+/g, ' ');

  for (let phraseLength = 4; phraseLength <= 24; phraseLength += 1) {
    for (
      let start = 0;
      start + phraseLength * 20 <= normalized.length;
      start += 1
    ) {
      const phrase = normalized.slice(start, start + phraseLength);
      if (!phrase.trim()) continue;

      let repetitions = 1;
      let next = start + phraseLength;
      while (normalized.startsWith(phrase, next)) {
        repetitions += 1;
        next += phraseLength;
      }

      if (repetitions >= 20) {
        return true;
      }
    }
  }

  return false;
}
