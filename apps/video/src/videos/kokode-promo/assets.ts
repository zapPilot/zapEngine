import { parseVoManifest } from '../../timeline/manifest';
import type { TimedScene } from '../../timeline/timeline';
import { captionTimelines } from '../../timeline/versions';
import { type PromoScene, storyboard } from './storyboard';
import voJson from './vo.manifest.json';

const manifest = parseVoManifest(voJson);
export const timelines = captionTimelines(storyboard, manifest);

export type SceneOf<Id extends PromoScene['id']> = TimedScene<
  Extract<PromoScene, { id: Id }>
>;
