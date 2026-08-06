import OpenAI from 'openai';

import type {
  StoryboardProvider,
  StoryboardProviderOptions,
  StoryboardProviderRequest,
  StoryboardProviderResult,
} from './provider.js';
import { formatSentencesForPrompt } from './sentences.js';

const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_NVIDIA_MODEL = 'nvidia/nvidia-nemotron-nano-9b-v2';
const NVIDIA_TIMEOUT_MS = 45_000;
const NVIDIA_MAX_OUTPUT_TOKENS = 2_000;

function requiredApiKey(): string {
  const apiKey = process.env['NVIDIA_API_KEY']?.trim();
  if (!apiKey) throw new Error('NVIDIA_API_KEY not set');
  return apiKey;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```') || !trimmed.endsWith('```')) return trimmed;
  let body = trimmed.slice(3, -3);
  if (body.toLowerCase().startsWith('json')) body = body.slice(4);
  // Opening and closing fences must not overlap (a lone ``` or ```` is no fence).
  return trimmed.length >= 6 ? body.trim() : trimmed;
}

function parseDraftJson(content: string): unknown {
  if (!content.trim()) throw new Error('NVIDIA returned empty storyboard JSON');
  try {
    return JSON.parse(stripJsonFence(content)) as unknown;
  } catch (error) {
    throw new Error('NVIDIA returned malformed storyboard JSON', {
      cause: error,
    });
  }
}

export function buildNvidiaStoryboardSystemPrompt(): string {
  return `/no_think
你是 Zap Pilot 的 Hybrid Explainer storyboard 編排器。你只能把 canonical script 切成 scenes，並選擇 photo、diagram 或 dataCard。不能搜尋新聞、補充事實、判斷授權、產生 TTS 或設計任意 HTML/SVG。

只輸出單一 JSON object，不要 Markdown。JSON 只能有 scenes。每個 scene 只能有 sceneId、startSentenceId、endSentenceId、visual。

visual 必須是以下三種之一：
1. photo：{ kind: "photo", searchIntents: string[1..3], mustShowEntities: string[1..4] }
2. diagram：{ kind: "diagram", layout: "flow"|"comparison"|"timeline"|"layers"|"systemMap"|"entityCard", nodes: [{id,label,detail?}], edges: [{from,to,label?}] }
3. dataCard：{ kind: "dataCard", value, unit?, label, secondaryValue?, secondaryLabel? }

選擇規則：
- 人物、公司、機構、產品、發布會或真實事件才使用 photo。
- 因果、資金流、系統架構、協議流程、before/after、timeline 或方案比較使用 diagram。
- 單一重要利率、百分比、日期、價格或數量使用 dataCard。
- 抽象金融或技術概念不得用 generic office、trader、developer 或 building stock photo。
- 無法可靠判斷時使用簡單 grounded diagram，不得虛構照片。

共同規則：
- sceneId 必須依序使用 scene-01、scene-02，以此類推。
- 每個 scene 必須填 startSentenceId、endSentenceId，依序、連續、不可重疊或漏句。
- photo 搜尋短語應描述可攝影且具體的主體或事件；mustShowEntities 必須是畫面必要 entity。
- diagram 的 node/edge label 必須簡短；node id 使用小寫英數與連字號，edge 只能引用已存在 node。
- dataCard 的 value、unit、label 必須直接來自該 scene。
- 所有人名、機構、事件、日期、數字、單位與因果關係都必須已存在該 scene 的 canonical sentence range；不得新增推論。
- 不得輸出圖片 URL、來源、授權、時間或 renderer template。
- 90 秒內容使用 8 到 10 個 scenes，其他長度約每 9 到 12 秒一個 scene，最多 64 個。`;
}

export function buildNvidiaStoryboardUserPrompt(
  request: StoryboardProviderRequest,
  options: StoryboardProviderOptions = {},
): string {
  const repair = options.repairIssues?.length
    ? [
        '',
        '上一次輸出未通過驗證。請只修正下列問題並重新輸出完整 JSON：',
        ...options.repairIssues.map(
          (issue) => `- ${issue.path.join('.') || '<root>'}: ${issue.message}`,
        ),
      ]
    : [];

  return [
    `標題：${request.title}`,
    `音訊長度：${request.durationMs} ms`,
    `sentence 數：${request.sentences.length}`,
    '',
    'Canonical sentences（只可用來劃分 scene 範圍與建立影像搜尋意圖）：',
    formatSentencesForPrompt(request.sentences),
    ...repair,
  ].join('\n');
}

export interface NvidiaStoryboardProviderOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  client?: OpenAI;
}

export function createNvidiaStoryboardProvider(
  providerOptions: NvidiaStoryboardProviderOptions = {},
): StoryboardProvider {
  const model =
    providerOptions.model ??
    process.env['NVIDIA_STORYBOARD_MODEL']?.trim() ??
    DEFAULT_NVIDIA_MODEL;
  const client =
    providerOptions.client ??
    new OpenAI({
      apiKey: providerOptions.apiKey ?? requiredApiKey(),
      baseURL:
        providerOptions.baseURL ??
        process.env['NVIDIA_BASE_URL']?.trim() ??
        DEFAULT_NVIDIA_BASE_URL,
      timeout: NVIDIA_TIMEOUT_MS,
      maxRetries: 0,
    });

  return {
    name: 'nvidia',
    model,
    async generate(
      request: StoryboardProviderRequest,
      requestOptions: StoryboardProviderOptions = {},
    ): Promise<StoryboardProviderResult> {
      const completion = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: buildNvidiaStoryboardSystemPrompt() },
            {
              role: 'user',
              content: buildNvidiaStoryboardUserPrompt(request, requestOptions),
            },
          ],
          temperature: 0.2,
          max_tokens: NVIDIA_MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
        },
        requestOptions.signal ? { signal: requestOptions.signal } : undefined,
      );
      const usage = completion.usage;
      return {
        draft: parseDraftJson(completion.choices[0]?.message.content ?? ''),
        model: completion.model || model,
        usage: usage
          ? {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : null,
      };
    },
  };
}
