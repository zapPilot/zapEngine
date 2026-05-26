import { MESSAGES } from '@/config/messages';

export function FooterV2() {
  return (
    <footer className="footer-v2">
      <span>{MESSAGES.common.brandName}</span>
      <span>v2 · liquid-metal</span>
      <span className="live-status">
        <span aria-hidden />
        mainnet status
      </span>
    </footer>
  );
}
