import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Text as SvgText, Path } from 'react-native-svg';
import { tokens } from '@zapengine/design-tokens/tokens';
import { Text } from '@/components/ui/Text';
import { useReducedMotion } from '@/components/ui/useReducedMotion';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
const AnimatedPath = Animated.createAnimatedComponent(Path);
const HEADLINE = tokens.type.headline;
const LINE_PATH = 'M3 12 C35 9 85 15 130 10 S215 7 260 11';
const SVG_BOX = '0 0 360 46';
const UNDERLINE_BOX = '0 0 264 22';
const FONT = 'Archivo Display';
const NO_FILL = 'none';
export function KineticHeadline() {
  const { t } = useContentLanguage();
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(1));
  useEffect(() => {
    progress.setValue(reduced ? 1 : 0);
    if (reduced) return;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: tokens.duration.ambient,
      easing: Easing.bezier(...tokens.easing.enter),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);
  return (
    <View
      accessibilityLabel={[
        t('firstRun.strategy'),
        t('firstRun.machine'),
        t('firstRun.yourWallet'),
      ].join(' ')}
    >
      <Animated.View
        style={{
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [tokens.space[3], 0],
              }),
            },
          ],
        }}
      >
        <Text variant="headline">{t('firstRun.strategy')}</Text>
      </Animated.View>
      <Svg
        viewBox={SVG_BOX}
        width="100%"
        height={HEADLINE.line + tokens.space[2]}
        accessible={false}
      >
        <SvgText
          x={0}
          y={HEADLINE.size}
          fill={NO_FILL}
          stroke={tokens.mode.night['ink-2']}
          strokeWidth={tokens.line.hair}
          fontFamily={FONT}
          fontSize={HEADLINE.size}
          letterSpacing={HEADLINE.tracking * HEADLINE.size}
        >
          {t('firstRun.machine')}
        </SvgText>
      </Svg>
      <Text variant="headline">{t('firstRun.yourWallet')}</Text>
      <Svg
        viewBox={UNDERLINE_BOX}
        width={tokens.size.control.lg * 5}
        height={tokens.space[6]}
        accessible={false}
      >
        <AnimatedPath
          d={LINE_PATH}
          fill={NO_FILL}
          stroke={tokens.mode.night['sign']}
          strokeWidth={tokens.line.strong}
          strokeDasharray={264}
          strokeDashoffset={progress.interpolate({
            inputRange: [0, 1],
            outputRange: [264, 0],
          })}
        />
      </Svg>
    </View>
  );
}
