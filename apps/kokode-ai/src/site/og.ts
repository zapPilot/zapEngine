import type { Story } from '@zapengine/kokode-story/localized';
import { markup } from './markup';

export const OG_STYLE = `*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#f5f5f7;color:#0d0d0f;font-family:"Hiragino Sans","PingFang TC",sans-serif}main{padding:52px 64px;height:500px}header{display:flex;align-items:center;gap:20px;font-size:28px;font-weight:700}header img{width:64px;height:64px}h1{font-size:68px;line-height:1.18;letter-spacing:-.03em;margin:30px 0 20px;color:#0071e3}p{font-size:27px;line-height:1.5;margin:0;max-width:1050px}footer{height:130px;background:#0d0d0f;color:#fff;padding:35px 64px;display:flex;align-items:center;justify-content:space-between;font-size:24px}`;

export function ogCardHtml(story: Story): string {
  const { BEATS, SITE } = story;
  const content = markup`<main><header><img src="/favicon.svg" alt="" />${SITE.name}</header><h1>${BEATS.hero.title.map((line) => markup`<span>${line}</span><br />`)}</h1><p>${BEATS.hero.body?.[0]}</p></main><footer><strong>${SITE.name}</strong><span>${SITE.footerTagline}</span></footer>`;
  return `<!doctype html><html lang="${story.locale}"><meta charset="utf-8"><style>${OG_STYLE}</style><body>${content.html}</body></html>`;
}

/** Exact render input, including layout, to detect stale generated cards. */
export function ogFingerprint(story: Story): string {
  return ogCardHtml(story);
}
