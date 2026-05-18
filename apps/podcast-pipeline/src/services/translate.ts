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

interface OpenRouterConfig {
  openai: OpenAI;
  model: string;
  thinkingModel: string | null;
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
  const config = getOpenRouterConfig();
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
  const config = getOpenRouterConfig();
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
  const model = completions.at(-1)?.model ?? fallbackModel;
  const provider =
    completions.find((completion) => completion.provider)?.provider ??
    'openrouter';

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
