import fs from "node:fs";
import path from "node:path";

import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, configure } from "@testing-library/react";
// Import React for the dynamic component mock
import React, { type JSX } from "react";
import { afterEach, beforeEach, expect, vi } from "vitest";

import { chartMatchers } from "./utils/chartTypeGuards";

const coverageTmpDir = path.join(process.cwd(), "coverage", ".tmp");
if (!fs.existsSync(coverageTmpDir)) {
  fs.mkdirSync(coverageTmpDir, { recursive: true });
}

// Configure React Testing Library to work better with React 18+
configure({
  // Increase default timeout for async operations
  asyncTimeout: 5000,
});

// Configure global React environment for act() support
global.IS_REACT_ACT_ENVIRONMENT = true;

// Mock console.error to suppress act() warnings in tests
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = (...args: any[]) => {
    const message = args[0];
    if (
      typeof message === "string" &&
      (message.includes("not configured to support act") ||
        message.includes("Warning: ReactDOM.render is no longer supported"))
    ) {
      return;
    }
    originalConsoleError.call(console, ...args);
  };
});

// Mock React Query's error boundary logging to avoid console noise during tests
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    // Silence QueryErrorResetBoundary console errors during testing
    useQueryErrorResetBoundary: () => ({ reset: vi.fn() }),
  };
});

// Extend Vitest's expect with testing-library matchers
expect.extend(matchers);

// Extend Vitest's expect with custom chart matchers
expect.extend(chartMatchers);

// Clean up after each test case
afterEach(() => {
  cleanup();
});

afterEach(() => {
  console.error = originalConsoleError;
});

// Reset fake timers between tests so a test that throws before its own
// vi.useRealTimers() cleanup cannot leak fake timers into subsequent
// tests — which would hang their `waitFor` polling until the vitest
// testTimeout fires.
afterEach(() => {
  vi.useRealTimers();
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  root: Element | null = null;
  rootMargin = "";
  thresholds: readonly number[] = [];

  constructor(
    _callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
  ) {
    this.root = (options?.root as Element) || null;
    this.rootMargin = options?.rootMargin || "";
    this.thresholds = Array.isArray(options?.threshold)
      ? options.threshold
      : [options?.threshold || 0];
  }

  disconnect() {
    // Mock implementation
  }
  observe() {
    // Mock implementation
  }
  unobserve() {
    // Mock implementation
  }
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  disconnect() {
    // Mock implementation
  }
  observe() {
    // Mock implementation
  }
  unobserve() {
    // Mock implementation
  }
} as any;

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.scrollTo
Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: vi.fn(),
});

// Mock window.location.reload safely without breaking other properties
if (typeof window !== "undefined") {
  try {
    if (typeof window.location.reload !== "function") {
      (window.location as any).reload = vi.fn();
    }
  } catch (_err) {
    // Fallback if location object is completely locked
  }
}

// Mock PointerEvent for framer-motion
(global as any).PointerEvent = class PointerEvent extends Event {
  pointerId: number;
  width: number;
  height: number;
  pressure: number;
  tangentialPressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  pointerType: string;
  isPrimary: boolean;
  altitudeAngle = 0;
  azimuthAngle = 0;

  constructor(type: string, eventInitDict: any = {}) {
    super(type, eventInitDict);
    this.pointerId = eventInitDict.pointerId || 0;
    this.width = eventInitDict.width || 1;
    this.height = eventInitDict.height || 1;
    this.pressure = eventInitDict.pressure || 0;
    this.tangentialPressure = eventInitDict.tangentialPressure || 0;
    this.tiltX = eventInitDict.tiltX || 0;
    this.tiltY = eventInitDict.tiltY || 0;
    this.twist = eventInitDict.twist || 0;
    this.pointerType = eventInitDict.pointerType || "";
    this.isPrimary = eventInitDict.isPrimary || false;
  }

  getCoalescedEvents() {
    return [];
  }
  getPredictedEvents() {
    return [];
  }
};

// Mock HTMLElement.setPointerCapture and releasePointerCapture
HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();

// Mock getBoundingClientRect to return valid values in test environment
// Fixes: TypeError: Cannot read properties of undefined (reading 'bottom')
Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
  top: 100,
  left: 100,
  bottom: 200,
  right: 200,
  width: 100,
  height: 100,
  x: 100,
  y: 100,
  toJSON: () => ({}),
});

interface DynamicOverride {
  matcher: string | RegExp;
  renderer: (props: any) => React.ReactElement | null;
}

const dynamicOverrides: DynamicOverride[] = [];

(globalThis as any).__registerDynamicOverride = (
  matcher: string | RegExp,
  renderer: DynamicOverride["renderer"]
) => {
  dynamicOverrides.push({ matcher, renderer });
};

(globalThis as any).__clearDynamicOverrides = () => {
  dynamicOverrides.length = 0;
};

// Mock app lazy imports to return the actual component in tests
// This allows individual component mocks to take precedence
vi.mock("@/lib/lazy/lazyImport", () => {
  return {
    lazyImport: (
      importFunc: () => Promise<any>,
      _selectExport?: (module: any) => React.ComponentType<any>,
      _options?: { fallback?: JSX.Element }
    ) => {
      // Return a component that immediately resolves the import
      const DynamicComponent = (props: any) => {
        try {
          const importString = importFunc.toString();

          const override = dynamicOverrides.find(({ matcher }) =>
            typeof matcher === "string"
              ? importString.includes(matcher)
              : matcher.test(importString)
          );
          if (override) {
            return override.renderer(props);
          }

          if (importString.includes("wallet/portfolio/analytics")) {
            return React.createElement(
              "div",
              { "data-testid": "analytics-view" },
              "Analytics View"
            );
          }

          if (
            importString.includes("wallet/portfolio/views/invest/InvestView")
          ) {
            return React.createElement(
              "div",
              { "data-testid": "invest-view" },
              `Invest View ${props?.activeSubTab ?? "trading"} ${
                props?.activeMarketSection ?? "overview"
              }`
            );
          }

          if (importString.includes("trading/TradingView")) {
            return React.createElement(
              "div",
              { "data-testid": "trading-view" },
              props?.userId ?? "no-user"
            );
          }

          if (importString.includes("BacktestingView")) {
            return React.createElement("div", {
              "data-testid": "backtesting-view",
            });
          }

          if (importString.includes("market/MarketDashboardView")) {
            return React.createElement(
              "div",
              { "data-testid": "market-dashboard-view" },
              [
                React.createElement(
                  "span",
                  { key: "active-section" },
                  props?.activeSection ?? "overview"
                ),
                React.createElement(
                  "button",
                  {
                    key: "switch-section",
                    type: "button",
                    onClick: () =>
                      props?.onSectionChange?.("relative-strength"),
                  },
                  "Select Relative Strength"
                ),
              ]
            );
          }

          if (importString.includes("configManager")) {
            return React.createElement("div", {
              "data-testid": "config-manager-view",
            });
          }

          if (importString.includes("wallet/portfolio/modals")) {
            return React.createElement(
              "div",
              { "data-testid": "portfolio-modals" },
              "Portfolio Modals Container"
            );
          }

          if (importString.includes("WalletManager")) {
            if (!props?.isOpen) {
              return null;
            }

            const emailSubscribeControls = props?.onEmailSubscribed
              ? [
                  React.createElement(
                    "button",
                    {
                      key: "confirm-email",
                      type: "button",
                      "data-testid": "confirm-email-subscribe",
                      onClick: () => props.onEmailSubscribed?.(),
                    },
                    "Confirm Subscribe"
                  ),
                  React.createElement(
                    "button",
                    {
                      key: "subscribe-from-manager",
                      type: "button",
                      "data-testid": "subscribe-from-wallet-manager",
                      onClick: () => props.onEmailSubscribed?.(),
                    },
                    "Subscribe"
                  ),
                ]
              : [];

            return React.createElement(
              "div",
              { "data-testid": "wallet-manager-modal", role: "dialog" },
              [
                React.createElement(
                  "div",
                  {
                    key: "header",
                    "data-testid": "wallet-manager-header",
                  },
                  [
                    React.createElement(
                      "h2",
                      { key: "title" },
                      "Wallet Manager"
                    ),
                    React.createElement(
                      "button",
                      {
                        key: "close",
                        type: "button",
                        "data-testid": "close-wallet-manager",
                        onClick: () => props?.onClose?.(),
                      },
                      "Close"
                    ),
                  ]
                ),
                ...emailSubscribeControls,
              ]
            );
          }

          // Try to resolve the import immediately for tests
          const modulePromise = importFunc();

          // If it's a Promise, we can't resolve it synchronously, so return a mock
          if (modulePromise && typeof modulePromise.then === "function") {
            // In test environment, return a generic placeholder for other components
            return React.createElement(
              "div",
              {
                "data-testid": "dynamic-component-mock",
                "data-dynamic": "true",
              },
              "Dynamic Component Mock"
            );
          }
        } catch (error) {
          // If import fails, return placeholder
          return React.createElement(
            "div",
            {
              "data-testid": "dynamic-component-error",
              "data-error": error?.message || "Import failed",
            },
            "Dynamic Import Error"
          );
        }

        // Fallback placeholder
        return React.createElement(
          "div",
          {
            "data-testid": "dynamic-component-fallback",
          },
          "Dynamic Component"
        );
      };

      DynamicComponent.displayName = "DynamicComponent";
      return DynamicComponent;
    },
  };
});

// Provide a default mock for UserContext to avoid provider requirements in unit tests
vi.mock("@/contexts/UserContext", () => {
  return {
    useUser: () => ({
      userInfo: null,
      loading: false,
      error: null,
      isConnected: false,
      connectedWallet: null,
      refetch: vi.fn(),
    }),
    UserProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
