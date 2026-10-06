export interface Tile {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Lays `count` 16:9 tiles of `tileWidth` into `columns` columns, leaving
 * `label` px under each tile for its caption.
 */
export function contactGrid(
  count: number,
  columns: number,
  tileWidth: number,
  label = 40,
  gap = 16,
) {
  const tileHeight = Math.round((tileWidth * 9) / 16);
  const rows = Math.ceil(count / columns);
  const tiles: Tile[] = Array.from({ length: count }, (_, index) => ({
    left: gap + (index % columns) * (tileWidth + gap),
    top: gap + Math.floor(index / columns) * (tileHeight + label + gap),
    width: tileWidth,
    height: tileHeight,
  }));
  return {
    tiles,
    width: gap + columns * (tileWidth + gap),
    height: gap + rows * (tileHeight + label + gap),
  };
}

/** Frames to sample in each scene: fractions of its length, clamped inside it. */
export function sampleFrames(
  scenes: readonly {
    readonly from: number;
    readonly durationInFrames: number;
  }[],
  fractions: readonly number[],
): number[][] {
  return scenes.map((scene) =>
    fractions.map((fraction) =>
      Math.min(
        scene.from + scene.durationInFrames - 1,
        Math.max(
          scene.from,
          Math.round(scene.from + scene.durationInFrames * fraction),
        ),
      ),
    ),
  );
}
