import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { rasterizeConceptCard } from './rasterizer.js';
import {
  type ConceptCardCopy,
  writeConceptCardCopy,
} from './storyboard/slide-copy.js';
import {
  fingerprintImage,
  type GeneratedSlideRequest,
  type PlannedVisualImage,
} from './visual-asset-planner.js';

export async function createGeneratedSlideAsset(
  request: GeneratedSlideRequest,
  dependencies: {
    writeCopy?: typeof writeConceptCardCopy;
    rasterize?: typeof rasterizeConceptCard;
    fingerprint?: typeof fingerprintImage;
  } = {},
): Promise<PlannedVisualImage> {
  request.signal?.throwIfAborted();
  const writeCopy = dependencies.writeCopy ?? writeConceptCardCopy;
  const rasterize = dependencies.rasterize ?? rasterizeConceptCard;
  const fingerprint = dependencies.fingerprint ?? fingerprintImage;
  const copy = await writeCopy({
    title: request.title,
    evidence:
      request.evidence?.searchText || request.evidence?.text || request.title,
    entities: request.scene.imageSearchEntities ?? [],
    intent: request.scene.imageSearchIntent,
    lead: request.lead,
    ...(request.signal ? { signal: request.signal } : {}),
  });
  request.signal?.throwIfAborted();

  const directory = join(
    request.workingDirectory,
    'generated-slides',
    request.scene.sceneId,
  );
  await mkdir(directory, { recursive: true });
  const paths = {
    input: join(directory, 'concept-card.json'),
    svg: join(directory, 'concept-card.svg'),
    master: join(directory, 'concept-card-master.png'),
    output: join(directory, 'concept-card.png'),
  };
  await rasterize(
    {
      kicker: copy.kicker,
      headline: copy.headline,
      points: copy.points,
    },
    paths,
    request.signal ? { signal: request.signal } : {},
  );
  request.signal?.throwIfAborted();

  const bytes = await readFile(paths.output);
  const metadata = await sharp(bytes).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) {
    throw new Error(
      `Generated concept card ${request.scene.sceneId} has no dimensions`,
    );
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const perceptualHash = await fingerprint(paths.output);
  const generatedUrl = `generated://concept-card/${request.scene.sceneId}`;
  return {
    assetId: request.assetId,
    path: paths.output,
    contentType: 'image/png',
    sha256,
    perceptualHash,
    width,
    height,
    originalImageUrl: generatedUrl,
    sourcePageUrl: generatedUrl,
    provider: 'generated-slide',
    license: 'brand-generated',
    slide: slideMetadata(copy, request),
  };
}

function slideMetadata(
  copy: ConceptCardCopy,
  request: GeneratedSlideRequest,
): NonNullable<PlannedVisualImage['slide']> {
  return {
    templateVersion: 'concept-card-v1',
    kicker: copy.kicker,
    headline: copy.headline,
    points: copy.points,
    copySource: copy.source,
    model: copy.model,
    reason: request.reason,
    rejectionSummary: request.rejectionSummary,
    lead: request.lead,
    costUsd: copy.costUsd,
  };
}
