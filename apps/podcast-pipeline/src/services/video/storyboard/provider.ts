import type { CanonicalSentence } from './sentences.js';
import type { StoryboardValidationIssue } from './validation.js';

export interface StoryboardProviderRequest {
  title: string;
  script: string;
  durationMs: number;
  sentences: readonly CanonicalSentence[];
}

export interface StoryboardTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface StoryboardProviderResult {
  draft: unknown;
  model: string;
  usage: StoryboardTokenUsage | null;
}

export interface StoryboardProviderOptions {
  signal?: AbortSignal;
  repairIssues?: readonly StoryboardValidationIssue[];
}

export interface StoryboardProvider {
  readonly name: string;
  readonly model: string;
  generate(
    request: StoryboardProviderRequest,
    options?: StoryboardProviderOptions,
  ): Promise<StoryboardProviderResult>;
}
