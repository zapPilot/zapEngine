import type { VoiceSettings } from '../../src/timeline/types';

export const SPLICE_KEEP_S = 0.015;
export const SPLICE_DETECT = 'silencedetect=noise=-45dB:d=0.02';
export const PAUSE_MS = { clause: 550, sentence: 750 };
export const ASSEMBLY_VERSION = 1;
export interface BrandClip {
  readonly token: string;
  readonly spoken: string;
  readonly voice: VoiceSettings['voice'];
  readonly speed: number;
  readonly file: string;
  readonly gainDb: number;
  readonly status: 'candidate' | 'approved';
}
export const BRAND_CLIPS: Record<string, BrandClip> = {
  kokode: {
    token: 'Kokode',
    spoken: 'ここで',
    voice: 'adrian',
    speed: 1,
    file: 'brand/audio/kokode-adrian-ja.mp3',
    gainDb: 0,
    status: 'candidate',
  },
};
export type SpeechPart =
  | { kind: 'tts'; text: string }
  | { kind: 'pause'; ms: number }
  | { kind: 'clip'; clip: BrandClip };
function pause(text: string): number {
  if (/[.!?…:]/u.test(text)) return PAUSE_MS.sentence;
  return /[,;—]/u.test(text) ? PAUSE_MS.clause : 0;
}
/** Candidates are inert; approved entries fail closed on spelling or voice drift. */
export function planSpeech(
  say: string,
  voice: VoiceSettings,
  clips = BRAND_CLIPS,
): SpeechPart[] {
  const approved = Object.values(clips).filter(
    (clip) => clip.status === 'approved',
  );
  const matches: { start: number; end: number; clip: BrandClip }[] = [];
  for (const clip of approved) {
    const escaped = clip.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const match of say.matchAll(new RegExp(escaped, 'gi'))) {
      const start = match.index;
      const end = start + match[0].length;
      const before = say.slice(0, start);
      const after = say.slice(end);
      if (
        match[0] !== clip.token ||
        !/(?:^|[\s'"“‘(\[{])$/u.test(before) ||
        !/^(?:$|\s|[.,!?:;…—'"”’\)\]}]+(?:\s|$))/u.test(after)
      )
        throw new Error(
          `Unsupported brand spelling near ${match[0]}; use exact token ${clip.token}`,
        );
      if (voice.voice !== clip.voice || voice.speed !== clip.speed)
        throw new Error(
          `Brand clip ${clip.token} requires ${clip.voice} at speed ${clip.speed}`,
        );
      matches.push({ start, end, clip });
    }
  }
  if (!matches.length) return [{ kind: 'tts', text: say }];
  matches.sort((a, b) => a.start - b.start);
  const parts: SpeechPart[] = [];
  let offset = 0;
  let pending = 0;
  const addText = (text: string) => {
    const leading = /^[\s\p{P}]+/u.exec(text)?.[0] ?? '';
    pending = Math.max(pending, pause(leading));
    const content = (offset > 0 ? text.slice(leading.length) : text).trim();
    if (/[\p{L}\p{N}]/u.test(content)) {
      if (parts.length && pending) parts.push({ kind: 'pause', ms: pending });
      parts.push({ kind: 'tts', text: content });
      pending = pause(
        /^[\s\p{P}]+/u.exec([...content].reverse().join(''))?.[0] ?? '',
      );
    }
  };
  for (const match of matches) {
    addText(say.slice(offset, match.start));
    if (parts.length && pending) parts.push({ kind: 'pause', ms: pending });
    parts.push({ kind: 'clip', clip: match.clip });
    pending = 0;
    offset = match.end;
  }
  addText(say.slice(offset));
  return parts;
}
