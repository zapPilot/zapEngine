import { readFile, writeFile } from 'node:fs/promises';

import type { ReactElement } from 'react';
import satori from 'satori';

import { videoAssetPaths } from './runtime-assets.js';
import {
  type BrandFrameContent,
  CONCEPT_CARD_HEIGHT,
  CONCEPT_CARD_WIDTH,
  type ConceptCardContent,
  type OutroContent,
  PORTRAIT_TEMPLATE_HEIGHT,
  PORTRAIT_TEMPLATE_WIDTH,
  renderBrandFrameElement,
  renderConceptCardElement,
  renderOutroElement,
} from './templates.js';

// Every stage kind renders at its own fixed canvas size: the portrait brand
// frame and outro card at the 9:16 template size, and the concept card at
// its own dimensions.
export interface PortraitRasterOutput {
  width: number;
  height: number;
}

export type SatoriStageInput =
  | { kind: 'frame'; frame: BrandFrameContent; output: PortraitRasterOutput }
  | { kind: 'outro'; outro: OutroContent; output: PortraitRasterOutput }
  | { kind: 'concept-card'; card: ConceptCardContent };

function fontArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

function svgDataUri(svg: Buffer): string {
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

async function stageElementAndSize(
  input: SatoriStageInput,
  logoDataUri: string,
): Promise<{
  element: ReactElement;
  width: number;
  height: number;
}> {
  if (input.kind === 'frame') {
    return {
      element: renderBrandFrameElement(input.frame, logoDataUri),
      width: PORTRAIT_TEMPLATE_WIDTH,
      height: PORTRAIT_TEMPLATE_HEIGHT,
    };
  }
  if (input.kind === 'outro') {
    return {
      element: renderOutroElement(input.outro, logoDataUri),
      width: PORTRAIT_TEMPLATE_WIDTH,
      height: PORTRAIT_TEMPLATE_HEIGHT,
    };
  }
  return {
    element: renderConceptCardElement(input.card),
    width: CONCEPT_CARD_WIDTH,
    height: CONCEPT_CARD_HEIGHT,
  };
}

export async function runSatoriStage(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const input = JSON.parse(
    await readFile(inputPath, 'utf8'),
  ) as SatoriStageInput;
  const [regularFont, boldFont, monoFont, logo] = await Promise.all([
    readFile(videoAssetPaths.notoSansCjkTcRegular),
    readFile(videoAssetPaths.notoSansCjkTcBold),
    readFile(videoAssetPaths.jetBrainsMonoSemibold),
    readFile(videoAssetPaths.logo),
  ]);

  const { element, width, height } = await stageElementAndSize(
    input,
    svgDataUri(logo),
  );
  const svg = await satori(element, {
    width,
    height,
    embedFont: true,
    fonts: [
      {
        name: 'Noto Sans TC',
        data: fontArrayBuffer(regularFont),
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Noto Sans TC',
        data: fontArrayBuffer(boldFont),
        weight: 700,
        style: 'normal',
      },
      {
        name: 'JetBrains Mono',
        data: fontArrayBuffer(monoFont),
        weight: 700,
        style: 'normal',
      },
    ],
  });

  await writeFile(outputPath, svg, 'utf8');
}
