// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell.js';

afterEach(cleanup);

describe('AppShell coverage', () => {
  it('names the snapshot time once one has arrived', () => {
    render(
      <AppShell
        activeView="home"
        generatedAt={new Date(Date.now() - 30_000).toISOString()}
        loading={false}
        onNavigate={vi.fn()}
        onRefresh={vi.fn()}
        subtitle="sub"
        title="今日"
      >
        <p>content</p>
      </AppShell>,
    );

    expect(screen.getByText(/Updated /)).toBeVisible();
  });
});
