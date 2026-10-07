import type { ImageCandidate } from '../../types.js';
import { convertTextToZhCN } from '../opencc.js';
import { normalizedSearchTokens } from './search-vocabulary.js';
import { speakingUnits } from './text-units.js';

const HAN_FILLERS = new Set(
  Array.from('的了是在和與与及或而就都也有為为這这那於于之其並并不一個个'),
);
const ENGLISH_FILLERS = new Set([
  'a',
  'an',
  'of',
  'to',
  'for',
  'on',
  'is',
  'are',
  'as',
  'by',
  'from',
  'it',
  'this',
  'that',
]);

function alignmentTerms(text: string): Set<string> {
  const value = convertTextToZhCN(text).normalize('NFKC').toLowerCase();
  const terms = new Set(
    normalizedSearchTokens(value.replace(/\p{Script=Han}/gu, ' ')).filter(
      (word) => !ENGLISH_FILLERS.has(word),
    ),
  );
  for (const run of value.match(/\p{Script=Han}+/gu) ?? []) {
    const characters = Array.from(run);
    for (let index = 0; index < characters.length - 1; index += 1) {
      if (
        !HAN_FILLERS.has(characters[index]!) &&
        !HAN_FILLERS.has(characters[index + 1]!)
      )
        terms.add(characters.slice(index, index + 2).join(''));
    }
  }
  return terms;
}

export interface PublisherAlignmentScene {
  sceneId: string;
  text: string;
  englishText?: string;
}
export interface PublisherImagePlacement {
  sceneId: string;
  bodyIndex: number;
  articlePosition: number | null;
  lexicalScore: number;
}
export interface PublisherImageAlignment {
  placements: PublisherImagePlacement[];
  overflow: number[];
}

/** Ordered maximum-weight matching. A 1000-point placement bonus makes losing
 * an image more expensive than any position/lexical difference. */
export function alignPublisherImages(
  images: readonly ImageCandidate[],
  scenes: readonly PublisherAlignmentScene[],
  options: { availableSceneIds?: ReadonlySet<string> } = {},
): PublisherImageAlignment {
  const available = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(
      ({ scene }) => options.availableSceneIds?.has(scene.sceneId) ?? true,
    );
  if (!images.length || !available.length)
    return { placements: [], overflow: images.map((_, index) => index) };
  const sceneTerms = scenes.map((scene) =>
    alignmentTerms(`${scene.text} ${scene.englishText ?? ''}`),
  );
  const frequencies = new Map<string, number>();
  for (const terms of sceneTerms)
    for (const term of terms)
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const weights = scenes.map((scene) => Math.max(1, speakingUnits(scene.text)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let offset = 0;
  const midpoints = weights.map((weight) => {
    const midpoint = (offset + weight / 2) / total;
    offset += weight;
    return midpoint;
  });
  const lexical = images.map((image) => {
    const context = image.context;
    const evidence: [string, number][] = [
      [image.altText ?? '', 1],
      [context?.caption ?? '', 1],
      [context?.precedingText ?? '', 1],
      [context?.followingText ?? '', 0.75],
      [context?.heading ?? '', 0.5],
    ];
    const imageTerms = new Map<string, number>();
    for (const [text, weight] of evidence)
      for (const term of alignmentTerms(text))
        imageTerms.set(term, Math.max(weight, imageTerms.get(term) ?? 0));
    const scores = sceneTerms.map((terms) =>
      [...terms].reduce((sum, term) => {
        const frequency = frequencies.get(term)!;
        return (
          sum +
          (frequency > scenes.length * 0.25
            ? 0
            : (imageTerms.get(term) ?? 0) *
              Math.log(1 + scenes.length / frequency))
        );
      }, 0),
    );
    const smoothed = scores.map((_, index) =>
      scores
        .slice(Math.max(0, index - 2), index + 3)
        .reduce((sum, score) => sum + score, 0),
    );
    const peak = Math.max(...smoothed, 2 * Math.log(1 + scenes.length));
    return smoothed.map((score) => Math.min(1, score / peak));
  });
  const width = available.length + 1;
  const dp = new Float64Array((images.length + 1) * width);
  const choices = new Uint8Array(dp.length);
  for (let image = 1; image <= images.length; image += 1) {
    const position =
      images[image - 1]!.context?.position ?? (image - 0.5) / images.length;
    for (let scene = 1; scene <= available.length; scene += 1) {
      const cell = image * width + scene;
      const skipScene = dp[cell - 1]!;
      const skipImage = dp[cell - width]!;
      const placement =
        dp[cell - width - 1]! +
        1000 +
        lexical[image - 1]![available[scene - 1]!.index]! -
        2.5 * Math.abs(position - midpoints[available[scene - 1]!.index]!);
      // Equal scores keep an earlier scene by skipping the later one.
      if (skipScene >= placement && skipScene >= skipImage) {
        dp[cell] = skipScene;
        choices[cell] = 1;
      } else if (placement >= skipImage) {
        dp[cell] = placement;
        choices[cell] = 2;
      } else {
        dp[cell] = skipImage;
        choices[cell] = 3;
      }
    }
  }
  const placements: PublisherImagePlacement[] = [];
  let image = images.length;
  let scene = available.length;
  while (image > 0 && scene > 0) {
    const choice = choices[image * width + scene];
    if (choice === 1) scene -= 1;
    else if (choice === 2) {
      placements.push({
        sceneId: available[scene - 1]!.scene.sceneId,
        bodyIndex: image - 1,
        articlePosition: images[image - 1]!.context?.position ?? null,
        lexicalScore: lexical[image - 1]![available[scene - 1]!.index]!,
      });
      image -= 1;
      scene -= 1;
    } else image -= 1;
  }
  placements.reverse();
  const placed = new Set(placements.map((placement) => placement.bodyIndex));
  return {
    placements,
    overflow: images.flatMap((_, index) => (placed.has(index) ? [] : [index])),
  };
}
