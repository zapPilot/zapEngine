# Layout Components

Layout components handle page structure and positioning concerns.

## Structure

- `banners/` - Notification and prompt banners
- `overlays/` - Full-page overlays and modals

## Usage

```typescript
import { StickyBannerShell, GhostModeOverlay } from "@/components/layout";
```

## Guidelines

- Layout components should have no business logic
- Use semantic HTML (nav, header, footer, aside)
- Support responsive layouts via Tailwind
- Position using design system constants from `@/constants/design-system`

## Components

### Banners

- **EmailReminderBanner** - Email subscription reminder with dismissible state
- **StickyBannerShell** - Reusable sticky banner container with consistent positioning
- **SwitchPromptBanner** - Wallet switch prompt for bundle sharing

### Overlays

- **GhostModeOverlay** - Full-page overlay for disconnected/viewing mode
