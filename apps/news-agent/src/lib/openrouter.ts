import { z } from 'zod';

import { recognitionPrompt } from '../services/demoRule.js';
import type { createHttp } from './http.js';

const answer = z
  .object({ matches: z.boolean(), evidence: z.string().min(1) })
  .strict();
const envelope = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
});

export function createRecognizer(
  http: ReturnType<typeof createHttp>,
  url: string,
  key: string,
  model: string,
) {
  return async (title: string, text: string) => {
    const result = envelope.parse(
      await http.postJson(
        `${url.replace(/\/$/, '')}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: recognitionPrompt },
            { role: 'user', content: JSON.stringify({ title, article: text }) },
          ],
          response_format: { type: 'json_object' },
          reasoning: { enabled: false },
          provider: { sort: 'throughput', require_parameters: true },
        },
        { Authorization: `Bearer ${key}` },
      ),
    );
    return answer.parse(JSON.parse(result.choices[0]!.message.content));
  };
}
