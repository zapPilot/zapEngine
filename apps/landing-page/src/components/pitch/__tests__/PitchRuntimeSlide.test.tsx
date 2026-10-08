import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PITCH_RUNTIME } from '@/config/pitch';
import {
  CAPABILITIES,
  STATUS_LABEL,
  capabilityIds,
} from '@zapengine/zap-pilot-story/facts';
import { PitchRuntimeSlide } from '../PitchRuntimeSlide';

describe('PitchRuntimeSlide', () => {
  it('renders the loop with a status badge on every stage part', () => {
    const { container } = render(<PitchRuntimeSlide />);
    expect(
      screen.getByRole('heading', { level: 2, name: PITCH_RUNTIME.headline }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('.pitch-runtime-stage')).toHaveLength(
      PITCH_RUNTIME.stages.length,
    );
    for (const stage of PITCH_RUNTIME.stages) {
      expect(screen.getByText(stage.label)).toBeInTheDocument();
      for (const part of stage.parts) {
        expect(screen.getByText(part.text)).toBeInTheDocument();
      }
    }
  });

  it('shows the qualifier next to the advisory target and badges the footer', () => {
    const { container } = render(<PitchRuntimeSlide />);
    expect(screen.getByText('advisory')).toBeInTheDocument();
    const footerId = capabilityIds(PITCH_RUNTIME.footer.capability)[0]!;
    expect(
      container.querySelector(`.pitch-runtime-footer [data-capability]`),
    ).toHaveTextContent(STATUS_LABEL[CAPABILITIES[footerId].status]);
  });
});
