// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';

import { LanguageIdentity, PlatformIdentity } from './platform.js';

afterEach(cleanup);

describe('shared platform identity rendering', () => {
  it.each([
    ['x', 'X', '/platform-icons/x.svg'],
    ['threads', 'Threads', '/platform-icons/threads.svg'],
    ['rednote', 'Rednote', '/platform-icons/rednote.svg'],
    ['youtube', 'YouTube', '/platform-icons/youtube.svg'],
  ])('renders %s with its canonical label and icon', (platform, label, iconPath) => {
    const { container } = render(<PlatformIdentity platform={platform} />);

    expect(screen.getByText(label)).toBeVisible();
    expect(container.querySelector('img')).toHaveAttribute('src', iconPath);
  });

  it('keeps unknown platform and language identities readable without inventing assets', () => {
    const { container } = render(
      <>
        <PlatformIdentity platform="mastodon" />
        <LanguageIdentity languageCode="ko" />
      </>,
    );

    expect(screen.getByText('mastodon')).toBeVisible();
    expect(screen.getByText('ko')).toBeVisible();
    expect(screen.getByText('🌐')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
