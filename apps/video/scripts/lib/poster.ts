export function posterFrame(
  scenes: readonly {
    spec: { id: string };
    from: number;
    durationInFrames: number;
  }[],
  poster: { scene: string; at: number },
): number {
  const scene = scenes.find((item) => item.spec.id === poster.scene);
  if (
    !scene ||
    !Number.isFinite(poster.at) ||
    poster.at < 0 ||
    poster.at > 1 ||
    scene.durationInFrames < 1
  )
    throw new Error('Invalid poster scene or position');
  return scene.from + Math.round((scene.durationInFrames - 1) * poster.at);
}
