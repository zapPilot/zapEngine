import drive from '../../public/music/drive-112.json';
import gentle from '../../public/music/gentle-88.json';
import { loopSchema } from './loop';

export const musicLibrary = {
  'gentle-88': loopSchema.parse(gentle),
  'drive-112': loopSchema.parse(drive),
};
export type LoopId = keyof typeof musicLibrary;
export function musicLoop(id: LoopId) {
  return musicLibrary[id];
}
