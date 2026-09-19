import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import DiscordPage, { metadata } from '../page';
it('exports a noindex page with a usable fallback', () => {
  render(<DiscordPage />);
  expect(metadata.robots).toEqual({ index: false, follow: true });
  expect(
    screen.getByRole('link', { name: 'Continue to Discord' }),
  ).toBeInTheDocument();
});
