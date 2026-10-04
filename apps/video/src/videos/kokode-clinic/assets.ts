import { parseVoManifest } from '../../timeline/manifest';
import { buildTimeline, type TimedScene } from '../../timeline/timeline';
import { type KokodeScene, storyboard } from './storyboard';
import voJson from './vo.manifest.json';

export const timeline = buildTimeline<KokodeScene>(
  storyboard,
  parseVoManifest(voJson),
);

export type SceneOf<Id extends KokodeScene['id']> = TimedScene<
  Extract<KokodeScene, { id: Id }>
>;
