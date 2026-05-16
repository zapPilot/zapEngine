import type { LanguageClassroomLesson } from '../../types.js';
import type { UsageCostLine } from '../cost.js';
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

    for (const segment of segments) {
      const synthesized = await textToSpeech(segment.text, {
        languageCode: segment.languageCode,
        usage: 'classroom',
        costLabel: 'TTS classroom audio',
      });
      audioBuffers.push(synthesized.audio);
      cost.push(...synthesized.cost);
    }

    return {
      audio: await concatMp3Buffers(audioBuffers),
      cost,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
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
