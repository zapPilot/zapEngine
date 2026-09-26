// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EpisodeShareRoute from '@/app/e/[episodeId]';

const routerReplace = vi.hoisted(() => vi.fn());

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

vi.mock('@/screens/EpisodeDetailScreen', () => ({
  EpisodeDetailScreen: () => <div>episode detail</div>,
}));

describe('EpisodeShareRoute', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    routerReplace.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders the episode detail route without a second native redirect', async () => {
    await act(async () => root.render(<EpisodeShareRoute />));

    expect(container.textContent).toContain('episode detail');
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
