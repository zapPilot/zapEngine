import type OpenAI from 'openai';

import { throwIfAborted } from '../../lib/abort.js';
import { isPlainRecord as isRecord } from '../../lib/typeGuards.js';
import type { LanguageClassroomLanguageCode } from '../../types.js';
import { createOpenRouterChatCompletion, getOpenRouterConfig } from '../llm.js';
import {
  canonicalSentenceRangeText,
  formatSentencesForPrompt,
  splitCanonicalSentences,
} from './storyboard/sentences.js';

export interface VisualSceneAnchor {
  sceneId: string;
  startSentenceId: string;
  endSentenceId: string;
}

export interface SceneSentenceAlignment {
  sceneId: string;
  startSentenceId: string;
  endSentenceId: string;
}

export interface SceneAlignmentRequest {
  canonicalScript: string;
  localizedScript: string;
  languageCode: LanguageClassroomLanguageCode;
  scenes: readonly VisualSceneAnchor[];
}

export interface SceneAlignmentProvider {
  align(request: {
    canonicalScenes: readonly {
      sceneId: string;
      text: string;
    }[];
    localizedSentences: string;
    languageCode: LanguageClassroomLanguageCode;
    signal?: AbortSignal;
  }): Promise<unknown>;
}

export function canonicalSceneAlignment(
  scenes: readonly VisualSceneAnchor[],
  canonicalScript: string,
): SceneSentenceAlignment[] {
  return validateSceneAlignment(
    scenes,
    splitCanonicalSentences(canonicalScript).map((sentence) => sentence.id),
    scenes,
  );
}

export function proportionalSceneAlignment(
  scenes: readonly VisualSceneAnchor[],
  canonicalSentenceIds: readonly string[],
  localizedSentenceIds: readonly string[],
): SceneSentenceAlignment[] {
  if (scenes.length === 0) return [];
  if (canonicalSentenceIds.length === 0 || localizedSentenceIds.length === 0) {
    throw new Error('Scene alignment requires non-empty sentences');
  }
  if (localizedSentenceIds.length < scenes.length) {
    throw new Error(
      'Scene alignment requires at least one localized sentence per scene',
    );
  }

  const canonicalSentenceIndex = new Map(
    canonicalSentenceIds.map((sentenceId, index) => [sentenceId, index]),
  );
  let startIndex = 0;

  return scenes.map((scene, sceneIndex) => {
    const canonicalEndIndex = canonicalSentenceIndex.get(scene.endSentenceId);
    if (canonicalEndIndex === undefined) {
      throw new Error(
        `Scene ${scene.sceneId} references an unknown canonical sentence`,
      );
    }

    const remainingScenes = scenes.length - sceneIndex - 1;
    const maximumEndIndex = localizedSentenceIds.length - remainingScenes - 1;
    const proportionalEndIndex =
      Math.ceil(
        ((canonicalEndIndex + 1) / canonicalSentenceIds.length) *
          localizedSentenceIds.length,
      ) - 1;
    const endIndex =
      sceneIndex === scenes.length - 1
        ? localizedSentenceIds.length - 1
        : Math.min(maximumEndIndex, Math.max(startIndex, proportionalEndIndex));
    const startSentenceId = localizedSentenceIds[startIndex];
    const endSentenceId = localizedSentenceIds[endIndex];
    if (!startSentenceId || !endSentenceId) {
      throw new Error(
        `Scene ${scene.sceneId} has an invalid proportional range`,
      );
    }

    startIndex = endIndex + 1;
    return { sceneId: scene.sceneId, startSentenceId, endSentenceId };
  });
}

export async function alignLocalizedScenes(
  request: SceneAlignmentRequest,
  options: {
    provider?: SceneAlignmentProvider;
    signal?: AbortSignal;
  } = {},
): Promise<SceneSentenceAlignment[]> {
  throwIfAborted(options.signal);
  const canonicalSentences = splitCanonicalSentences(request.canonicalScript);
  const localizedSentences = splitCanonicalSentences(request.localizedScript);
  if (canonicalSentences.length === 0 || localizedSentences.length === 0) {
    throw new Error('Scene alignment requires non-empty scripts');
  }

  const canonicalScenes = request.scenes.map((scene) => {
    const text = canonicalSentenceRangeText(
      request.canonicalScript,
      canonicalSentences,
      scene.startSentenceId,
      scene.endSentenceId,
    );
    if (!text) {
      throw new Error(
        `Scene ${scene.sceneId} references an invalid canonical sentence range`,
      );
    }
    return { sceneId: scene.sceneId, text };
  });

  const provider = options.provider ?? configuredSceneAlignmentProvider();
  const localizedSentenceIds = localizedSentences.map(
    (sentence) => sentence.id,
  );
  try {
    const raw = await provider.align({
      canonicalScenes,
      localizedSentences: formatSentencesForPrompt(localizedSentences),
      languageCode: request.languageCode,
      ...(options.signal ? { signal: options.signal } : {}),
    });

    return validateSceneAlignment(request.scenes, localizedSentenceIds, raw);
  } catch (error) {
    throwIfAborted(options.signal);
    console.warn(
      '[video-worker] semantic scene alignment failed; using proportional fallback',
      error,
    );
    return proportionalSceneAlignment(
      request.scenes,
      canonicalSentences.map((sentence) => sentence.id),
      localizedSentenceIds,
    );
  }
}

export function validateSceneAlignment(
  expectedScenes: readonly VisualSceneAnchor[],
  localizedSentenceIds: readonly string[],
  raw: unknown,
): SceneSentenceAlignment[] {
  const compactAlignment = compactSceneAlignment(
    expectedScenes,
    localizedSentenceIds,
    raw,
  );
  if (compactAlignment) return compactAlignment;

  const payload = unwrapAlignmentPayload(raw);
  if (!Array.isArray(payload) || payload.length !== expectedScenes.length) {
    throw new Error(
      `Scene alignment must contain exactly ${expectedScenes.length} scenes`,
    );
  }
  const sentenceIndex = indexLocalizedSentences(localizedSentenceIds);
  let expectedStartIndex = 0;
  const result = payload.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Scene alignment entry ${index + 1} must be an object`);
    }
    const sceneId = readRequiredString(entry, 'sceneId');
    const startSentenceId = readRequiredString(entry, 'startSentenceId');
    const endSentenceId = readRequiredString(entry, 'endSentenceId');
    const expectedSceneId = expectedScenes[index]?.sceneId;
    if (sceneId !== expectedSceneId) {
      throw new Error(
        `Scene alignment order mismatch at ${index + 1}: expected ${expectedSceneId}`,
      );
    }

    const startIndex = sentenceIndex.get(startSentenceId);
    const endIndex = sentenceIndex.get(endSentenceId);
    if (startIndex === undefined || endIndex === undefined) {
      throw new Error(
        `Scene ${sceneId} references an unknown localized sentence`,
      );
    }
    if (startIndex !== expectedStartIndex || endIndex < startIndex) {
      throw new Error(
        `Scene ${sceneId} must cover the next contiguous localized sentence range`,
      );
    }
    expectedStartIndex = endIndex + 1;
    return { sceneId, startSentenceId, endSentenceId };
  });

  if (expectedStartIndex !== localizedSentenceIds.length) {
    throw new Error('Scene alignment must cover every localized sentence');
  }
  return result;
}

function compactSceneAlignment(
  expectedScenes: readonly VisualSceneAnchor[],
  localizedSentenceIds: readonly string[],
  raw: unknown,
): SceneSentenceAlignment[] | null {
  if (!isRecord(raw) || !('endSentenceIds' in raw)) return null;
  const endSentenceIds = raw['endSentenceIds'];
  if (
    !Array.isArray(endSentenceIds) ||
    endSentenceIds.length !== expectedScenes.length
  ) {
    throw new Error(
      `Scene alignment must contain exactly ${expectedScenes.length} end sentence IDs`,
    );
  }
  const sentenceIndex = indexLocalizedSentences(localizedSentenceIds);
  let startIndex = 0;
  const result = endSentenceIds.map((rawEndSentenceId, index) => {
    const scene = expectedScenes[index];
    if (!scene || typeof rawEndSentenceId !== 'string') {
      throw new Error(`Scene alignment entry ${index + 1} is invalid`);
    }
    const endSentenceId = rawEndSentenceId.trim();
    const endIndex = sentenceIndex.get(endSentenceId);
    if (endIndex === undefined || endIndex < startIndex) {
      throw new Error(
        `Scene ${scene.sceneId} must end on or after the next localized sentence`,
      );
    }
    const startSentenceId = localizedSentenceIds[startIndex];
    if (!startSentenceId) {
      throw new Error(`Scene ${scene.sceneId} starts beyond the script`);
    }
    startIndex = endIndex + 1;
    return {
      sceneId: scene.sceneId,
      startSentenceId,
      endSentenceId,
    };
  });

  if (startIndex !== localizedSentenceIds.length) {
    throw new Error('Scene alignment must cover every localized sentence');
  }
  return result;
}

/** Scene alignment is now always an OpenRouter workload using LLM_MODEL. */
export function configuredSceneAlignmentProvider(): SceneAlignmentProvider {
  return createOpenRouterSceneAlignmentProvider();
}

function sceneAlignmentMessages(request: {
  canonicalScenes: readonly { sceneId: string; text: string }[];
  localizedSentences: string;
  languageCode: LanguageClassroomLanguageCode;
}): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: [
        'You align a translated podcast script to an ordered visual storyboard.',
        'Do not translate, rewrite, summarize, omit, or add any text.',
        'Choose one ending localized sentence ID for every scene, in the given scene order.',
        'The ending IDs must be strictly increasing and the final ID must be the final localized sentence.',
        'Return valid JSON only with this shape:',
        '{"endSentenceIds":["s0002","s0004"]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        languageCode: request.languageCode,
        canonicalScenes: request.canonicalScenes,
        localizedSentences: request.localizedSentences,
      }),
    },
  ];
}

function parseSceneAlignmentContent(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith('```')) {
    throw new Error('Scene alignment returned invalid JSON content');
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw new Error('Scene alignment returned malformed JSON', {
      cause: error,
    });
  }
}

export function createOpenRouterSceneAlignmentProvider(): SceneAlignmentProvider {
  return {
    async align(request) {
      const { openai, model } = getOpenRouterConfig({ thinkingModel: null });
      const completion = await createOpenRouterChatCompletion(
        openai,
        {
          model,
          messages: sceneAlignmentMessages(request),
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 2_048,
        },
        null,
        request.signal ? { signal: request.signal } : undefined,
      );
      return parseSceneAlignmentContent(completionContent(completion));
    },
  };
}

function indexLocalizedSentences(
  localizedSentenceIds: readonly string[],
): Map<string, number> {
  if (localizedSentenceIds.length === 0) {
    throw new Error('Scene alignment requires localized sentences');
  }
  return new Map(
    localizedSentenceIds.map((sentenceId, index) => [sentenceId, index]),
  );
}

function completionContent(completion: OpenAI.Chat.ChatCompletion): string {
  return completion.choices[0]?.message?.content ?? '';
}

function unwrapAlignmentPayload(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) return raw['scenes'];
  return raw;
}

function readRequiredString(
  value: Record<string, unknown>,
  field: string,
): string {
  const raw = value[field];
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(
      `Scene alignment field ${field} must be a non-empty string`,
    );
  }
  return raw.trim();
}
