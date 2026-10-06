import type { FC, ReactNode } from 'react';

// Line icons in the Kokode site's style (apps/kokode-ai/src/site/icons.ts).
const PATHS = {
  pc: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  tablet: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="4" width="16" height="7" rx="1.5" />
      <rect x="4" y="13" width="16" height="7" rx="1.5" />
      <path d="M8 7.5h.01M8 16.5h.01" />
    </>
  ),
  wifi: (
    <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />
  ),
  blocked: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" />
    </>
  ),
  arrow: <path d="M4 12h16M14 6l6 6-6 6" />,
  cloud: (
    <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18z" />
  ),
  send: <path d="M5 12h13M13 6l6 6-6 6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export const Icon: FC<{
  readonly name: IconName;
  readonly size: number;
  readonly color: string;
  readonly strokeWidth?: number;
}> = ({ name, size, color, strokeWidth = 1.8 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: 'none' }}
  >
    {PATHS[name]}
  </svg>
);
