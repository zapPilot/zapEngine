import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { FAQV2 } from '../FAQV2';

describe('FAQV2', () => {
  describe('rendering', () => {
    it('renders section element', () => {
      const { container } = render(<FAQV2 />);
      expect(container.querySelector('.faq-v2')).toBeInTheDocument();
    });

    it('renders heading and subtitle', () => {
      render(<FAQV2 />);

      expect(screen.getByText('FAQ')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        /Before you connect a wallet/,
      );
      expect(screen.getByText(/self-custodial/)).toBeInTheDocument();
    });
  });

  describe('questions', () => {
    it('renders objection-handling questions', () => {
      render(<FAQV2 />);

      expect(
        screen.getByText('How is Zap Pilot truly non-custodial?'),
      ).toBeInTheDocument();
      expect(screen.getByText('What are the fees?')).toBeInTheDocument();
      expect(
        screen.getByText('Is the strategy open-source or verifiable?'),
      ).toBeInTheDocument();
    });

    it('uses native details elements', () => {
      const { container } = render(<FAQV2 />);

      expect(container.querySelectorAll('details.faq-item').length).toBe(8);
      expect(container.querySelectorAll('summary').length).toBe(8);
    });
  });

  describe('accessibility', () => {
    it('has section with id', () => {
      const { container } = render(<FAQV2 />);
      expect(container.querySelector('#faq')).toBeInTheDocument();
    });
  });
});
