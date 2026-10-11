import type { CSSProperties, ReactNode } from 'react';

/** A desktop browser window at a 1440×900 viewport below its toolbar. */
export const BROWSER = { width: 1440, height: 900, bar: 56 } as const;

/** Where the page starts inside the window, for `rigStyle`'s inset. */
export const BROWSER_PAGE = { x: 0, y: BROWSER.bar } as const;

/**
 * A browser window with an address bar. `children` is the page (clipped to
 * the window); `overlay` shares the page's coordinates but lives in 3D above
 * it, so a card can lift off the page in an exploded view.
 */
export function Browser({
  address,
  fontFamily,
  children,
  overlay,
  light = 0,
  style,
}: {
  readonly address: string;
  readonly fontFamily: string;
  readonly children: ReactNode;
  readonly overlay?: ReactNode;
  /** Angle (deg) the window's sheen follows. */
  readonly light?: number;
  readonly style?: CSSProperties;
}) {
  const sheen = 50 + light * 1.2;
  return (
    <div
      style={{
        position: 'absolute',
        width: BROWSER.width,
        height: BROWSER.height + BROWSER.bar,
        transformStyle: 'preserve-3d',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 18,
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow:
            '0 50px 100px rgba(0, 0, 0, 0.16), 0 10px 24px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.08)',
        }}
      >
        <div
          style={{
            height: BROWSER.bar,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 22px',
            background: 'linear-gradient(180deg, #f6f6f8, #ececef)',
            borderBottom: '1px solid #dcdce0',
            boxSizing: 'border-box',
          }}
        >
          {['#ff5f57', '#febc2e', '#28c840'].map((dot) => (
            <span
              key={dot}
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                background: dot,
              }}
            />
          ))}
          <div
            style={{
              margin: '0 auto',
              height: 34,
              minWidth: 420,
              padding: '0 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              borderRadius: 10,
              background: '#ffffff',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
              fontFamily,
              fontSize: 17,
              fontWeight: 500,
              color: '#3a3a3c',
            }}
          >
            <svg width="12" height="15" viewBox="0 0 12 15" fill="#8e8e93">
              <path d="M2 7V4.8a4 4 0 0 1 8 0V7h.4A1.6 1.6 0 0 1 12 8.6v4.8a1.6 1.6 0 0 1-1.6 1.6H1.6A1.6 1.6 0 0 1 0 13.4V8.6A1.6 1.6 0 0 1 1.6 7zm1.6 0h4.8V4.8a2.4 2.4 0 0 0-4.8 0z" />
            </svg>
            {address}
          </div>
          <span style={{ width: 62 }} />
        </div>
        <div
          style={{
            position: 'relative',
            width: BROWSER.width,
            height: BROWSER.height,
            overflow: 'hidden',
          }}
        >
          {children}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(${115 + light * 0.6}deg, rgba(255, 255, 255, 0) ${sheen - 30}%, rgba(255, 255, 255, 0.14) ${sheen - 10}%, rgba(255, 255, 255, 0) ${sheen + 8}%)`,
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
      {overlay ? (
        <div
          style={{
            position: 'absolute',
            left: BROWSER_PAGE.x,
            top: BROWSER_PAGE.y,
            width: BROWSER.width,
            height: BROWSER.height,
            transformStyle: 'preserve-3d',
            transform: 'translateZ(1px)',
          }}
        >
          {overlay}
        </div>
      ) : null}
    </div>
  );
}
