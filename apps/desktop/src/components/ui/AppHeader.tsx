import { ZapLogo } from '@/components/ui/ZapLogo';

/** Home header: brand mark + name on the left, account avatar on the right. */
export function AppHeader() {
  return (
    <div className="flex items-center justify-between px-5 pt-1.5">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 place-items-center rounded-[9px]"
          style={{
            background: '#141416',
            border: '1px solid rgba(212,197,163,.3)',
          }}
        >
          <ZapLogo size={16} />
        </span>
        <span className="text-base font-semibold tracking-tight text-ink">
          Zap Pilot
        </span>
      </div>
      <span
        className="grid h-[34px] w-[34px] place-items-center rounded-full text-[13px] font-semibold"
        style={{
          background: 'linear-gradient(140deg,#2b2820,#141416)',
          border: '1px solid rgba(212,197,163,.3)',
          color: 'var(--accent)',
        }}
      >
        A
      </span>
    </div>
  );
}
