import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PITCH_ROADMAP } from '@/config/pitch';
import {
  CAPABILITIES,
  type CapabilityId,
} from '@zapengine/zap-pilot-story/facts';
import { PitchRoadmapSlide } from '../PitchRoadmapSlide';

function column(label: string) {
  return screen.getByRole('heading', { level: 3, name: label })
    .parentElement as HTMLElement;
}

describe('PitchRoadmapSlide', () => {
  it('fills "Now" with every capability that is not planned', () => {
    render(<PitchRoadmapSlide />);
    const now = column(PITCH_ROADMAP.now.label);
    const notPlanned = (Object.keys(CAPABILITIES) as CapabilityId[]).filter(
      (id) => CAPABILITIES[id].status !== 'planned',
    );
    expect(within(now).getAllByRole('listitem')).toHaveLength(
      notPlanned.length,
    );
    expect(now.querySelector('[data-status="planned"]')).toBeNull();
    for (const id of notPlanned) {
      expect(within(now).getByText(CAPABILITIES[id].label)).toBeInTheDocument();
    }
  });

  it('keeps Next and Later to planned capabilities, as a sequence not dates', () => {
    render(<PitchRoadmapSlide />);
    for (const group of [PITCH_ROADMAP.next, PITCH_ROADMAP.later]) {
      const element = column(group.label);
      const statuses = Array.from(
        element.querySelectorAll('[data-status]'),
      ).map((badge) => badge.getAttribute('data-status'));
      expect(statuses).toHaveLength(group.items.length);
      expect(new Set(statuses)).toEqual(new Set(['planned']));
    }
    expect(screen.getByText(PITCH_ROADMAP.footer)).toBeInTheDocument();
  });
});
