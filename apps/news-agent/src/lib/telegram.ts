import { z } from 'zod';

import type { Http } from './http.js';

export function createTelegram(http: Http, token: string) {
  return async (
    chat: string,
    text: string,
    previewUrl: string,
  ): Promise<void> => {
    z.object({ ok: z.literal(true) }).parse(
      await http.postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chat,
        text,
        link_preview_options: { url: previewUrl, prefer_large_media: true },
      }),
    );
  };
}
