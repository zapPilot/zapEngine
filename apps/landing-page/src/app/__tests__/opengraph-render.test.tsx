import { expect, it } from 'vitest';
import OpenGraphImage from '../opengraph-image';
import PitchOpenGraphImage from '../pitch/opengraph-image';
it.each([OpenGraphImage, PitchOpenGraphImage])(
  'renders a real PNG for %s',
  async (renderImage) => {
    const response = renderImage();
    const png = Buffer.from(await response.arrayBuffer());
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  },
);
