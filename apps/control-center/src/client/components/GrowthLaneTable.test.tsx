// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { unavailableGrowthJourney } from '../../shared/growth-journey.js';
import {
  unavailableDiscordCommunity,
  unavailableGrowthLaneSources,
  type OperationsGrowthResponse,
} from '../../shared/growth.js';
import { GrowthLaneTable } from './GrowthLaneTable.js';
import { GrowthJourneyPanel } from './GrowthJourneyPanel.js';

afterEach(cleanup);
function acquisition(): OperationsGrowthResponse {
  return {
    observedAt: '2026-09-19T00:00:00Z',
    windowDays: 30,
    status: 'unknown',
    journey: unavailableGrowthJourney('offline'),
    community: unavailableDiscordCommunity('offline', '2026-09-19T00:00:00Z'),
    lanes: [],
    laneSources: unavailableGrowthLaneSources('offline'),
  };
}
describe('growth lane table', () => {
  it('distinguishes loading, empty observations, and unavailable sources', () => {
    const { rerender } = render(<GrowthLaneTable acquisition={null} />);
    expect(screen.getByText('尚未載入')).toBeVisible();
    rerender(<GrowthLaneTable acquisition={acquisition()} />);
    expect(screen.getByText('尚無逐集漏斗資料')).toBeVisible();
    expect(screen.getByText('posthog: offline')).toBeVisible();
  });
  it('shows measured zero versus unknown and labels mixed windows', () => {
    const data = acquisition();
    data.lanes = [
      {
        episodeId: 'episode',
        platform: 'youtube',
        languageCode: 'en',
        title: null,
        postUrl: null,
        publishedAt: null,
        landingVisitors30d: null,
        ctaUsers30d: 0,
        waitlistSignups: 3,
        discordCtaUsers30d: null,
      },
    ];
    render(<GrowthLaneTable acquisition={data} />);
    const row = screen.getAllByRole('row')[1]!;
    expect(within(row).getByText('0')).toBeVisible();
    expect(within(row).getByText('3')).toBeVisible();
    expect(within(row).getAllByText('—')).toHaveLength(3);
    expect(screen.getByText(/視窗不同/)).toBeVisible();
  });
  it('renders community even when the PostHog journey is unavailable', () => {
    render(
      <GrowthJourneyPanel
        growth={null}
        journey={unavailableGrowthJourney('offline')}
        community={{
          status: 'ok',
          message: null,
          inviteCode: 'code',
          guildId: 'guild',
          guildName: 'Zap Pilot',
          memberCount: 37,
          presenceCount: null,
          inviteExpiresAt: null,
          observedAt: '2026-09-19T00:00:00Z',
        }}
      />,
    );
    expect(screen.getByText('37')).toBeVisible();
    expect(screen.getByText('guild total, not attributable')).toBeVisible();
    expect(screen.getByText('Journey telemetry unavailable')).toBeVisible();
  });
});
