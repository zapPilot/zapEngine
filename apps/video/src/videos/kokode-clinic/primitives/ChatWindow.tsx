import type { FC, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';

import { enter, rise } from '../../../primitives/motion';
import { typedText } from '../../../primitives/typing';
import { useKokode } from '../context';
import { theme } from '../theme';
import { Icon } from './icons';

/** Frames per character while a prompt types itself. */
export const TYPE_SPEED = 1;

type Variant = 'kokode' | 'cloud';

const ACCENT: Record<Variant, string> = {
  kokode: theme.blue,
  cloud: '#3a3a3c',
};

/** The input row: a prompt being typed, and a send button that can lock. */
const Composer: FC<{
  readonly variant: Variant;
  readonly text?: string;
  readonly typeFrom?: number;
  readonly lockedFrom?: number;
}> = ({ variant, text = '', typeFrom = 0, lockedFrom }) => {
  const { story } = useKokode();
  const frame = useCurrentFrame();
  const typed = typedText(text, frame, typeFrom, TYPE_SPEED);
  const locked = lockedFrom === undefined ? 0 : rise(frame, lockedFrom, 10);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 14px 14px 24px',
        borderTop: '1px solid #e5e5e7',
      }}
    >
      <span
        style={{
          flex: 1,
          minHeight: 34,
          color: typed ? theme.ink : theme.muted,
          opacity: 1 - locked * 0.45,
        }}
      >
        {typed || story.CHAT_UI.placeholder}
      </span>
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 56,
          height: 56,
          borderRadius: 28,
          background: locked > 0.5 ? '#c7c7cc' : ACCENT[variant],
          transform: `scale(${1 + Math.sin(locked * Math.PI) * 0.12})`,
        }}
      >
        <Icon
          name={locked > 0.5 ? 'lock' : 'send'}
          size={28}
          color={theme.surface}
          strokeWidth={2.2}
        />
      </span>
    </div>
  );
};

/**
 * A chat app window. `kokode` is the browser at kokode.local; `cloud` is a
 * neutral, unbranded cloud AI service, never a real product.
 */
export const ChatWindow: FC<{
  readonly variant: Variant;
  readonly from: number;
  readonly children?: ReactNode;
  readonly composer?: {
    readonly text: string;
    readonly typeFrom: number;
    readonly lockedFrom?: number;
  };
  readonly width?: number;
}> = ({ variant, from, children, composer, width = 880 }) => {
  const { fontFamily, lang, story } = useKokode();
  const frame = useCurrentFrame();
  const kokode = variant === 'kokode';
  return (
    <div
      style={{
        width,
        overflow: 'hidden',
        borderRadius: 30,
        background: theme.surface,
        border: '1px solid rgba(0, 0, 0, 0.08)',
        boxShadow: '0 30px 80px rgba(0, 0, 0, 0.10)',
        fontFamily,
        fontSize: lang === 'en' ? 22 : 28,
        lineHeight: 1.5,
        color: theme.ink,
        ...enter(frame, from, { distance: 40 }),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '16px 22px',
          background: '#f2f2f4',
          borderBottom: '1px solid #e5e5e7',
        }}
      >
        <span style={{ display: 'flex', gap: 9 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((dot) => (
            <span
              key={dot}
              style={{
                width: 15,
                height: 15,
                borderRadius: 8,
                background: dot,
              }}
            />
          ))}
        </span>
        <span
          style={{
            flex: 1,
            marginRight: 70,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 10,
            padding: '6px 18px',
            borderRadius: 999,
            background: theme.surface,
            color: theme.muted,
            fontSize: 22,
          }}
        >
          {kokode ? null : <Icon name="cloud" size={24} color={theme.muted} />}
          {kokode ? story.DEMOS.chat.address : story.CHAT_UI.cloud}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          padding: 26,
          minHeight: 300,
        }}
      >
        {children}
      </div>
      {composer === undefined ? null : (
        <Composer variant={variant} {...composer} />
      )}
    </div>
  );
};

/** What the user asked, typed in and sent. */
export const UserBubble: FC<{
  readonly text: string;
  readonly typeFrom: number;
  readonly variant: Variant;
  /** Frames per character; the film types at TYPE_SPEED. */
  readonly speed?: number;
}> = ({ text, typeFrom, variant, speed = TYPE_SPEED }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        alignSelf: 'flex-end',
        maxWidth: '90%',
        padding: '14px 22px',
        borderRadius: '24px 24px 6px 24px',
        background: ACCENT[variant],
        color: theme.surface,
        ...enter(frame, typeFrom - 4, { duration: 8, distance: 10 }),
      }}
    >
      {typedText(text, frame, typeFrom, speed)}
    </div>
  );
};

/** The AI's answer, line by line; `draft` marks it as a draft to check. */
export const ReplyBubble: FC<{
  readonly title: string;
  readonly lines: readonly string[];
  readonly from: number;
  readonly draft?: boolean;
}> = ({ title, lines, from, draft = false }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '94%',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '16px 22px',
        borderRadius: '24px 24px 24px 6px',
        background: draft ? '#fafafa' : '#f2f2f4',
        border: draft ? '2px dashed #b8b8bd' : '2px solid transparent',
        ...enter(frame, from, { duration: 10, distance: 12 }),
      }}
    >
      <span style={{ fontSize: 22, fontWeight: 700, color: theme.blue }}>
        {title}
      </span>
      {lines.map((line, index) => (
        <span key={line} style={{ ...enter(frame, from + 6 + index * 8) }}>
          {line}
        </span>
      ))}
    </div>
  );
};

/** A fictional patient record, as attached to the conversation. */
export const RecordCard: FC<{
  readonly title: string;
  readonly lines: readonly string[];
  readonly from: number;
}> = ({ title, lines, from }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 20px',
        borderRadius: 18,
        border: `1px solid ${theme.line}`,
        fontSize: 24,
        lineHeight: 1.45,
        ...enter(frame, from, { distance: 16 }),
      }}
    >
      <span style={{ fontSize: 20, fontWeight: 700, color: theme.muted }}>
        {title}
      </span>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
};

/**
 * A result that never arrives: the area greys out and a lock appears. No
 * error text and no service name, by design.
 */
export const LockedResult: FC<{
  readonly from: number;
  readonly lockFrom: number;
}> = ({ from, lockFrom }) => {
  const frame = useCurrentFrame();
  const lock = rise(frame, lockFrom, 14);
  return (
    <div
      style={{
        position: 'relative',
        alignSelf: 'flex-start',
        width: '70%',
        aspectRatio: '16 / 10',
        borderRadius: 22,
        background: `linear-gradient(110deg, #ececee 30%, #f6f6f8 50%, #ececee 70%)`,
        backgroundSize: '220% 100%',
        backgroundPosition: `${100 - ((frame - from) % 60) * (100 / 60)}% 0`,
        filter: `grayscale(${lock})`,
        ...enter(frame, from, { distance: 12 }),
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 22,
          background: `rgba(210, 210, 215, ${0.7 * lock})`,
          opacity: lock,
          transform: `scale(${0.8 + lock * 0.2})`,
        }}
      >
        <Icon name="lock" size={96} color="#6e6e73" strokeWidth={1.6} />
      </span>
    </div>
  );
};
