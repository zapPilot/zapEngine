import type { LanguageClassroomLesson } from '../../types.js';
import { textToSpeech } from '../tts.js';
import { concatMp3Buffers } from '../tts/audio-concat.js';
import { buildClassroomSegments } from './classroom-script.js';

export interface SynthesizeClassroomAudioOptions {
  episodeId?: string;
}

export async function synthesizeClassroomAudio(
  lesson: LanguageClassroomLesson,
  opts: SynthesizeClassroomAudioOptions = {},
): Promise<Buffer | null> {
  try {
    const segments = buildClassroomSegments(lesson);
    const audioBuffers: Buffer[] = [];

    for (const segment of segments) {
      audioBuffers.push(
        await textToSpeech(segment.text, {
          languageCode: segment.languageCode,
        }),
      );
    }

    return await concatMp3Buffers(audioBuffers);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[classroom-audio] synthesis failed:', {
      episodeId: opts.episodeId,
      targetLanguageCode: lesson.targetLanguageCode,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    });
    return null;
  }
}
