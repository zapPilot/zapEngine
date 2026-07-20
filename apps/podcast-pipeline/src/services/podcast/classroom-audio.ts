import type { LanguageClassroomLesson } from '../../types.js';
import type { UsageCostLine } from '../cost.js';
import { logIngestEvent, step } from '../ingest/step.js';
import { textToSpeech } from '../tts.js';
import { concatMp3Buffers } from '../tts/audio-concat.js';
import { buildClassroomSegments } from './classroom-script.js';

export interface SynthesizeClassroomAudioOptions {
  episodeId?: string;
}

export interface SynthesizeClassroomAudioResult {
  audio: Buffer | null;
  cost: UsageCostLine[];
}

export async function synthesizeClassroomAudio(
  lesson: LanguageClassroomLesson,
  opts: SynthesizeClassroomAudioOptions = {},
): Promise<SynthesizeClassroomAudioResult> {
  const cost: UsageCostLine[] = [];

  try {
    const segments = buildClassroomSegments(lesson);
    const audioBuffers: Buffer[] = [];
    logIngestEvent('classroom:target:start', {
      segmentCount: segments.length,
      targetLanguage: lesson.targetLanguageCode,
    });

    for (const [index, segment] of segments.entries()) {
      const segmentNumber = index + 1;
      logIngestEvent('classroom:segment:start', {
        segment: segmentNumber,
        segmentCount: segments.length,
        targetLanguage: lesson.targetLanguageCode,
        ttsLanguage: segment.languageCode,
      });
      const synthesized = await step('textToSpeech:classroom', () =>
        textToSpeech(segment.text, {
          languageCode: segment.languageCode,
          usage: 'classroom',
          costLabel: 'TTS classroom audio',
        }),
      );
      audioBuffers.push(synthesized.audio);
      cost.push(...synthesized.cost);
      logIngestEvent('classroom:segment:done', {
        segment: segmentNumber,
        segmentCount: segments.length,
        targetLanguage: lesson.targetLanguageCode,
      });
    }

    const audio = await step('concatClassroomSegmentAudio', () =>
      concatMp3Buffers(audioBuffers),
    );
    logIngestEvent('classroom:target:done', {
      segmentCount: segments.length,
      targetLanguage: lesson.targetLanguageCode,
    });
    return {
      audio,
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
      targetLanguageCode: lesson.targetLanguageCode,
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
