import { Canvas, Picture } from '@shopify/react-native-skia';
import type { RuntimeModelCanvasProps } from './runtimeModelSpec';
import { useRuntimeModelPicture } from './skia/useRuntimeModelPicture';

/**
 * Android draws the runtime model with react-native-skia from the story's
 * drawing list. iOS resolves `RuntimeModelCanvas.ios.tsx`, so Skia never enters
 * its bundle.
 */
export function RuntimeModelCanvas({
  spec,
  pinLabels,
  reducedMotion,
  paused,
}: RuntimeModelCanvasProps) {
  const picture = useRuntimeModelPicture(
    spec,
    pinLabels,
    reducedMotion,
    paused,
  );
  return (
    <Canvas style={{ width: spec.width, height: spec.height }}>
      {picture ? <Picture picture={picture} /> : null}
    </Canvas>
  );
}
