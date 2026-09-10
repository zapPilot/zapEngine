import { useEffect, useState } from 'react';

import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import type { SocialGrowthResponse } from '../../shared/types.js';
import { getJson } from '../api.js';
import { PlatformIdentity } from '../platform.js';
import styles from './GrowthJourneyPanel.module.css';

const SOCIAL_SOURCES = [
  ['threads', 'landingThreads30d'],
  ['x', 'landingX30d'],
  ['youtube', 'landingYoutube30d'],
  ['rednote', 'landingRednote30d'],
] as const;

export function GrowthJourneyPanel(props: {
  growth: SocialGrowthResponse | null;
}) {
  const [journey, setJourney] = useState<SocialGrowthJourney | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getJson<SocialGrowthJourney>('/api/growth-journey')
      .then((response) => {
        if (active) {
          setJourney(response);
        }
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        setError(
          cause instanceof Error ? cause.message : 'PostHog unavailable',
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const landing = journey?.landingVisitors30d ?? null;
  const cta = journey?.ctaUsers30d ?? null;
  const app = journey?.appVisitors30d ?? null;
  const activated = journey?.walletConnectedUsers30d ?? null;
  const waitlist =
    props.growth?.waitlist.status === 'ok'
      ? props.growth.waitlist.signups30d
      : null;
  const sources = [
    ...SOCIAL_SOURCES.map(([platform, key]) => ({
      id: platform,
      label: platform,
      value: journey?.[key] ?? null,
      platform,
    })),
    {
      id: 'direct',
      label: 'Direct',
      value: journey?.landingDirect30d ?? null,
      platform: null,
    },
    {
      id: 'other',
      label: 'Other',
      value: journey?.landingOther30d ?? null,
      platform: null,
    },
  ];
  const maxSource = Math.max(1, ...sources.map((source) => source.value ?? 0));
  const ctaRate = ratio(cta, landing);
  const journeyReady = journey?.status === 'ok';

  return (
    <section className={`panel ${styles['panel']}`} aria-label="Growth journey">
      <div className={styles['header']}>
        <div>
          <span className={styles['kicker']}>Cross-channel journey · 30d</span>
          <h2>哪裡把流量變成產品需求？</h2>
          <p>
            Sankey 寬度只使用可比較的 unique people。社群 views 是 aggregate
            reach，不會偽裝成逐人 CTR。
          </p>
        </div>
        <div className={styles['legend']}>
          <span>
            <i className={styles['solid']} /> PostHog person flow
          </span>
          <span>
            <i className={styles['dashed']} /> Cross-source count
          </span>
        </div>
      </div>

      {!journeyReady ? (
        <div className={styles['unavailable']}>
          <strong>Journey telemetry unavailable</strong>
          <span>
            {error ?? journey?.message ?? 'Waiting for PostHog data.'}
          </span>
        </div>
      ) : (
        <>
          <div className={styles['flow']}>
            <div className={styles['sources']} aria-label="Acquisition sources">
              <span className={styles['columnTitle']}>Acquisition</span>
              {sources.map((source) => (
                <div className={styles['source']} key={source.id}>
                  <div className={styles['sourceLabel']}>
                    <strong>
                      {source.platform ? (
                        <PlatformIdentity platform={source.platform} />
                      ) : (
                        source.label
                      )}
                    </strong>
                    <span>{formatCount(source.value)}</span>
                  </div>
                  <span className={styles['sourceTrack']}>
                    <i
                      style={{
                        width: `${Math.max(
                          4,
                          ((source.value ?? 0) / maxSource) * 100,
                        )}%`,
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>

            <FlowArrow />
            <JourneyStage
              label="Landing"
              note="PostHog unique people"
              value={landing}
            />
            <FlowArrow />
            <JourneyStage
              label="CTA"
              note={
                ctaRate === null
                  ? 'PostHog'
                  : `${formatPercent(ctaRate)} of landing`
              }
              value={cta}
            />
            <CrossSourceArrow />
            <JourneyStage
              label="Waitlist"
              note="Supabase durable rows"
              value={waitlist}
            />
            <CrossSourceArrow />
            <JourneyStage
              label="App"
              note="PostHog · not identity-linked"
              value={app}
            />
            <FlowArrow />
            <JourneyStage
              label="Activated"
              note="wallet_connected"
              value={activated}
            />
          </div>

          <div className={styles['decisionStrip']}>
            <div>
              <span>Observed website drop-off</span>
              <strong>
                {ctaRate === null
                  ? 'Not enough data'
                  : `${formatPercent(1 - ctaRate)} leave before waitlist CTA`}
              </strong>
            </div>
            <p>
              Waitlist 是 Supabase durable truth。虛線兩側是不同 source 的
              aggregate counts；目前不能宣稱某一個 waitlist email 就是之後的 app
              visitor。
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function JourneyStage(props: {
  label: string;
  note: string;
  value: number | null;
}) {
  return (
    <article className={styles['stage']}>
      <span>{props.label}</span>
      <strong>{formatCount(props.value)}</strong>
      <small>{props.note}</small>
    </article>
  );
}

function FlowArrow() {
  return (
    <span aria-hidden="true" className={styles['arrow']}>
      →
    </span>
  );
}

function CrossSourceArrow() {
  return (
    <span
      aria-hidden="true"
      className={`${styles['arrow']} ${styles['crossArrow']}`}
    >
      ⇢
    </span>
  );
}

function ratio(numerator: number | null, denominator: number | null) {
  return numerator !== null && denominator !== null && denominator > 0
    ? numerator / denominator
    : null;
}

function formatCount(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-US');
}

function formatPercent(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  });
}
