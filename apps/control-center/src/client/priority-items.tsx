import type { OperationalPriority } from '../shared/types.js';
import type { OpsTriage } from '@zapengine/types/shared';
import { ProviderLink } from './components/ui/Links.js';
import type { RankedItem } from './components/ui/RankedList.js';
import { SourceBadge } from './components/ui/SourceBadge.js';
import { statusTone } from './components/ui/tone.js';
import { relativeTime } from './format.js';

const CLASSIFICATION_LABEL: Record<OpsTriage['classification'], string> = {
  engineering: '工程修復',
  owner: '需負責人決策',
  external: '外部依賴',
  insufficient_evidence: '待補證據',
};
const STAGE_LABEL: Record<OpsTriage['stage'], string> = {
  investigating: '診斷中',
  repair_pending: '待修復',
  pr_open: '修復 PR 已開啟',
  awaiting_deploy: '待部署',
  observing: '部署後驗證中',
  closure_pending: '待確認結案',
  blocked: '處理受阻',
};

/**
 * Ranked signals as list items.
 *
 * Today and Reliability both render this shape, differing only in how much of
 * each signal they show. One mapper rather than two near-identical ones is not
 * only tidier — `dup:check` runs jscpd at `threshold: 0`, and two copies of
 * this map body is exactly the clone it rejects.
 */
export function priorityItems(
  priorities: OperationalPriority[],
  options: { detail?: boolean; sourceLink?: boolean } = {},
): RankedItem[] {
  return priorities.map((priority) => {
    const { signal } = priority;
    return {
      aside: options.sourceLink ? (
        <ProviderLink label="Source" title={signal.title} url={signal.url} />
      ) : undefined,
      detail:
        options.detail && priority.followUp ? (
          <>
            {signal.detail}
            {priority.followUp.status === 'unavailable' ? (
              <p>修復追蹤無法取得，處理進度未知。</p>
            ) : null}
            {priority.followUp.unassessedTargets.length > 0 ? (
              <p>
                {priority.followUp.unassessedTargets.length} 個項目尚待診斷。
              </p>
            ) : null}
            {priority.followUp.status === 'available' &&
            priority.followUp.targetCoverage === 'partial' ? (
              <p>事件清單不完整，需繼續查詢其他事件。</p>
            ) : null}
            {priority.followUp.items.map((item) => (
              <p key={item.assessment.target}>
                {item.assessment.target} ·{' '}
                {CLASSIFICATION_LABEL[item.assessment.classification]} ·{' '}
                {STAGE_LABEL[item.assessment.stage]}
                {item.reviewRequired ? ' · 需要重新檢查' : ''}
                {item.assessment.prNumber ? (
                  <a
                    href={`https://github.com/zapPilot/zapEngine/pull/${item.assessment.prNumber}`}
                  >
                    {' '}
                    · PR #{item.assessment.prNumber}
                  </a>
                ) : null}
                <br />
                {item.assessment.reason}
                <br />
                下一步：{item.assessment.nextAction}
                <br />
                下次檢查：
                <time dateTime={item.assessment.reviewAfter}>
                  {new Date(item.assessment.reviewAfter).toLocaleString(
                    'zh-TW',
                  )}
                </time>
              </p>
            ))}
          </>
        ) : options.detail ? (
          signal.detail
        ) : undefined,
      id: signal.fingerprint,
      meta: (
        <>
          <SourceBadge source={signal.source} />
          <span>{relativeTime(signal.observedAt)}</span>
        </>
      ),
      title: signal.title,
      tone: statusTone(signal.status),
    };
  });
}
