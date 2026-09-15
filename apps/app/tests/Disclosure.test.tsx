// @vitest-environment jsdom
import { clickUi, renderInvestUi } from './support/investUiHarness';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { Disclosure } from '@/components/ui/Disclosure';
it('mounts disclosure contents only when expanded and exposes its state', async () => {
  function Example() {
    const [expanded, setExpanded] = useState(false);
    return (
      <Disclosure
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        accessibilityLabel="Details"
        header="Details"
      >
        <span>Hidden content</span>
      </Disclosure>
    );
  }
  const container = await renderInvestUi(<Example />);
  expect(container.textContent).not.toContain('Hidden content');
  expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe(
    'false',
  );
  await clickUi(container, 'Details');
  expect(container.textContent).toContain('Hidden content');
  expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe(
    'true',
  );
});
