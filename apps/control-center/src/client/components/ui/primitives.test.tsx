// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  OperationalStatus,
  OperationsSource,
} from '../../../shared/types.js';
import { BarRows } from './BarRows.js';
import { Card } from './Card.js';
import { EmptyState } from './EmptyState.js';
import { FlowBand } from './FlowBand.js';
import { ProviderLink, ViewAllLink } from './Links.js';
import { MiniBars } from './MiniBars.js';
import { Pill, StatusPill } from './Pill.js';
import { RankedList } from './RankedList.js';
import { SourceBadge } from './SourceBadge.js';
import { Stat } from './Stat.js';
import { Timeline } from './Timeline.js';
import { statusTone, toneClass, type Tone } from './tone.js';

afterEach(cleanup);

const TONES: Tone[] = [
  'accent',
  'danger',
  'info',
  'neutral',
  'success',
  'warning',
];

describe('tone scale', () => {
  it.each(TONES)('maps %s to a class', (tone) => {
    expect(toneClass(tone)).toBe(`cc-tone-${tone}`);
  });

  it('falls back to neutral when no tone is given', () => {
    expect(toneClass(undefined)).toBe('cc-tone-neutral');
  });

  it.each([
    ['critical', 'danger'],
    ['degraded', 'warning'],
    ['healthy', 'success'],
    ['unknown', 'neutral'],
  ] as [OperationalStatus, Tone][])('reads %s as %s', (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });

  it('treats an absent status as unknown rather than healthy', () => {
    expect(statusTone(undefined)).toBe('neutral');
  });
});

describe('Card', () => {
  it('renders the heading, subtitle, icon and action together', () => {
    const onClick = vi.fn();
    render(
      <Card
        action={<ViewAllLink label="查看全部" onClick={onClick} />}
        icon={Activity}
        subtitle="Recent operational signals"
        title="關鍵警報"
        tone="danger"
      >
        <p>body</p>
      </Card>,
    );
    expect(
      screen.getByRole('heading', { name: '關鍵警報' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Recent operational signals')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /查看全部/ }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('omits the chip, subtitle and action when they are not supplied', () => {
    const { container } = render(
      <Card title="Bare">
        <p>body</p>
      </Card>,
    );
    expect(container.querySelector('.cc-icon-chip')).toBeNull();
    expect(container.querySelector('.cc-card-subtitle')).toBeNull();
    expect(container.querySelector('.cc-card-action')).toBeNull();
  });
});

describe('Stat', () => {
  it.each(['sm', 'md', 'lg'] as const)('renders at size %s', (size) => {
    const { container } = render(
      <Stat label="Waitlist" size={size} value="675" />,
    );
    expect(container.querySelector(`.cc-stat-${size}`)).not.toBeNull();
    expect(screen.getByText('675')).toBeInTheDocument();
  });

  it('renders a caption only when one is given', () => {
    const { container } = render(<Stat label="Spend" value="$0" />);
    expect(container.querySelector('.cc-stat-caption')).toBeNull();
  });
});

describe('Pill', () => {
  it.each(['outline', 'soft', 'solid'] as const)(
    'renders the %s variant',
    (variant) => {
      const { container } = render(
        <Pill tone="info" variant={variant}>
          label
        </Pill>,
      );
      expect(container.querySelector(`.cc-pill-${variant}`)).not.toBeNull();
    },
  );

  it('names the health status in words, not only colour', () => {
    render(<StatusPill status="critical" />);
    expect(screen.getByText('Action required')).toBeInTheDocument();
  });

  it('describes an absent status as unknown', () => {
    render(<StatusPill status={undefined} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});

describe('RankedList', () => {
  it('numbers items in order and never shows a score', () => {
    render(
      <RankedList
        empty={<EmptyState detail="none" title="Nothing" />}
        items={[
          { detail: 'first detail', id: 'a', title: 'First', tone: 'danger' },
          { id: 'b', title: 'Second' },
        ]}
      />,
    );
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('first detail')).toBeInTheDocument();
    expect(screen.queryByText('86')).toBeNull();
  });

  it('renders the empty state instead of an empty list', () => {
    const { container } = render(
      <RankedList
        empty={<EmptyState detail="No signal crossed the bar." title="Clear" />}
        items={[]}
      />,
    );
    expect(container.querySelector('ol')).toBeNull();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });
});

describe('FlowBand', () => {
  it('shows a step conversion across a solid connector', () => {
    render(
      <FlowBand
        stages={[
          { id: 'landing', label: 'Landing', value: '179' },
          {
            connector: 'solid',
            id: 'cta',
            label: 'CTA',
            rate: '0.6%',
            value: '1',
          },
        ]}
      />,
    );
    expect(screen.getByText('0.6%')).toBeInTheDocument();
  });

  it('drops the rate across a dashed connector, because the two stages count different populations', () => {
    render(
      <FlowBand
        stages={[
          { id: 'cta', label: 'CTA', value: '1' },
          {
            connector: 'dashed',
            id: 'waitlist',
            label: 'Waitlist',
            rate: '100%',
            value: '0',
          },
        ]}
      />,
    );
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('draws no connector before the first stage or where one is suppressed', () => {
    const { container } = render(
      <FlowBand
        stages={[
          { id: 'a', label: 'A', value: '1' },
          { connector: 'none', id: 'b', label: 'B', value: '2' },
        ]}
      />,
    );
    expect(container.querySelectorAll('.cc-flow-link')).toHaveLength(0);
  });
});

describe('BarRows', () => {
  it('scales bars against the largest weight and skips uncollected rows', () => {
    const { container } = render(
      <BarRows
        rows={[
          { id: 'supabase', label: 'Supabase', value: '$25.00', weight: 25 },
          { id: 'fly', label: 'Fly.io', value: '—', weight: null },
        ]}
      />,
    );
    const filled = container.querySelectorAll('.cc-track i');
    expect(filled).toHaveLength(1);
    expect(filled[0]).toHaveStyle({ width: '100%' });
  });
});

describe('MiniBars', () => {
  it('keeps a gap in collection visible', () => {
    const { container } = render(
      <MiniBars
        ariaLabel="Daily spend"
        bars={[
          { id: 'd1', label: 'Mon', value: 4 },
          { id: 'd2', label: 'Tue', value: null },
        ]}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Daily spend' }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[data-empty="true"]')).toHaveLength(1);
  });
});

describe('Timeline', () => {
  it('renders events with their time label', () => {
    render(
      <Timeline
        empty={<EmptyState detail="nothing yet" title="Quiet" />}
        events={[
          {
            id: 'e1',
            timeLabel: '2 hours ago',
            title: 'Render recovered',
            tone: 'success',
          },
        ]}
      />,
    );
    expect(screen.getByText('Render recovered')).toBeInTheDocument();
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('falls back to the empty state', () => {
    render(
      <Timeline
        empty={<EmptyState detail="No recorded action." title="Quiet" />}
        events={[]}
      />,
    );
    expect(screen.getByText('Quiet')).toBeInTheDocument();
  });
});

describe('SourceBadge and ProviderLink', () => {
  it.each([
    'github-actions',
    'sentry',
    'fly',
    'posthog',
    'cost-ledger',
  ] as OperationsSource[])('labels the %s source', (source) => {
    const { container } = render(<SourceBadge source={source} />);
    expect(container.querySelector('.cc-src')).not.toBeNull();
  });

  it('renders nothing when a signal has no console to link to', () => {
    const { container } = render(
      <ProviderLink label="Source" title="A signal" url={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('opens the provider console in a new tab when a URL exists', () => {
    render(
      <ProviderLink
        label="Source"
        title="A signal"
        url="https://example.test/run/1"
      />,
    );
    const link = screen.getByRole('link', { name: 'Source: A signal' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});
