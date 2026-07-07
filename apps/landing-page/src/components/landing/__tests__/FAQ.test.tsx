import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { FAQ } from '../FAQ';

describe('FAQ', () => {
  describe('rendering', () => {
    it('renders section element', () => {
      const { container } = render(<FAQ />);
      expect(container.querySelector('.faq')).toBeInTheDocument();
    });

    it('renders heading and subtitle', () => {
      render(<FAQ />);

      expect(screen.getByText('FAQ')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        /Before you connect a wallet/,
      );
      expect(screen.getByText(/self-custodial/)).toBeInTheDocument();
    });
  });

  describe('questions', () => {
    it('renders objection-handling questions', () => {
      render(<FAQ />);

      expect(
        screen.getByText('How is Zap Pilot truly non-custodial?'),
      ).toBeInTheDocument();
      expect(screen.getByText('What are the fees?')).toBeInTheDocument();
      expect(
        screen.getByText('Is the strategy open-source or verifiable?'),
      ).toBeInTheDocument();
    });

    it('uses native details elements', () => {
      const { container } = render(<FAQ />);

      expect(container.querySelectorAll('details.faq-item').length).toBe(11);
      expect(container.querySelectorAll('summary').length).toBe(11);
    });
  });

  describe('accessibility', () => {
    it('has section with id', () => {
      const { container } = render(<FAQ />);
      expect(container.querySelector('#faq')).toBeInTheDocument();
    });
  });
});
