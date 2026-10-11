import type { FC, ReactNode } from 'react';
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

import { BROWSER } from '../../../primitives/Browser';
import { enter, rise } from '../../../primitives/motion';
import { typedText } from '../../../primitives/typing';
import { TYPE_SPEED } from '../../kokode-clinic/primitives/ChatWindow';
import { Icon } from '../../kokode-clinic/primitives/icons';
import { theme } from '../../kokode-clinic/theme';
import { usePromo } from '../context';
import type { InterestId } from '../story';
import { Tile } from './Tile';

/** The console's page geometry inside the browser (1440×900). */
const SIDEBAR = 300;
const MAIN_CENTRE = SIDEBAR + (BROWSER.width - SIDEBAR) / 2;
const CARD = { width: 330, height: 190, gap: 30, top: 270, tile: 96 } as const;

/** Page position of each home card, in the order of the story's tiles. */
export function homeCard(index: number) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  const left = MAIN_CENTRE - CARD.width - CARD.gap / 2;
  const x = left + column * (CARD.width + CARD.gap);
  const y = CARD.top + row * (CARD.height + CARD.gap);
  return {
    x,
    y,
    /** Centre of the card's tile. */
    tileX: x + 34 + CARD.tile / 2,
    tileY: y + 34 + CARD.tile / 2,
  };
}

/** The page's centre, the default focus point for a browser on the rig. */
export const PAGE_CENTRE = {
  fx: BROWSER.width / 2,
  fy: BROWSER.height / 2,
} as const;

/** Where the sign-in button sits on the page. */
export const SIGN_IN = { x: MAIN_CENTRE, y: 612 } as const;

/** Where the thread column sits on the page. */
export const THREAD = { x: SIDEBAR + 150, width: 840, top: 96 } as const;

/** A press on the page: a disc that lands and a ring that spreads. */
export const Tap: FC<{
  readonly x: number;
  readonly y: number;
  readonly at: number;
}> = ({ x, y, at }) => {
  const frame = useCurrentFrame();
  const press = interpolate(frame, [at - 4, at, at + 10], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ring = rise(frame, at, 14);
  if (frame < at - 4 || frame > at + 16) return null;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x - 26,
          top: y - 26,
          width: 52,
          height: 52,
          borderRadius: 26,
          background: 'rgba(22, 22, 23, 0.22)',
          opacity: press,
          scale: 0.7 + press * 0.3,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x - 40,
          top: y - 40,
          width: 80,
          height: 80,
          borderRadius: 40,
          border: `3px solid ${theme.blue}`,
          opacity: (1 - ring) * 0.8,
          scale: 0.5 + ring * 0.9,
        }}
      />
    </>
  );
};

const Sidebar: FC<{ readonly active?: InterestId }> = ({ active }) => {
  const { story, fontFamily } = usePromo();
  const { boundary } = story.FIGURES;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: SIDEBAR,
        padding: '30px 22px',
        boxSizing: 'border-box',
        background: theme.bg,
        borderRight: `1px solid ${theme.line}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 10px 18px',
          fontSize: 27,
          fontWeight: 800,
          letterSpacing: '-0.04em',
          color: theme.ink,
        }}
      >
        <Img
          src={staticFile('brand/kokode-mark.svg')}
          style={{ width: 36, height: 36 }}
        />
        {story.SITE.name}
      </div>
      <div
        style={{
          padding: '0 10px 6px',
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: theme.muted,
        }}
      >
        {story.PROMO_UI.workflows}
      </div>
      {story.PROMO_UI.tiles.map((tile) => (
        <div
          key={tile.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '10px 12px',
            borderRadius: 14,
            background: tile.id === active ? theme.surface : 'transparent',
            boxShadow:
              tile.id === active ? '0 4px 14px rgba(0, 0, 0, 0.08)' : 'none',
            fontSize: 20,
            fontWeight: 600,
            color: theme.ink,
          }}
        >
          <Tile id={tile.id} size={36} />
          {tile.label}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderRadius: 999,
          background: theme.blueSoft,
          color: theme.blue,
          fontSize: 17,
          fontWeight: 700,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            background: theme.blue,
          }}
        />
        {boundary.inside} · {boundary.network}
      </div>
    </div>
  );
};

const Composer: FC<{
  readonly text?: string;
  readonly typeFrom?: number;
}> = ({ text = '', typeFrom = 0 }) => {
  const { story, fontFamily, lang } = usePromo();
  const frame = useCurrentFrame();
  const typed = typedText(text, frame, typeFrom, TYPE_SPEED);
  return (
    <div
      style={{
        position: 'absolute',
        left: SIDEBAR + 70,
        right: 70,
        bottom: 44,
        height: 76,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 12px 0 30px',
        borderRadius: 38,
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.06)',
        fontFamily,
        fontSize: lang === 'en' ? 22 : 24,
        color: typed ? theme.ink : theme.muted,
      }}
    >
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {typed || story.CHAT_UI.placeholder}
      </span>
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 54,
          height: 54,
          borderRadius: 27,
          background: theme.blue,
        }}
      >
        <Icon name="send" size={26} color={theme.surface} strokeWidth={2.2} />
      </span>
    </div>
  );
};

const SignIn: FC = () => {
  const { story, fontFamily } = usePromo();
  return (
    <div
      style={{
        position: 'absolute',
        left: MAIN_CENTRE - 240,
        top: 210,
        width: 480,
        padding: '44px 44px 40px',
        boxSizing: 'border-box',
        borderRadius: 28,
        background: theme.surface,
        boxShadow: '0 24px 70px rgba(0, 0, 0, 0.10)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
        fontFamily,
      }}
    >
      <Img
        src={staticFile('brand/kokode-mark.svg')}
        style={{ width: 76, height: 76 }}
      />
      <div
        style={{
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: '-0.04em',
          color: theme.ink,
        }}
      >
        {story.SITE.name}
      </div>
      {[0, 1].map((field) => (
        <div
          key={field}
          style={{
            width: '100%',
            height: 56,
            borderRadius: 14,
            border: `1px solid ${theme.line}`,
            background: theme.bg,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 20px',
            boxSizing: 'border-box',
          }}
        >
          {Array.from({ length: field === 0 ? 7 : 10 }, (_, dot) => (
            <span
              key={dot}
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                background: '#b8b8bd',
              }}
            />
          ))}
        </div>
      ))}
      <div
        style={{
          width: '100%',
          height: 58,
          marginTop: 8,
          borderRadius: 16,
          background: theme.blue,
          color: theme.surface,
          display: 'grid',
          placeItems: 'center',
          fontSize: 22,
          fontWeight: 700,
        }}
      >
        {story.FIGURES.boundary.login}
      </div>
    </div>
  );
};

const Home: FC<{ readonly from: number }> = ({ from }) => {
  const { story, fontFamily, lang } = usePromo();
  const frame = useCurrentFrame();
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: SIDEBAR,
          right: 0,
          top: 150,
          textAlign: 'center',
          fontFamily,
          fontSize: lang === 'en' ? 44 : 46,
          fontWeight: 800,
          letterSpacing: lang === 'en' ? '-0.03em' : '0',
          color: theme.ink,
          ...enter(frame, from, { distance: 18 }),
        }}
      >
        {story.PROMO_UI.greeting}
      </div>
      {story.PROMO_UI.tiles.map((tile, index) => {
        const card = homeCard(index);
        return (
          <div
            key={tile.id}
            style={{
              position: 'absolute',
              left: card.x,
              top: card.y,
              width: CARD.width,
              height: CARD.height,
              borderRadius: 26,
              background: theme.surface,
              border: `1px solid ${theme.line}`,
              boxShadow: '0 12px 34px rgba(0, 0, 0, 0.06)',
              fontFamily,
              ...enter(frame, from + 4 + index * 3, { distance: 26 }),
            }}
          >
            <Tile
              id={tile.id}
              size={CARD.tile}
              style={{ position: 'absolute', left: 34, top: 34 }}
            />
            <div
              style={{
                position: 'absolute',
                left: 34,
                right: 24,
                bottom: 26,
                fontSize: lang === 'en' ? 24 : 26,
                fontWeight: 700,
                color: theme.ink,
                whiteSpace: 'nowrap',
              }}
            >
              {tile.label}
            </div>
          </div>
        );
      })}
    </>
  );
};

/**
 * KOKODE as staff would see it at kokode.local: an illustrative screen (every
 * scene showing it carries `screenImage`). `view` picks sign-in, the workflow
 * home or a chat whose thread is `children`.
 */
export const Console: FC<{
  readonly view: 'signin' | 'home' | 'chat';
  readonly active?: InterestId;
  /** Frame the home view starts arriving. */
  readonly homeFrom?: number;
  readonly composer?: { readonly text: string; readonly typeFrom: number };
  readonly children?: ReactNode;
}> = ({ view, active, homeFrom = -100, composer, children }) => {
  const { fontFamily, lang } = usePromo();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: theme.surface,
        fontFamily,
      }}
    >
      <Sidebar active={view === 'chat' ? active : undefined} />
      {view === 'signin' ? <SignIn /> : null}
      {view === 'home' ? <Home from={homeFrom} /> : null}
      {view === 'chat' ? (
        <div
          style={{
            position: 'absolute',
            left: THREAD.x,
            top: THREAD.top,
            width: THREAD.width,
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            fontSize: lang === 'en' ? 24 : 27,
            lineHeight: 1.5,
            color: theme.ink,
          }}
        >
          {children}
        </div>
      ) : null}
      {view === 'signin' ? null : (
        <Composer text={composer?.text} typeFrom={composer?.typeFrom} />
      )}
    </div>
  );
};

/**
 * The chat thread at its place on the page, for a browser's 3D overlay: each
 * item can lift off the page by `lift[i]` px for an exploded view.
 */
export const Thread: FC<{
  readonly items: readonly ReactNode[];
  readonly lift?: readonly number[];
}> = ({ items, lift = [] }) => {
  const { lang } = usePromo();
  return (
    <div
      style={{
        position: 'absolute',
        left: THREAD.x,
        top: THREAD.top,
        width: THREAD.width,
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        fontSize: lang === 'en' ? 24 : 27,
        lineHeight: 1.5,
        color: theme.ink,
        transformStyle: 'preserve-3d',
      }}
    >
      {items.map((item, index) => (
        <div
          // Items are a fixed sequence per scene.
          key={index}
          style={{
            display: 'flex',
            flexDirection: 'column',
            transform: `translateZ(${lift[index] ?? 0}px)`,
            transformStyle: 'preserve-3d',
          }}
        >
          {item}
        </div>
      ))}
    </div>
  );
};
