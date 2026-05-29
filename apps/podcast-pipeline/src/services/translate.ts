import OpenAI from 'openai';

import type { LanguageClassroomLanguageCode } from '../types.js';
import type { UsageCostLine } from './cost.js';
import {
  completionMetadata,
  getOpenRouterConfig,
  withThinkingModel,
} from './llm.js';

export type SecondaryLanguageCode = Exclude<
  LanguageClassroomLanguageCode,
  'zh-Hant'
>;

const TARGET_LANGUAGE_NAME: Record<SecondaryLanguageCode, string> = {
  ja: 'Japanese',
  en: 'English',
};

// Translation is a low-difficulty task and does not justify the (pricier) model
// used for script generation. It gets its own cheap, dedicated model, falling
// back to a budget Google flash-lite model when LLM_TRANSLATION_MODEL is unset.
// This is independent of LLM_MODEL (script/classroom generation are unaffected).
const TRANSLATION_DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';

interface OpenRouterConfig {
  openai: OpenAI;
  model: string;
  thinkingModel: string | null;
}

function getTranslationConfig(): OpenRouterConfig {
  return getOpenRouterConfig({
    model: process.env['LLM_TRANSLATION_MODEL'] || TRANSLATION_DEFAULT_MODEL,
    thinkingModel: null,
  });
}

interface TranslationCompletion {
  text: string;
  provider: string;
  model: string;
  costUsd: number;
}

export interface TranslateCanonicalScriptOptions {
  title: string;
  script: string;
  targetLanguageCode: SecondaryLanguageCode;
}

export interface TranslateCanonicalScriptResult {
  title: string;
  script: string;
  cost: UsageCostLine[];
}

export async function translateCanonicalScript({
  title,
  script,
  targetLanguageCode,
}: TranslateCanonicalScriptOptions): Promise<TranslateCanonicalScriptResult> {
  const config = getTranslationConfig();
  const [translatedTitle, translatedScript] = await Promise.all([
    translateTextWithLLM(title, targetLanguageCode, config),
    translateTextWithLLM(script, targetLanguageCode, config),
  ]);

  return {
    title: translatedTitle.text,
    script: translatedScript.text,
    cost: [
      buildOpenRouterTranslateCostLine(
        [translatedTitle, translatedScript],
        targetLanguageCode,
        config.model,
      ),
    ],
  };
}

export async function translateChineseText(
  text: string,
  targetLanguageCode: SecondaryLanguageCode,
): Promise<{ text: string; cost: UsageCostLine[] }> {
  const config = getTranslationConfig();
  const translated = await translateTextWithLLM(
    text,
    targetLanguageCode,
    config,
  );

  return {
    text: translated.text,
    cost: [
      buildOpenRouterTranslateCostLine(
        [translated],
        targetLanguageCode,
        config.model,
      ),
    ],
  };
}

async function translateTextWithLLM(
  text: string,
  targetLanguageCode: SecondaryLanguageCode,
  config: OpenRouterConfig,
): Promise<TranslationCompletion> {
  if (text.length === 0) {
    return {
      text: '',
      provider: 'openrouter',
      model: config.model,
      costUsd: 0,
    };
  }

  const completion = (await config.openai.chat.completions.create(
    withThinkingModel(
      {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: translationSystemPrompt(targetLanguageCode),
          },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
      },
      config.thinkingModel,
    ),
  )) as OpenAI.Chat.ChatCompletion & {
    provider?: string | null;
  };

  const metadata = completionMetadata(
    completion,
    config.model,
    config.thinkingModel,
  );

  return {
    text: completion.choices[0]?.message?.content ?? '',
    provider:
      metadata.provider === 'unknown' ? 'openrouter' : metadata.provider,
    model: metadata.model,
    costUsd: metadata.costUsd,
  };
}

function translationSystemPrompt(
  targetLanguageCode: SecondaryLanguageCode,
): string {
  return [
    `Translate Traditional Chinese (zh-TW) into ${TARGET_LANGUAGE_NAME[targetLanguageCode]}.`,
    'Preserve line breaks and paragraph structure exactly where possible.',
    'Translate faithfully without adding commentary, explanations, Markdown, or notes.',
    'Output only the translated text.',
  ].join(' ');
}

function buildOpenRouterTranslateCostLine(
  completions: TranslationCompletion[],
  targetLanguageCode: SecondaryLanguageCode,
  fallbackModel: string,
): UsageCostLine {
  // buildOpenRouterTranslateCostLine is only called with at least one completion.
  /* v8 ignore start -- @preserve */
  const model = completions.at(-1)?.model ?? fallbackModel;
  // Translation completions always set provider after metadata normalization.
  const provider =
    completions.find((completion) => completion.provider)?.provider ??
    'openrouter';
  /* v8 ignore stop -- @preserve */

  return {
    category: 'translate',
    label: `Translation ${targetLanguageCode}`,
    provider,
    model,
    costUsd: completions.reduce(
      (sum, completion) => sum + completion.costUsd,
      0,
    ),
  };
}
