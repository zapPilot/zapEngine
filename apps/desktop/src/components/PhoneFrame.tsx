import type { ReactNode } from 'react';

interface PhoneFrameProps {
  children: ReactNode;
  /**
   * Render the faux iOS status bar (9:41 / signal / battery). Off by default —
   * a fake clock reads as broken on a desktop window; the frame silhouette is
   * enough to convey the mobile-style surface.
   */
  showStatusBar?: boolean;
}

/**
 * Centers a 412px-wide phone-style frame inside the desktop window, matching
 * the "Zap Pilot POC" mobile design. Content scrolls inside the frame.
 */
export function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div className="grid min-h-screen w-full place-items-center bg-bg p-4">
      <div
        className="relative flex w-full flex-col overflow-hidden bg-[#0a0a0a] text-ink"
        style={{
          maxWidth: 412,
          height: 'min(880px, calc(100vh - 32px))',
          borderRadius: 44,
          boxShadow:
            '0 44px 90px -30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.06)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
