import type { LanguageClassroomRow } from '../../types.js';
import type { UsageCostLine } from '../cost.js';
import { logIngestEvent, step } from '../ingest/step.js';
import { cleanTextForTts } from '../ingest/tts-text-cleansing.js';
import { textToSpeech } from '../tts.js';
import { parseLanguageClassroomLanguageCode } from './classroom-language.js';

export interface SynthesizeClassroomAudioOptions {
  episodeId?: string;
}

export interface SynthesizeClassroomAudioResult {
  audio: Buffer | null;
  cost: UsageCostLine[];
}

export async function synthesizeClassroomAudio(
  row: Pick<LanguageClassroomRow, 'target_language_code' | 'script'>,
  opts: SynthesizeClassroomAudioOptions = {},
): Promise<SynthesizeClassroomAudioResult> {
  const cost: UsageCostLine[] = [];

  try {
    const targetLanguageCode = parseLanguageClassroomLanguageCode(
      row.target_language_code,
    );
    logIngestEvent('classroom:target:start', {
      targetLanguage: targetLanguageCode,
    });

    const synthesized = await step('textToSpeech:classroom', () =>
      textToSpeech(cleanTextForTts(row.script ?? ''), {
        languageCode: targetLanguageCode,
        usage: 'classroom',
        costLabel: 'TTS classroom audio',
      }),
    );
    cost.push(...synthesized.cost);
    logIngestEvent('classroom:target:done', {
      targetLanguage: targetLanguageCode,
    });

    return {
      audio: synthesized.audio,
      cost,
    };
  } catch (error) {
    let err: Error;
    if (error instanceof Error && error.cause instanceof Error) {
      err = error.cause;
    } else {
      err = error instanceof Error ? error : new Error(String(error));
    }
    console.error('[classroom-audio] synthesis failed:', {
      episodeId: opts.episodeId,
      targetLanguageCode: row.target_language_code,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    });
    return {
      audio: null,
      cost,
    };
  }
}
