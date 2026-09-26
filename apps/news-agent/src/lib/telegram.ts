import { z } from 'zod';

import type { createHttp } from './http.js';
export function createTelegram(
  http: ReturnType<typeof createHttp>,
  token: string,
) {
  return async (
    chat: string,
    text: string,
    shareUrl: string,
  ): Promise<void> => {
    z.object({ ok: z.literal(true) }).parse(
      await http.postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chat,
        text,
        link_preview_options: { url: shareUrl },
      }),
    );
  };
}
