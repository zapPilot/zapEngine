import type { FC } from 'react';

import { typingEnd } from '../../../primitives/typing';
import { cueAt } from '../../../timeline/beats';
import type { SceneOf } from '../assets';
import { useKokodeScene } from '../context';
import { BrandMark } from '../primitives/BrandMark';
import {
  ChatWindow,
  ReplyBubble,
  TYPE_SPEED,
  UserBubble,
} from '../primitives/ChatWindow';
import { Disclaimers } from '../primitives/Disclaimers';
import { Headline } from '../primitives/Headline';
import { Stage } from '../primitives/Stage';
import { Swap } from '../primitives/Swap';

/**
 * The turn: the wish (as easy as ChatGPT, kept in-house), the answer (an AI
 * that runs on site), and how it feels (a browser at kokode.local).
 */
export const TurnScene: FC<{ readonly scene: SceneOf<'turn'> }> = ({
  scene,
}) => {
  const { story, props } = useKokodeScene(scene);
  const solutionFrom = cueAt(scene, props.solutionCue);
  const browserFrom = cueAt(scene, props.browserCue);
  const prompt = story.DEMOS.chat.prompt;
  const typeFrom = browserFrom + 12;
  return (
    <Stage
      copy={
        <Swap
          at={solutionFrom}
          height={460}
          before={
            <Headline
              lines={story.BEATS[props.film.headline].title}
              eyebrow={story.BEATS.desiredWorld.eyebrow}
              from={cueAt(scene, props.desireCue)}
              size={66}
            />
          }
          after={
            <>
              <div style={{ marginBottom: 34 }}>
                <BrandMark size={64} />
              </div>
              <Headline
                lines={story.BEATS.solution.title}
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
            title={story.CHAT_UI.assistant}
            lines={story.DEMOS.chat.reply}
            from={typingEnd(prompt, typeFrom, TYPE_SPEED) + 8}
          />
        </ChatWindow>
      }
      notes={<Disclaimers notes={props.film.notes} from={browserFrom} />}
    />
  );
};
