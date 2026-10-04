import type { FC } from 'react';

import { typingEnd } from '../../../primitives/typing';
import { cueAt } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import {
  ChatWindow,
  LockedResult,
  RecordCard,
  TYPE_SPEED,
  UserBubble,
} from '../primitives/ChatWindow';
import { Disclaimers } from '../primitives/Disclaimers';
import { JaHeadline } from '../primitives/JaHeadline';
import { Stage } from '../primitives/Stage';
import { BEATS, DEMOS } from '../story';

/**
 * The two pains, one shape: a cloud chat window where the work stops. Patient
 * data cannot be sent (the send button locks); a medical image does not come
 * back (the result greys out under a lock).
 */
export const HookScene: FC<{
  readonly scene: SceneOf<'hook-patient' | 'hook-content'>;
}> = ({ scene }) => {
  const { props } = scene.spec;
  const headlineFrom = cueAt(scene, props.headlineCue);
  const lockFrom = cueAt(scene, props.lockCue);
  const [beat] = props.beats;
  const patient = props.variant === 'patient';
  const prompt = patient ? DEMOS.patient.prompt : DEMOS.image.prompt;
  return (
    <Stage
      copy={
        <JaHeadline
          lines={props.film.headline}
          eyebrow={beat === undefined ? undefined : BEATS[beat].eyebrow}
          from={headlineFrom}
          size={68}
        />
      }
      screen={
        patient ? (
          <ChatWindow
            variant="cloud"
            from={0}
            composer={{ text: prompt, typeFrom: 10, lockedFrom: lockFrom }}
          >
            <RecordCard
              title={DEMOS.patient.record.title}
              lines={DEMOS.patient.record.lines}
              from={4}
            />
          </ChatWindow>
        ) : (
          <ChatWindow
            variant="cloud"
            from={0}
            composer={{ text: '', typeFrom: 0 }}
          >
            <UserBubble text={prompt} typeFrom={8} variant="cloud" />
            <LockedResult
              from={typingEnd(prompt, 8, TYPE_SPEED) + 6}
              lockFrom={lockFrom}
            />
          </ChatWindow>
        )
      }
      notes={<Disclaimers notes={props.film.notes} />}
    />
  );
};
