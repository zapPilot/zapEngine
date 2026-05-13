import React, { type JSX } from 'react';
import { vi } from 'vitest';

interface DynamicOverride {
  matcher: string | RegExp;
  renderer: (props: any) => React.ReactElement | null;
}

interface LazyMockEntry {
  match: string | RegExp;
  testId: string;
  render?: (props: any) => React.ReactElement | null;
}

const dynamicOverrides: DynamicOverride[] = [];

(globalThis as any).__registerDynamicOverride = (
  matcher: string | RegExp,
  renderer: DynamicOverride['renderer'],
) => {
  dynamicOverrides.push({ matcher, renderer });
};

(globalThis as any).__clearDynamicOverrides = () => {
  dynamicOverrides.length = 0;
};

vi.mock('@/lib/lazy/lazyImport', () => {
  const createEl = (testId: string, children?: React.ReactNode) =>
    React.createElement('div', { 'data-testid': testId }, children);

  const renderWalletManager = (props: any) => {
    if (!props?.isOpen) {
      return null;
    }

    const emailSubscribeControls = props?.onEmailSubscribed
      ? [
          React.createElement(
            'button',
            {
              key: 'confirm-email',
              type: 'button',
              'data-testid': 'confirm-email-subscribe',
              onClick: () => props.onEmailSubscribed?.(),
            },
            'Confirm Subscribe',
          ),
          React.createElement(
            'button',
            {
              key: 'subscribe-from-manager',
              type: 'button',
              'data-testid': 'subscribe-from-wallet-manager',
              onClick: () => props.onEmailSubscribed?.(),
            },
            'Subscribe',
          ),
        ]
      : [];

    return React.createElement(
      'div',
      { 'data-testid': 'wallet-manager-modal', role: 'dialog' },
      [
        React.createElement(
          'div',
          {
            key: 'header',
            'data-testid': 'wallet-manager-header',
          },
          [
            React.createElement('h2', { key: 'title' }, 'Wallet Manager'),
            React.createElement(
              'button',
              {
                key: 'close',
                type: 'button',
                'data-testid': 'close-wallet-manager',
                onClick: () => props?.onClose?.(),
              },
              'Close',
            ),
          ],
        ),
        ...emailSubscribeControls,
      ],
    );
  };

  const lazyImportRegistry: readonly LazyMockEntry[] = [
    {
      match: 'wallet/portfolio/analytics',
      testId: 'analytics-view',
      render: () => createEl('analytics-view', 'Analytics View'),
    },
    {
      match: 'wallet/portfolio/views/invest/InvestView',
      testId: 'invest-view',
      render: (props) =>
        createEl(
          'invest-view',
          `Invest View ${props?.activeSubTab ?? 'trading'}`,
        ),
    },
    {
      match: 'trading/TradingView',
      testId: 'trading-view',
      render: (props) => createEl('trading-view', props?.userId ?? 'no-user'),
    },
    { match: 'BacktestingView', testId: 'backtesting-view' },
    { match: 'market/MarketDashboardView', testId: 'market-dashboard-view' },
    { match: 'configManager', testId: 'config-manager-view' },
    {
      match: 'wallet/portfolio/modals',
      testId: 'portfolio-modals',
      render: () => createEl('portfolio-modals', 'Portfolio Modals Container'),
    },
    {
      match: 'WalletManager',
      testId: 'wallet-manager-modal',
      render: renderWalletManager,
    },
  ];

  const matches = (matcher: string | RegExp, importString: string) =>
    typeof matcher === 'string'
      ? importString.includes(matcher)
      : matcher.test(importString);

  return {
    lazyImport: (
      importFunc: () => Promise<any>,
      _selectExport?: (module: any) => React.ComponentType<any>,
      _options?: { fallback?: JSX.Element },
    ) => {
      const DynamicComponent = (props: any) => {
        try {
          const importString = importFunc.toString();

          const override = dynamicOverrides.find(({ matcher }) =>
            matches(matcher, importString),
          );
          if (override) {
            return override.renderer(props);
          }

          const registryEntry = lazyImportRegistry.find(({ match }) =>
            matches(match, importString),
          );
          if (registryEntry) {
            if (registryEntry.render) {
              return registryEntry.render(props);
            }

            return createEl(registryEntry.testId);
          }

          const modulePromise = importFunc();

          if (modulePromise && typeof modulePromise.then === 'function') {
            return React.createElement(
              'div',
              {
                'data-testid': 'dynamic-component-mock',
                'data-dynamic': 'true',
              },
              'Dynamic Component Mock',
            );
          }
        } catch (error: any) {
          return React.createElement(
            'div',
            {
              'data-testid': 'dynamic-component-error',
              'data-error': error?.message || 'Import failed',
            },
            'Dynamic Import Error',
          );
        }

        return React.createElement(
          'div',
          {
            'data-testid': 'dynamic-component-fallback',
          },
          'Dynamic Component',
        );
      };

      DynamicComponent.displayName = 'DynamicComponent';
      return DynamicComponent;
    },
  };
});
