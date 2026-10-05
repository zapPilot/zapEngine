import { AsyncLocalStorage } from 'node:async_hooks';

import { sleep } from '../../lib/sleep.js';
import { compactUsageCostLines, type UsageCostLine } from '../cost.js';
import type { TtsSynthesisResult, TtsSynthesizeOptions } from '../tts.js';
import { concatMp3Buffers } from './audio-concat.js';
import {
  createSilentMp3,
  trimMp3Silence,
  type TrimOptions,
} from './audio-trim.js';
import { getRequestDelayMs, synthesize } from './fish-audio.js';
import {
  type MixedLanguagePart,
  SEAM_RETAIN_S,
} from './mixed-language-text.js';
import type { FishAudioTtsConfig } from './tts-config.js';

interface ClipStore {
  englishClips: Map<string, Buffer>;
  pauses: Map<number, Buffer>;
}
const clips = new AsyncLocalStorage<ClipStore>();

export function withEnglishTermClipReuse<T>(fn: () => T): T {
  if (clips.getStore()) return fn();
  return clips.run({ englishClips: new Map(), pauses: new Map() }, fn);
}

export function englishTermClipKey(
  config: FishAudioTtsConfig,
  term: string,
): string {
  return JSON.stringify([config.engine, config.modelId, term]);
}

async function pauseClip(store: ClipStore, ms: number): Promise<Buffer> {
  let pause = store.pauses.get(ms);
  if (!pause) {
    pause = await createSilentMp3(ms);
    store.pauses.set(ms, pause);
  }
  return pause;
}

export async function synthesizeMixedLanguage(
  parts: MixedLanguagePart[],
  opts: TtsSynthesizeOptions,
  deps: {
    synthesize?: typeof synthesize;
    trim?: TrimOptions;
    requestDelayMs?: number;
  } = {},
): Promise<TtsSynthesisResult> {
  return withEnglishTermClipReuse(async () => {
    const store = clips.getStore()!;
    const nativeClips = new Map<string, Buffer>();
    const buffers: Buffer[] = [];
    const costs: UsageCostLine[] = [];
    const terms = new Set<string>();
    const summary = {
      languageCode: opts.languageCode,
      englishSpans: 0,
      uniqueEnglishTerms: 0,
      reusedEnglishClips: 0,
      nativeFragments: 0,
      pauses: 0,
      fishRequests: 0,
    };
    for (const part of parts) {
      if (part.kind === 'pause') {
        summary.pauses += 1;
        buffers.push(await pauseClip(store, part.ms));
        continue;
      }
      if (part.english) {
        summary.englishSpans += 1;
        terms.add(part.text);
      } else summary.nativeFragments += 1;
      const cache = part.english ? store.englishClips : nativeClips;
      const key = part.english
        ? englishTermClipKey(opts.config, part.text)
        : part.text;
      let audio = cache.get(key);
      if (audio) {
        if (part.english) summary.reusedEnglishClips += 1;
      } else {
        if (summary.fishRequests > 0)
          await sleep(deps.requestDelayMs ?? getRequestDelayMs());
        const result = await (deps.synthesize ?? synthesize)(part.text, opts);
        summary.fishRequests += 1;
        costs.push(...result.cost);
        audio = await trimMp3Silence(
          result.audio,
          deps.trim ?? { retainSeconds: SEAM_RETAIN_S },
        );
        cache.set(key, audio);
      }
      buffers.push(audio);
    }
    summary.uniqueEnglishTerms = terms.size;
    const audio = await concatMp3Buffers(buffers);
    console.log('[/tts] Fish Audio mixed-language TTS', summary);
    return { audio, cost: compactUsageCostLines(costs) };
  });
}
