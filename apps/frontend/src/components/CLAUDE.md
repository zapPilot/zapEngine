See @../../CLAUDE.md for app-level conventions.

# Components

UI building blocks for the frontend. Organised by feature domain at the top level, with `shared/` and `ui/` holding cross-cutting primitives.

## Layout

```
components/
├── ui/             # Design-system primitives (Button, Input, Card, Modal, Tabs, …) — leaf components
├── shared/         # Reusable composites built from ui/ (page-section shells, error boundaries, etc.)
├── layout/         # App shell (header, sidebar, route layouts)
├── icons/          # SVG icon components (lucide-react re-exports + custom marks)
├── errors/         # Error boundaries & fallback UIs
├── debug/          # Dev-only overlays (log viewer, perf, RQ devtools wrapper)
│
├── bundle/         # Feature: multi-wallet bundle dashboard
├── charts/         # Feature: portfolio charts (recharts wrappers + tooltips)
├── wallet/         # Feature: wallet connection & switching
├── WalletManager/  # Feature: bundle wallet add/remove/rename
└── Footer/         # Feature: site footer
```

## Where new components go

| Component is…                                         | Put it in                                            |
| ----------------------------------------------------- | ---------------------------------------------------- |
| A design-system primitive with no business semantics  | `ui/`                                                |
| Composed from `ui/` and used by ≥2 features           | `shared/`                                            |
| Specific to one feature                               | The feature folder (or create one named after it)    |
| App-shell-level (always-on chrome)                    | `layout/`                                            |
| Dev-only / debug overlay                              | `debug/` (gated behind env var)                      |
| An error boundary or fallback                         | `errors/`                                            |

## Conventions

- Functional components with TypeScript only — no class components
- Props typed via `interface XxxProps`; spread `...rest` only when explicitly forwarding to a DOM element
- All chain / API data arrives via props or a hook from `src/hooks/` — components never call services directly
- Styling: Tailwind classes; complex variants via `clsx`/`cva`. Design tokens come from `@zapengine/design-tokens` preset
- `ui/` primitives must be a11y-clean (axe-friendly, keyboard reachable, `aria-*` correct)
- File and component name match: `Button.tsx` exports `Button`

## Gotchas

- Wallet UI must use `useWalletProvider()` from `hooks/wallet/`, not wagmi directly
- Charts re-render on every parent state change — memoise input arrays before passing to recharts
- Modals/dropdowns need portal root mounted via `layout/` — don't create new portals ad-hoc
