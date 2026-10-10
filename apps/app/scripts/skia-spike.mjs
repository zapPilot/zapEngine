import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const require = createRequire(import.meta.url);
const skiaRoot = path.dirname(
  require.resolve('@shopify/react-native-skia/package.json'),
);
const skiaRequire = createRequire(skiaRoot + '/package.json');
(async () => {
  const init = skiaRequire('canvaskit-wasm/bin/full/canvaskit');
  global.CanvasKit = await init({
    locateFile: (f) => skiaRequire.resolve('canvaskit-wasm/bin/full/' + f),
  });
  const { JsiSkApi } = require(skiaRoot + '/lib/commonjs/skia/web');
  const Skia = JsiSkApi(global.CanvasKit);
  const surface = Skia.Surface.MakeOffscreen(390, 350);
  if (!surface) throw Error('No offscreen surface');
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('#101318'));
  canvas.concat([1, 0.15, 40, -0.1, 1, 80, 0.001, 0.0005, 1]);
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#82e6bb'));
  canvas.drawRect(Skia.XYWHRect(0, 0, 240, 150), paint);
  const fonts = Skia.TypefaceFontProvider.Make();
  const bytes = fs.readFileSync(
    root + '/packages/design-tokens/fonts/static/MartianMono-Text.ttf',
  );
  const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(
    Skia.Data.fromBytes(bytes),
  );
  if (!typeface) throw Error('Font not loaded');
  fonts.registerFont(typeface, 'Martian Mono');
  const builder = Skia.ParagraphBuilder.Make({}, fonts);
  builder.pushStyle({
    fontFamilies: ['Martian Mono'],
    fontSize: 18,
    color: Skia.Color('#101318'),
  });
  builder.addText('STRATEGY');
  const paragraph = builder.build();
  paragraph.layout(220);
  paragraph.paint(canvas, 10, 20);
  // These marks are absent from the bundled Mono subset. Draw vector marks.
  const marks = Skia.Path.MakeFromSVGString(
    'M10 60 L22 72 M14 72 L22 72 L22 64 M40 72 L52 60 M44 60 L52 60 L52 68 M70 62 L86 62 L82 58 M86 62 L82 66 M86 72 L70 72 L74 68 M70 72 L74 76',
  );
  if (!marks) throw Error('Vector marks not parsed');
  const ink = Skia.Paint();
  ink.setColor(Skia.Color('#101318'));
  ink.setStyle(1);
  ink.setStrokeWidth(1.5);
  ink.setAntiAlias(true);
  canvas.drawPath(marks, ink);
  ink.setStyle(0);
  canvas.drawCircle(110, 63, 1.5, ink);
  canvas.drawCircle(110, 72, 1.5, ink);
  surface.flush();
  const png = surface.makeImageSnapshot().encodeToBytes();
  fs.writeFileSync(process.argv[2] || '/tmp/zap-skia-spike.png', png);
  console.log(
    JSON.stringify({
      pngBytes: png.length,
      height: paragraph.getHeight(),
      glyphIds: Array.from(Skia.Font(typeface, 18).getGlyphIDs('↘↗⇄∶')),
    }),
  );
})();
