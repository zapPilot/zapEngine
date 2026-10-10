import type { FC } from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';

import { Shake } from '../../../primitives/fx';
import { Rise } from '../../../primitives/Kinetic';
import { enter, rise } from '../../../primitives/motion';
import { Sfx } from '../../../primitives/Sfx';
import { fitFontSize } from '../../../primitives/text';
import { cueAt } from '../../../timeline/beats';
import {
  ChatWindow,
  RecordCard,
} from '../../kokode-clinic/primitives/ChatWindow';
import { Disclaimers } from '../../kokode-clinic/primitives/Disclaimers';
import type { SceneOf } from '../assets';
import { Headline } from '../ui/Headline';
import { headline } from '../ui/look';
import { Tile, tileLook } from '../ui/Tile';
import { useSceneClock } from './clock';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/**
 * The four workflows land on the beat, one by one, then gather; it is exactly
 * the work a cloud AI cannot take, so the send button and the tiles lock.
 */
export const ColdOpen: FC<{ readonly scene: SceneOf<'cold-open'> }> = ({
  scene,
}) => {
  const { story, props, fontFamily, lang, frame, beat } = useSceneClock(scene);
  const tiles = story.PROMO_UI.tiles;
  const gather = beat(4);
  const split = beat(5);
  const lockAt = cueAt(scene, props.lockCue);
  const lock = rise(frame, lockAt, 10);
  const demo = story.DEMOS.patient;
  const title = story.BEATS.painPatient.title;
  const solo = frame < gather;
  // One tile at a time: each takes the stage two frames before its beat.
  const current = tiles.reduce(
    (shown, _, index) => (frame >= beat(index) - 2 ? index : shown),
    0,
  );
  const shown = tiles[current];
  return (
    <Shake at={lockAt} strength={10}>
      {solo ? (
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            background: `radial-gradient(1100px 760px at 34% 50%, ${tileLook(shown?.id ?? 'referral').fill}2e, transparent 70%)`,
          }}
        >
          {[shown].flatMap((tile) => {
            if (tile === undefined) return [];
            const at = beat(current);
            const flip = interpolate(frame, [at - 2, at + 6], [88, 0], {
              ...CLAMP,
              easing: Easing.out(Easing.cubic),
            });
            const size = fitFontSize(
              [tile.label],
              1240,
              lang === 'en' ? 170 : 210,
            );
            return (
              <div
                key={tile.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 56,
                  transform: `perspective(1200px) rotateY(${flip}deg)`,
                }}
              >
                <Tile id={tile.id} size={300} />
                <Rise
                  text={tile.label}
                  at={at}
                  stagger={1}
                  duration={10}
                  look={headline(fontFamily, lang, size)}
                />
              </div>
            );
          })}
        </AbsoluteFill>
      ) : null}
      {solo ? null : (
        <>
          <Headline
            lines={title}
            at={cueAt(scene, props.headlineCue)}
            width={1620}
            max={92}
            style={{ left: 150, top: 96 }}
          />
          <div
            style={{
              position: 'absolute',
              left: 150,
              top: 370,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 200px)',
              gap: 36,
            }}
          >
            {tiles.map((tile, index) => {
              const pop = interpolate(
                frame,
                [gather + index * 2, gather + index * 2 + 10],
                [0.4, 1],
                {
                  ...CLAMP,
                  easing: Easing.out(Easing.back(1.7)),
                },
              );
              return (
                <Tile
                  key={tile.id}
                  id={tile.id}
                  size={200}
                  locked={lock}
                  style={{ scale: pop, opacity: Math.min(1, pop * 1.6) }}
                />
              );
            })}
          </div>
          <div
            style={{
              position: 'absolute',
              left: 820,
              top: 350,
              ...enter(frame, split, { distance: 60 }),
            }}
          >
            <ChatWindow
              variant="cloud"
              from={split}
              width={950}
              composer={{
                text: demo.prompt,
                typeFrom: split + 8,
                lockedFrom: lockAt,
              }}
            >
              <RecordCard
                title={demo.record.title}
                lines={demo.record.lines}
                from={split + 4}
              />
            </ChatWindow>
          </div>
          <Disclaimers notes={story.PROMO['cold-open'].notes} from={split} />
        </>
      )}
      {tiles.map((tile, index) => (
        <Sfx key={tile.id} kind="pop" at={beat(index)} />
      ))}
      <Sfx kind="swish" at={gather} />
      <Sfx kind="whoosh" at={split - 4} />
      <Sfx kind="thud" at={lockAt} />
    </Shake>
  );
};
