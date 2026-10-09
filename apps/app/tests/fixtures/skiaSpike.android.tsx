import { useMemo } from 'react';
import { registerRootComponent } from 'expo';
import { View, Text } from 'react-native';
import { Canvas, Picture, Skia, useFonts } from '@shopify/react-native-skia';
import deployment from '../../../../packages/zap-pilot-story/src/facts/data/strategy-deployment.json' with { type: 'json' };

function Spike() {
  const fonts = useFonts({
    Mono: [
      require('../../../../packages/design-tokens/fonts/static/MartianMono-Text.ttf'),
    ],
  });
  const picture = useMemo(() => {
    if (!fonts) return null;
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, 390, 350));
    canvas.clear(Skia.Color('#101318'));
    canvas.concat([1, 0.15, 40, -0.1, 1, 80, 0.001, 0.0005, 1]);
    const paint = Skia.Paint();
    paint.setColor(Skia.Color('#82e6bb'));
    canvas.drawRect(Skia.XYWHRect(0, 0, 240, 150), paint);
    const builder = Skia.ParagraphBuilder.Make({}, fonts);
    builder.pushStyle({
      fontFamilies: ['Mono'],
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
    console.log(
      'SKIA_SPIKE_OK',
      JSON.stringify({
        height: paragraph.getHeight(),
        jsonFields: Object.keys(deployment).length,
      }),
    );
    return recorder.finishRecordingAsPicture();
  }, [fonts]);
  return (
    <View style={{ flex: 1, backgroundColor: '#101318', paddingTop: 80 }}>
      <Text style={{ color: '#82e6bb', padding: 20 }}>
        Skia 2.6.2 perspective + Paragraph
      </Text>
      <Canvas style={{ width: 390, height: 350 }}>
        {picture && <Picture picture={picture} />}
      </Canvas>
    </View>
  );
}
registerRootComponent(Spike);
