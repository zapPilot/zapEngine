import type { StoredObject } from './r2-objects.js';

const SEGMENT = '[a-zA-Z0-9][a-zA-Z0-9._-]*';
const VIDEO = new RegExp(
  `^(episodes/${SEGMENT}/localizations/(?:zh-Hant|ja|en)/video/${SEGMENT}/${SEGMENT})/(.+)$`,
);
const VISUAL = new RegExp(
  `^(episodes/${SEGMENT}/visuals/${SEGMENT}/(?!checkpoints/)${SEGMENT})/(.+)$`,
);
const COVER = new RegExp(
  `^episodes/${SEGMENT}/covers/${SEGMENT}/[a-f0-9]{64}\\.png$`,
);
export const ARTIFACT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export function classifyArtifactKey(key: string): {
  kind: 'video' | 'visual' | 'cover' | 'checkpoint' | 'threads';
  prefix: string;
} | null {
  if (key.split('/').some((part) => part === '.' || part === '..' || !part))
    return null;
  const video = VIDEO.exec(key);
  if (
    video &&
    /^(video\.mp4|thumbnail\.png|manifest\.json|captions\.ass|slides\/[a-zA-Z0-9._-]+\.png)$/.test(
      video[2]!,
    )
  )
    return { kind: 'video', prefix: video[1]! };
  const visual = VISUAL.exec(key);
  if (
    visual &&
    /^(visual-manifest\.json|images\/[a-zA-Z0-9._-]+\.(png|jpeg|jpg|webp|avif))$/.test(
      visual[2]!,
    )
  )
    return { kind: 'visual', prefix: visual[1]! };
  if (COVER.test(key))
    return { kind: 'cover', prefix: key.slice(0, key.lastIndexOf('/')) };
  if (
    new RegExp(
      `^transient/visual-checkpoints/${SEGMENT}/${SEGMENT}/${SEGMENT}/images/${SEGMENT}\\.(png|jpeg|jpg|webp|avif)$`,
    ).test(key)
  )
    return { kind: 'checkpoint', prefix: 'transient/visual-checkpoints' };
  if (
    new RegExp(
      `^transient/social/threads/${SEGMENT}/${SEGMENT}/video\\.mp4$`,
    ).test(key)
  )
    return { kind: 'threads', prefix: 'transient/social/threads' };
  return null;
}

export interface ArtifactCandidate {
  prefix: string;
  objects: StoredObject[];
  bytes: number;
  decision:
    | 'referenced'
    | 'young'
    | 'unobserved'
    | 'grace'
    | 'eligible'
    | 'malformed';
}

export function planArtifactGc(input: {
  objects: readonly StoredObject[];
  references: ReadonlySet<string>;
  retirements: ReadonlyMap<string, number>;
  now: number;
}): ArtifactCandidate[] {
  if (!Number.isFinite(input.now)) throw new Error('Invalid GC clock');
  const groups = new Map<string, StoredObject[]>();
  for (const object of input.objects) {
    // Group all children before classifying: an unfamiliar child blocks the
    // entire prefix rather than leaving a half-deleted published artifact.
    const match = VIDEO.exec(object.key) ?? VISUAL.exec(object.key);
    if (!match) continue;
    const prefix = match[1]!;
    const group = groups.get(prefix) ?? [];
    group.push(object);
    groups.set(prefix, group);
  }
  return [...groups].map(([prefix, objects]) => {
    const retired = input.retirements.get(prefix);
    let decision: ArtifactCandidate['decision'];
    if (input.references.has(prefix)) decision = 'referenced';
    else if (
      objects.some(
        (object) =>
          !classifyArtifactKey(object.key) ||
          !object.modified ||
          !Number.isFinite(object.modified.getTime()),
      )
    )
      decision = 'malformed';
    else if (
      objects.some(
        (object) => object.modified!.getTime() > input.now - ARTIFACT_GRACE_MS,
      )
    )
      decision = 'young';
    else if (retired === undefined) decision = 'unobserved';
    else if (
      !Number.isFinite(retired) ||
      retired > input.now - ARTIFACT_GRACE_MS
    )
      decision = 'grace';
    else decision = 'eligible';
    return {
      prefix,
      objects,
      bytes: objects.reduce((sum, object) => sum + object.size, 0),
      decision,
    };
  });
}
