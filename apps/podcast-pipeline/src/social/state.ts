import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  type PlatformPublishState,
  SOCIAL_STATE_LANGUAGE_KEYS,
  type SocialLanguageCode,
  type SocialPlatform,
  type SocialPublishState,
} from './types.js';

export const DEFAULT_SOCIAL_STATE_PATH = join(
  homedir(),
  '.zap-pilot',
  'social-publisher.json',
);

export async function readPublishState(
  path = DEFAULT_SOCIAL_STATE_PATH,
): Promise<SocialPublishState> {
  const raw = await readFile(path, 'utf8').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return '{}';
      throw error;
    },
  );
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid social publisher state at ${path}.`);
  }
  return parsed as SocialPublishState;
}

export function getPublishedPlatform(
  state: SocialPublishState,
  episodeId: string,
  platform: SocialPlatform,
  languageCode: SocialLanguageCode = 'zh-Hant',
): PlatformPublishState | undefined {
  return state[episodeId]?.[SOCIAL_STATE_LANGUAGE_KEYS[languageCode]]?.[
    platform
  ];
}

export async function markPlatformPublished(input: {
  episodeId: string;
  platform: SocialPlatform;
  languageCode?: SocialLanguageCode;
  result: PlatformPublishState;
  path?: string;
}): Promise<void> {
  const path = input.path ?? DEFAULT_SOCIAL_STATE_PATH;
  const state = await readPublishState(path);
  const episodeState = state[input.episodeId] ?? {};
  const languageKey =
    SOCIAL_STATE_LANGUAGE_KEYS[input.languageCode ?? 'zh-Hant'];
  const languageState = episodeState[languageKey] ?? {};

  state[input.episodeId] = {
    ...episodeState,
    [languageKey]: {
      ...languageState,
      [input.platform]: input.result,
    },
  };

  await writePublishState(state, path);
}

async function writePublishState(
  state: SocialPublishState,
  path: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}
