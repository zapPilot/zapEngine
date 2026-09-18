import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChainIdentity } from '../icons';

describe('ChainIdentity fallback', () => {
  it('renders an unknown chain id with the caller-provided prefix', () => {
    const { container } = render(
      <ChainIdentity chainId={99_999} unknownPrefix="Chain " />,
    );

    expect(screen.getByText('Chain 99999')).toBeVisible();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });
});
