import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { PitchSlide } from '../PitchSlide';

describe('PitchSlide', () => {
  it('emits the canonical id/data attributes', () => {
    const { container } = render(
      <PitchSlide id="cover" index={0}>
        <p>body</p>
      </PitchSlide>,
    );
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'slide-cover');
    expect(section).toHaveAttribute('data-slide-id', 'cover');
    expect(section).toHaveAttribute('data-slide-index', '0');
  });

  it('renders kicker / title / subtitle when provided and labels the section', () => {
    const { container, getByText } = render(
      <PitchSlide
        id="problem"
        index={1}
        kicker="Problem"
        title="Headline"
        subtitle="Subtitle"
      >
        <p>x</p>
      </PitchSlide>,
    );
    expect(getByText('Problem')).toBeInTheDocument();
    expect(getByText('Headline')).toBeInTheDocument();
    expect(getByText('Subtitle')).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveAttribute(
      'aria-labelledby',
      'pitch-problem-title',
    );
  });

  it('omits aria-labelledby when no title is provided', () => {
    const { container } = render(
      <PitchSlide id="solution" index={2} variant="wrapped">
        <p>x</p>
      </PitchSlide>,
    );
    const section = container.querySelector('section');
    expect(section).not.toHaveAttribute('aria-labelledby');
    expect(section).toHaveClass('pitch-slide--wrapped');
  });

  it('accepts a custom className', () => {
    const { container } = render(
      <PitchSlide id="ask" index={8} className="extra">
        <p>x</p>
      </PitchSlide>,
    );
    expect(container.querySelector('section')).toHaveClass('extra');
  });
});
