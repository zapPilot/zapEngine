import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { WhyItWorksV2 } from '../WhyItWorksV2';

describe('WhyItWorksV2', () => {
  describe('rendering', () => {
    it('renders section element', () => {
      const { container } = render(<WhyItWorksV2 />);
      expect(container.querySelector('.why-it-works-v2')).toBeInTheDocument();
    });

    it('renders section kicker', () => {
      render(<WhyItWorksV2 />);
      expect(screen.getByText('Why it works')).toBeInTheDocument();
    });

    it('renders main heading', () => {
      render(<WhyItWorksV2 />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        /What happens if we remove a feature/,
      );
    });

    it('renders subtitle', () => {
      render(<WhyItWorksV2 />);
      expect(
        screen.getByText(/Two leave-one-out ablations/),
      ).toBeInTheDocument();
    });
  });

  describe('attribution table', () => {
    it('renders table with role="table"', () => {
      const { container } = render(<WhyItWorksV2 />);
      expect(container.querySelector('.attribution-table')).toHaveAttribute(
        'role',
        'table',
      );
    });

    it('renders table header row', () => {
      render(<WhyItWorksV2 />);

      expect(screen.getByText('Feature')).toBeInTheDocument();
      expect(screen.getAllByText('If removed').length).toBeGreaterThan(0);
      expect(screen.getAllByText('What it does').length).toBeGreaterThan(0);
    });

    it('renders both feature rows', () => {
      render(<WhyItWorksV2 />);

      expect(screen.getByText('DMA stable gating')).toBeInTheDocument();
      expect(screen.getByText('Greed Sell Suppression')).toBeInTheDocument();
    });

    it('renders impact values', () => {
      render(<WhyItWorksV2 />);

      expect(screen.getByText('-96.96pp ROI')).toBeInTheDocument();
      expect(screen.getByText('-22.05pp ROI')).toBeInTheDocument();
    });
  });

  describe('disclaimer', () => {
    it('renders source attribution', () => {
      render(<WhyItWorksV2 />);
      expect(
        screen.getByText(/Source: leave-one-out backtests/),
      ).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has section with id', () => {
      const { container } = render(<WhyItWorksV2 />);
      expect(container.querySelector('#why-it-works')).toBeInTheDocument();
    });

    it('uses proper table roles', () => {
      const { container } = render(<WhyItWorksV2 />);
      expect(
        container.querySelector('[role="columnheader"]'),
      ).toBeInTheDocument();
      expect(container.querySelector('[role="cell"]')).toBeInTheDocument();
      expect(container.querySelector('[role="row"]')).toBeInTheDocument();
    });
  });
});
