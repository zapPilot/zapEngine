import type { Action, Store } from './types.js';
export const notifiable: Action['status'][] = [
  'confirmed',
  'failed',
  'needs_attention',
  'blocked',
];
export function message(action: Action, shareUrl: string): string {
  let heading: string;
  switch (action.status) {
    case 'confirmed':
      heading = '✅ 已確認：1 USDC 存入 Morpho。';
      break;
    case 'blocked':
      heading = '⛔ 安全審查擋下，沒有送出任何交易。';
      break;
    case 'failed':
      heading = action.steps.some((step) => step.outcome === 'reverted')
        ? '❌ 交易已上鏈但 revert。'
        : '❌ 執行失敗；此步驟遭拒絕或取消，未執行。先前步驟請見下方紀錄。';
      break;
    default:
      heading = '⚠️ 執行結果需人工確認。';
  }
  return [
    heading,
    action.decision?.rationale,
    action.last_error,
    ...action.steps.map(
      (step, i) =>
        `步驟 ${i + 1}: ${step.status}${step.hash ? ` https://basescan.org/tx/${step.hash}` : ''}`,
    ),
    shareUrl,
  ]
    .filter(Boolean)
    .join('\n');
}
export async function notify(
  store: Store,
  action: Action,
  podcastUrl: string,
  fallback: string,
  send: (chat: string, text: string, url: string) => Promise<void>,
  now = Date.now(),
): Promise<void> {
  if (!notifiable.includes(action.status) || action.notified_at) return;
  const context = await store.notificationContext(action.episode_id);
  if (
    !['completed', 'failed'].includes(context.videoStatus ?? '') &&
    now - Date.parse(action.updated_at) < 12 * 60 * 60_000
  )
    return;
  const chat =
    context.videoChat ||
    context.ingestChat ||
    fallback
      .split(',')
      .map((value) => value.trim())
      .find(Boolean);
  if (!chat) throw new Error('No notification recipient');
  const url = `${podcastUrl.replace(/\/$/, '')}/e/${action.episode_id}?lang=zh-Hant`;
  await send(chat, message(action, url), url);
  await store.cas(action, { notified_at: new Date(now).toISOString() });
}
