import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Section } from '../Section';

describe('Section', () => {
  it('renders the shared V2 section scaffold', () => {
    const { container } = render(
      <Section
        id="example"
        kicker="Example kicker"
        title="Example title"
        subtitle="Example subtitle"
        className="example-section"
        ariaLabelledBy="example-title"
      >
        <div>Example body</div>
      </Section>,
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('v2-section', 'example-section');
    expect(section).toHaveAttribute('id', 'example');
    expect(section).toHaveAttribute('aria-labelledby', 'example-title');
    expect(container.querySelector('.section-inner')).toBeInTheDocument();
    expect(screen.getByText('Example kicker')).toHaveClass('section-kicker');
    expect(
      screen.getByRole('heading', { name: 'Example title' }),
    ).toHaveAttribute('id', 'example-title');
    expect(screen.getByText('Example subtitle')).toBeInTheDocument();
    expect(screen.getByText('Example body')).toBeInTheDocument();
  });

  it('supports section-specific inner classes without changing the outer scaffold', () => {
    const { container } = render(
      <Section className="faq-v2" innerClassName="faq-inner">
        <div>FAQ body</div>
      </Section>,
    );

    expect(container.querySelector('section')).toHaveClass('v2-section');
    expect(container.querySelector('.section-inner')).toHaveClass('faq-inner');
  });
});
