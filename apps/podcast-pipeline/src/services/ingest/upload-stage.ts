import type { LanguageClassroomLanguageCode } from '../../types.js';
import { generateHls } from '../hls.js';
import { type HlsUploadResult, uploadHlsToR2 } from '../storage.js';
import { step } from './step.js';

interface PackageAndUploadHlsInput {
  audio: Buffer;
  episodeId: string;
  languageCode: LanguageClassroomLanguageCode;
  section: 'main' | 'classroom';
  classroomTargetLanguageCode?: LanguageClassroomLanguageCode;
  generateStepName: string;
  uploadStepName: string;
}

export async function packageAndUploadHls(
  input: PackageAndUploadHlsInput,
): Promise<HlsUploadResult> {
  const generatedHls = await step(input.generateStepName, () =>
    generateHls(input.audio),
  );

  try {
    return await step(input.uploadStepName, () =>
      uploadHlsToR2(
        generatedHls.files,
        input.episodeId,
        input.languageCode,
        input.section,
        input.classroomTargetLanguageCode,
      ),
    );
  } finally {
    await generatedHls.cleanup();
  }
}
