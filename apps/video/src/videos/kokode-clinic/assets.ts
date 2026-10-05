import { parseVoManifest } from '../../timeline/manifest';
import { buildTimeline, type TimedScene } from '../../timeline/timeline';
import { captionVersion } from '../../timeline/versions';
import { type KokodeScene, storyboard } from './storyboard';
import voJson from './vo.manifest.json';

const manifest = parseVoManifest(voJson);
export const timelines = {
  ja: buildTimeline(captionVersion(storyboard, 'ja'), manifest),
  en: buildTimeline(captionVersion(storyboard, 'en'), manifest),
  'zh-Hant': buildTimeline(captionVersion(storyboard, 'zh-Hant'), manifest),
};

export type SceneOf<Id extends KokodeScene['id']> = TimedScene<
  Extract<KokodeScene, { id: Id }>
>;
