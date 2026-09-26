import { z } from 'zod';

import type { Http } from './http.js';

export const PRESSURES = ['upward', 'downward', 'none'] as const;
export type Pressure = (typeof PRESSURES)[number];

const QUESTIONS = {
  exchange_hack: {
    type: 'noul',
    instructions:
      'Does this news report that a crypto exchange was hacked or had funds stolen?',
  },
  eth_pressure: {
    type: 'choice',
    instructions:
      'Which direction of ETH trading flow does this news describe?',
    criteria: {
      upward: 'someone buys a large amount of ETH',
      downward: 'someone sells or dumps a large amount of ETH',
      none: 'no ETH buying or selling is described',
    },
  },
};

const probability = z.number().min(0).max(1);
const responseSchema = z.object({
  model: z.string().optional(),
  answers: z.object({
    exchange_hack: z.object({ noul: probability }),
    eth_pressure: z.object({
      choice: z.enum(PRESSURES),
      probabilities: z.partialRecord(z.enum(PRESSURES), probability),
    }),
  }),
});

export interface LayaVerdict {
  model: string;
  exchangeHack: number;
  pressure: Pressure;
  pressureProbabilities: Partial<Record<Pressure, number>>;
}

// Laya is a local classifier: it only ever returns probabilities, never keys,
// addresses, or amounts, so its output can gate but not shape a transaction.
export function createLaya(http: Http, baseUrl: string) {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/systemone`;
  return async (title: string, body: string): Promise<LayaVerdict> => {
    const { model, answers } = responseSchema.parse(
      await http.postJson(
        url,
        { state: { title, body: body.slice(0, 6000) }, questions: QUESTIONS },
        {},
        90_000,
      ),
    );
    return {
      model: model ?? 'laya',
      exchangeHack: answers.exchange_hack.noul,
      pressure: answers.eth_pressure.choice,
      pressureProbabilities: answers.eth_pressure.probabilities,
    };
  };
}
