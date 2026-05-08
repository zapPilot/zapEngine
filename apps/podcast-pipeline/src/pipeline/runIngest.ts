import { type IngestResult, performIngest } from '../services/ingest.js';
import type { LanguageClassroomLanguageCode } from '../types.js';

export interface RunIngestPipelineInput {
  url: string;
  languageCode: LanguageClassroomLanguageCode;
}

export async function runIngestPipeline({
  url,
  languageCode,
}: RunIngestPipelineInput): Promise<IngestResult> {
  return performIngest(url, languageCode);
}
