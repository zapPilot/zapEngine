import type { FC } from 'react';

import { typingEnd } from '../../../primitives/typing';
import { cueAt } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { BrandMark } from '../primitives/BrandMark';
import {
  ChatWindow,
  ReplyBubble,
  TYPE_SPEED,
  UserBubble,
} from '../primitives/ChatWindow';
import { Disclaimers } from '../primitives/Disclaimers';
import { JaHeadline } from '../primitives/JaHeadline';
import { Stage } from '../primitives/Stage';
import { Swap } from '../primitives/Swap';
import { BEATS, CHAT_UI, DEMOS } from '../story';

/**
 * The turn: the wish (as easy as ChatGPT, kept in-house), the answer (an AI
 * that runs on site), and how it feels (a browser at kokode.local).
 */
export const TurnScene: FC<{ readonly scene: SceneOf<'turn'> }> = ({
  scene,
}) => {
  const { props } = scene.spec;
  const solutionFrom = cueAt(scene, props.solutionCue);
  const browserFrom = cueAt(scene, props.browserCue);
  const prompt = DEMOS.chat.prompt;
  const typeFrom = browserFrom + 12;
  return (
    <Stage
      copy={
        <Swap
          at={solutionFrom}
          height={460}
          before={
            <JaHeadline
              lines={props.film.headline}
              eyebrow={BEATS.desiredWorld.eyebrow}
              from={cueAt(scene, props.desireCue)}
              size={66}
            />
          }
          after={
            <>
              <div style={{ marginBottom: 34 }}>
                <BrandMark size={64} />
              </div>
              <JaHeadline
                lines={BEATS.solution.title}
                from={solutionFrom + 6}
                size={72}
              />
            </>
          }
        />
      }
      screen={
        <ChatWindow variant="kokode" from={browserFrom}>
          <UserBubble text={prompt} typeFrom={typeFrom} variant="kokode" />
          <ReplyBubble
            title={CHAT_UI.assistant}
            lines={DEMOS.chat.reply}
            from={typingEnd(prompt, typeFrom, TYPE_SPEED) + 8}
          />
        </ChatWindow>
      }
      notes={<Disclaimers notes={props.film.notes} from={browserFrom} />}
    />
  );
};
