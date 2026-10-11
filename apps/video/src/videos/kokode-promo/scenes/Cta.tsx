import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';

import { Flash, Shake } from '../../../primitives/fx';
import { Lift, Slam } from '../../../primitives/Kinetic';
import { Sfx } from '../../../primitives/Sfx';
import { fitFontSize } from '../../../primitives/text';
import { cueAt } from '../../../timeline/beats';
import { BrandMark } from '../../kokode-clinic/primitives/BrandMark';
import { Disclaimers } from '../../kokode-clinic/primitives/Disclaimers';
import { theme } from '../../kokode-clinic/theme';
import type { SceneOf } from '../assets';
import { Headline } from '../ui/Headline';
import { headline } from '../ui/look';
import { useSceneClock } from './clock';

/** The ask, hit hard; then the brand, "AI, here." and where to go. Holds still. */
export const Cta: FC<{ readonly scene: SceneOf<'cta'> }> = ({ scene }) => {
  const { story, props, fontFamily, lang, frame } = useSceneClock(scene);
  const brandAt = cueAt(scene, props.brandCue);
  const eyebrow = story.BEATS.hero.eyebrow;
  const host = new URL(story.PROMO_LINK).host;
  const action = story.BEATS.hero.action?.label;
  return (
    <AbsoluteFill style={{ fontFamily, background: theme.surface }}>
      <Shake at={0} strength={12}>
        {frame < brandAt + 6 ? (
          <Headline
            lines={story.BEATS.cta.title}
            at={Math.max(2, cueAt(scene, props.askCue) - 6)}
            exit={brandAt - 8}
            width={1600}
            max={112}
            align="center"
            style={{ left: 0, right: 0, top: 250 }}
          />
        ) : null}
        <AbsoluteFill
          style={{ alignItems: 'center', justifyContent: 'center', gap: 36 }}
        >
          <Lift at={brandAt - 4}>
            <BrandMark size={84} />
          </Lift>
          <Slam
            text={eyebrow}
            at={brandAt}
            look={headline(
              fontFamily,
              lang,
              fitFontSize([eyebrow], 1400, 196),
              theme.blue,
            )}
          />
          <Lift
            at={brandAt + 10}
            style={{ display: 'flex', alignItems: 'center', gap: 26 }}
          >
            <span style={{ fontSize: 40, fontWeight: 700, color: theme.ink }}>
              {host}
            </span>
            {action === undefined ? null : (
              <span
                style={{
                  padding: '14px 30px',
                  borderRadius: 999,
                  background: theme.blue,
                  color: theme.surface,
                  fontSize: 30,
                  fontWeight: 700,
                }}
              >
                {action}
              </span>
            )}
          </Lift>
        </AbsoluteFill>
      </Shake>
      <Flash at={0} peak={0.5} />
      <Disclaimers notes={story.PROMO.cta.notes} from={brandAt} />
      <Sfx kind="impact" at={0} />
      <Sfx kind="pop" at={brandAt} />
    </AbsoluteFill>
  );
};
