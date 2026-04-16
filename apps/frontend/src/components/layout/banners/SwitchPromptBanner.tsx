import { StickyBannerShell } from "./StickyBannerShell";

interface SwitchPromptBannerProps {
  show: boolean;
  bundleUserName?: string | undefined;
  onSwitch: () => void;
}

/**
 * Compact visitor mode indicator banner.
 *
 * Shows a persistent, non-dismissable reminder when viewing another user's bundle.
 * Single CTA to switch back to own bundle - no "Stay" option needed.
 *
 * Design follows industry patterns from Notion, Figma, Google Docs.
 */
export function SwitchPromptBanner({
  show,
  bundleUserName,
  onSwitch,
}: SwitchPromptBannerProps) {
  if (!show) {
    return (
      <div
        data-testid="switch-prompt-banner"
        className="hidden"
        aria-hidden="true"
      >
        <span>Switch to my bundle</span>
      </div>
    );
  }

  const displayName = bundleUserName || "another user";

  return (
    <StickyBannerShell
      data-testid="switch-prompt-banner"
      cardClassName="!py-2 !px-4 !flex-row !items-center !justify-between !gap-2"
    >
      {/* Visitor mode indicator */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-indigo-400">👁️</span>
        <span className="text-indigo-100/80">
          Viewing <span className="font-medium text-white">{displayName}</span>
          &apos;s bundle
        </span>
      </div>

      {/* Single CTA */}
      <button
        data-testid="switch-button"
        onClick={onSwitch}
        className="px-3 py-1 text-xs font-medium rounded-md bg-indigo-500 hover:bg-indigo-400 text-white transition whitespace-nowrap"
      >
        Switch to mine
      </button>
    </StickyBannerShell>
  );
}
