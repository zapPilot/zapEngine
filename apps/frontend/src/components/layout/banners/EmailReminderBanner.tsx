import { StickyBannerShell } from './StickyBannerShell';

interface EmailReminderBannerProps {
  onSubscribe: () => void;
  onDismiss: () => void;
}

export function EmailReminderBanner({
  onSubscribe,
  onDismiss,
}: EmailReminderBannerProps) {
  return (
    <StickyBannerShell>
      <div className="text-sm">
        💡 Subscribe to email reports for daily data updates. Currently updating
        weekly only.
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onDismiss}
          className="px-3 py-1.5 text-sm rounded-md bg-white/10 hover:bg-white/20 transition"
        >
          Later
        </button>
        <button
          onClick={onSubscribe}
          className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-700 transition text-white"
        >
          Subscribe Now
        </button>
      </div>
    </StickyBannerShell>
  );
}
