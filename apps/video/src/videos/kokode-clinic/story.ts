// The film's words come from the Kokode story (apps/kokode-ai/src/story), the
// source the landing page and the decks render too. This is the only import
// across the workspace boundary; it re-exports just what the film uses.
import type { FilmLine } from '../../../../kokode-ai/src/story';
import type { VoLine } from '../../timeline/types';

export type {
  BeatId,
  DisclaimerId,
  FilmScene,
  FilmSceneId,
} from '../../../../kokode-ai/src/story';
export {
  arcViolations,
  BEATS,
  CHAT_UI,
  DEMOS,
  FIGURES,
  FILM,
  FILM_LINK,
  FILM_ORDER,
  footnote,
  SITE,
} from '../../../../kokode-ai/src/story';

/** A film line as narration: `ja` is the caption, `en` is what is spoken. */
export function voLines(lines: readonly FilmLine[]): VoLine[] {
  return lines.map((line) => ({ id: line.id, text: line.ja, say: line.en }));
}
