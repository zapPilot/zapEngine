import type { TtsSynthesisResult, TtsSynthesizeOptions } from '../tts.js';
import { concatMp3Buffers } from './audio-concat.js';
import { measureSilences, type TrimOptions } from './audio-trim.js';
import { synthesize } from './fish-audio.js';
import { buildMixedLanguagePlan } from './mixed-language-text.js';
import { synthesizeMixedLanguage } from './mixed-language-tts.js';

export const AUDITION_SAMPLES = [
  {
    id: 'eigenlayer',
    languageCode: 'zh-Hant',
    text: 'EigenLayer 最近出现变化，EigenLayer 的 TVL 开始下降。',
  },
  {
    id: 'btc',
    languageCode: 'ja',
    text: 'BTCについて、価格の変化を説明します。',
  },
  {
    id: 'sentence',
    languageCode: 'zh-Hant',
    text: '市场正在变化。BTC 开始上涨。',
  },
  { id: 'adjacent', languageCode: 'ja', text: 'BTC、ETHについて説明します。' },
  { id: 'ending', languageCode: 'zh-Hant', text: '今天我们讨论 BTC。' },
] as const;
export const AUDITION_ROWS: TrimOptions[] = [0.06, 0.02, 0.015, 0.01]
  .map<TrimOptions>((retainSeconds) => ({ retainSeconds }))
  .concat([
    {
      retainSeconds: 0.015,
      minSilenceSeconds: 0.03,
      edgeToleranceSeconds: 0.02,
    },
  ]);
export interface AuditionOperations {
  synthesize: typeof synthesize;
  render: typeof synthesizeMixedLanguage;
  measure: typeof measureSilences;
  concat: typeof concatMp3Buffers;
  save: (name: string, audio: Buffer) => Promise<void>;
}
export async function auditionMixedLanguage(
  config:
    | TtsSynthesizeOptions['config']
    | ((languageCode: string) => TtsSynthesizeOptions['config']),
  operations: AuditionOperations,
): Promise<string> {
  const raw = new Map<string, Promise<TtsSynthesisResult>>();
  const reports: string[] = [];
  const resolveConfig = (languageCode: string) =>
    typeof config === 'function' ? config(languageCode) : config;
  const memo = (text: string, opts: TtsSynthesizeOptions) => {
    const key = JSON.stringify([text, opts.config.engine, opts.config.modelId]);
    let result = raw.get(key);
    if (!result) {
      result = operations.synthesize(text, opts);
      raw.set(key, result);
    }
    return result;
  };
  for (const sample of AUDITION_SAMPLES) {
    const opts = {
      config: resolveConfig(sample.languageCode),
      languageCode: sample.languageCode,
    };
    const parts = buildMixedLanguagePlan(sample.text, sample.languageCode)!;
    for (const part of parts)
      if (part.kind === 'speech') {
        const result = await memo(part.text, opts);
        reports.push(
          `raw ${JSON.stringify(part.text)}: ${JSON.stringify(await operations.measure(result.audio))}`,
        );
      }
    for (const [index, trim] of AUDITION_ROWS.entries()) {
      // Each call owns its reuse scope; trimmed clips never cross variant boundaries.
      const result = await operations.render(parts, opts, {
        synthesize: memo,
        trim,
        requestDelayMs: 0,
      });
      const name = `${sample.id}-row-${index + 1}.mp3`;
      await operations.save(name, result.audio);
      reports.push(
        `${name} ${JSON.stringify(trim)}: ${JSON.stringify(await operations.measure(result.audio))}`,
      );
      if (sample.id === 'btc') {
        const english = await memo('Bitcoin is a digital asset.', {
          config: resolveConfig('en'),
          languageCode: 'en',
        });
        const joined = await operations.concat([result.audio, english.audio]);
        const classroom = `classroom-ja-en-row-${index + 1}.mp3`;
        await operations.save(classroom, joined);
        reports.push(
          `${classroom}: ${JSON.stringify(await operations.measure(joined))}`,
        );
      }
    }
  }
  return `# Mixed-language audition\n\nChoose a row after checking seams, narration start/end and classroom ja→en joins. Punctuation stays 100/280 ms. A language switch adds no pause. Local ffmpeg 4.4 and production 4.1 may encode padding differently; validate the selected setting on production's binary.\n\n${reports.join('\n\n')}\n`;
}
