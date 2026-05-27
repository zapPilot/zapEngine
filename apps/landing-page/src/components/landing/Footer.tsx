import { MESSAGES } from '@/config/messages';

export function Footer() {
  return (
    <footer className="footer">
      <span>{MESSAGES.common.brandName}</span>
      <span>liquid-metal</span>
      <span className="live-status">
        <span aria-hidden />
        mainnet status
      </span>
    </footer>
  );
}
