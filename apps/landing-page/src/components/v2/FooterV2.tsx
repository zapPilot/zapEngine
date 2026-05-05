/* eslint-disable @next/next/no-html-link-for-pages -- v1/v2 toggles intentionally use hard reloads so WebGL contexts fully tear down. */
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
      <a href="/">← back to v1</a>
    </footer>
  );
}
