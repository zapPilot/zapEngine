# Portfolio Data Flow

This document describes the agreed service pattern and portfolio data flow.

## Overview

- Data source: `useLandingPageData(userId)` makes a single request for landing page data.
- Transformation: `usePortfolioDataProgressive(userId)` assembles portfolio data with section-level
  loading states (balance, composition, strategy, sentiment).
- Portfolio state: `DashboardShell` derives loading/error/empty states and builds a fallback data
  model via `createEmptyPortfolioState` when needed.
- Presenter: `WalletPortfolioPresenter` renders the UI using unified data + section states.

## Container vs. Presenter

- `DashboardShell` is the container that owns data fetching, error handling, and empty-state
  behavior.
- `WalletPortfolioPresenter` is a presentational component that renders header, metrics, actions,
  overview, and the wallet modal. It’s easy to unit test in isolation.

## Testing Guidance

- Services: Mock HTTP with lightweight stubs (e.g., `vi.mock` on service functions or `fetch`) to
  validate error/retry handling.
- Hooks: Prefer testing hooks via small wrapper components and `@testing-library/react` utilities.
  Example targets:
  - `usePortfolioDataProgressive`: progressive data loading behavior and section readiness.
  - `useBundlePage`: localStorage sync for switch prompt, email banner visibility, and modal state
    transitions.

## File Map

- Hooks
  - `src/hooks/useBundlePage.ts` — Bundle page state
  - `src/hooks/queries/usePortfolioDataProgressive.ts` — Progressive portfolio data assembly
  - `src/hooks/queries/usePortfolioQuery.ts` — Landing page data fetch
- Components
  - `src/components/DashboardShell.tsx` — Container for dashboard data + presentation
  - `src/components/wallet/portfolio/WalletPortfolioPresenter.tsx` — Presenter

## Notes

- Strict TypeScript settings (`exactOptionalPropertyTypes`) are respected by using conditional
  spreads instead of passing explicit `undefined`.
- Existing test IDs were preserved in refactors to keep regression tests stable.
