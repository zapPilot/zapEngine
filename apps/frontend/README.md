# Zap Pilot - DeFi Portfolio Management

A modern, mobile-first Progressive Web App (PWA) for intelligent DeFi portfolio management using
intent-based execution and real-time analytics.

## Features

- 📱 **PWA Support** - Install as mobile app with offline capabilities
- 🎨 **Modern Design** - Glass morphism effects with purple/blue gradient theme
- 💼 **Portfolio Management** - Professional portfolio interface with real-time APR data
- 📊 **Smart Navigation** - Responsive navigation (sidebar for desktop, bottom tabs for mobile)
- 🥧 **Asset Categories** - Visual pie chart for BTC, ETH, STABLECOIN, ALTCOIN categories
- 🔍 **Pool Analytics** - Detailed pool performance analysis with sortable metrics
- 📈 **Historical Charts** - Performance trend charts for informed decision-making
- 🔄 **Intent-Based Actions** - ZapIn, ZapOut, and Optimize operations with progress tracking
- 🌐 **Multi-Chain Support** - Ethereum, Polygon, and other EVM chains
- 🔗 **Bundle Sharing** - Deep-linking to share and view portfolios
- 🛡️ **Security-First** - Comprehensive CSP headers and security best practices
- ⚡ **Performance** - Built with Next.js 15, React Query, and optimized for speed

## Technology Stack

- **Framework**: Next.js 15 with App Router and Turbopack
- **Frontend**: React 19, TypeScript 5, Tailwind CSS v4
- **Web3**: wagmi + viem for wallet connectivity
- **State Management**: React Query, React Context
- **Animations**: Framer Motion with GPU-accelerated transitions
- **Icons**: Lucide React
- **PWA**: next-pwa with service worker support
- **Testing**: Vitest, Playwright, Testing Library
- **Development**: ESLint 9, Prettier, Husky pre-commit hooks

## Portfolio Features

### Real-Time Portfolio Analytics

- **Total Balance**: Current USD value with 24h change tracking
- **Portfolio APR**: Real annual percentage return from connected pools
- **Risk Assessment**: Multi-factor risk scoring and analysis
- **Performance Trends**: Historical APR charts with category filtering
- **Pool Analytics**: Individual pool performance with underperforming position identification

### Asset Management

- **Category Breakdown**: Interactive visualization of:
  - **BTC**: Bitcoin and wrapped Bitcoin assets
  - **ETH**: Ethereum, staked ETH, and liquid staking tokens
  - **STABLECOIN**: USDC, USDT, DAI, and stable pools
  - **ALTCOIN**: LINK, AAVE, and other alternative tokens
- **Protocol Integration**: Lido, Aave, Uniswap, Compound support
- **Detailed Views**: Expandable categories with balance hiding options

### Intent-Based Operations

Three core portfolio actions with unified progress tracking:

1. **ZapIn** - Optimal liquidity deployment across protocols
2. **ZapOut** - Efficient position exits with slippage minimization
3. **Optimize** - Portfolio rebalancing and dust token conversion

## Application Structure

### 📱 Responsive Navigation

- **Desktop**: Sidebar navigation with detailed sections
- **Mobile**: Bottom tab bar with swipe-friendly interface
- **Deep Linking**: URL-based portfolio sharing (`/bundle?userId=0x...`)

### 💼 Portfolio Tab

- **Enhanced Overview**: Real-time metrics with performance trend visualization
- **Interactive Charts**: Multi-tab charts (performance, allocation, drawdown)
- **Category Management**: Expandable asset categories with protocol details
- **Action Center**: Context-aware ZapIn/ZapOut/Optimize controls

### 📊 Analytics Tab

- **Pool Performance Table**: Sortable pool metrics with performance indicators
- **Historical Analytics**: Performance charts and trend analysis
- **Risk Metrics**: Portfolio risk assessment and breakdown

### 🧑‍🤝‍🧑 Community Tab

- **Community Statistics**: Ecosystem engagement metrics
- **Social Integration**: Twitter, Discord, and community links
- **Educational Resources**: Podcast links and learning materials

### ⚙️ Settings Tab

- **Wallet Management**: Multi-wallet support with labeling
- **Email Notifications**: Subscription management
- **App Preferences**: Balance visibility, display options

## Bundle Sharing & Deep Linking

### URL-Based Portfolio Access

- **Owner View**: `/bundle?userId=<connected-wallet>` - Full functionality
- **Visitor View**: `/bundle?userId=<any-wallet>` - Read-only portfolio access
- **Error Handling**: Friendly "Bundle not found" for invalid addresses

### Visitor Mode Features

- **Data Visualization**: Full access to charts, metrics, and breakdowns
- **Action Restrictions**: ZapIn/ZapOut/Optimize disabled for security
- **Switch Banner**: Connected users can switch to their own bundle
- **Persistent UI**: Banner dismissal saved per userId

## Architecture

### Service-First Architecture

```
src/services/
├── accountService.ts     # User & wallet management
├── intentService.ts      # Transaction execution
├── analyticsService.ts   # Portfolio analytics & APR data
├── userService.ts        # User data transformations
└── bundleService.ts      # URL generation & sharing
```

### Component Organization

```
src/components/
├── ui/                   # Reusable design system components
├── PortfolioAllocation/  # Main portfolio management feature
├── SwapPage/            # Trading and optimization interface
├── Web3/                # Wallet connectivity and chain management
├── PoolAnalytics/       # Pool performance analysis
├── shared/              # Cross-feature shared components
└── bundle/              # Bundle sharing functionality
```

### State Management Pattern

1. **React Query** - API state, caching, and synchronization
2. **React Context** - Global application state (wallet, user)
3. **Custom Hooks** - Feature-specific business logic
4. **Service Functions** - All API operations with error handling

## Development Commands

### Core Development

```bash
pnpm run dev          # Start the stable webpack dev server
pnpm run dev:turbo    # Start the opt-in Turbopack dev server
pnpm run clean:next   # Clear .next before switching bundlers or re-benchmarking RAM
pnpm run build        # Production build via the normalized Next wrapper
pnpm run start        # Serve production build
```

Frontend Next.js commands run through `scripts/run-next.js`, which normalizes the project root
before spawning Next. Root-triggered commands such as `npm --prefix frontend run dev` therefore use
the frontend app root instead of the parent `zapPilot` checkout. The wrapper also warns when the
local Node runtime is not the repo baseline (`.nvmrc` / Node 20), since memory comparisons on newer
majors are noisy.

### Code Quality

```bash
pnpm run lint         # ESLint check with auto-fix
pnpm run lint:fix     # Fix all auto-fixable issues
pnpm run format       # Prettier formatting
pnpm run format:check # Check formatting without changes
pnpm run type-check   # TypeScript type checking
```

### Testing

```bash
pnpm test             # Run all Vitest tests
pnpm run test:unit    # Unit tests only
pnpm run test:e2e     # Playwright end-to-end tests
pnpm run test:coverage # Coverage report with thresholds (validated on Node 20)
pnpm run test:safe    # Memory-optimized test runner
```

Coverage runs use sequential Vitest batches by default. Set `VITEST_COVERAGE_BATCH_SIZE=<n>` to
lower the batch size further if a local machine is still memory constrained.

## Environment Setup

### Required Environment Variables

```env
# API Endpoints
NEXT_PUBLIC_API_BASE_URL=https://api.example.com

# Feature Flags
NODE_ENV=development
NEXT_PUBLIC_ENABLE_DEBUG=false
```

### Local Development Setup

1. **Clone and Install**:

   ```bash
   git clone <repository-url>
   cd frontend
   nvm use
   pnpm install
   ```

   The repo includes `.nvmrc` and CI runs on Node 20. Newer Node majors may work, but coverage and
   test automation are only validated against Node 20.

2. **Environment Configuration**:

   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys
   ```

3. **Start Development**:

   ```bash
   pnpm run dev
   ```

   Use `pnpm run dev:turbo` only when you explicitly want Turbopack. Run `pnpm run clean:next`
   before switching between webpack and Turbopack, and before taking fresh dev-memory measurements.

4. **Access Application**:
   - Web: http://localhost:3000
   - API Docs: Available in deployed environment

## Security Features

### Content Security Policy

- **Strict CSP**: Comprehensive headers preventing XSS attacks
- **Development Mode**: Relaxed policies for hot reloading
- **Production Mode**: Hardened security with minimal allowed sources
- **Web3 Integration**: Secure wallet connection with approved domains

### Additional Security Headers

- **X-Frame-Options**: Prevents clickjacking attacks
- **HSTS**: Enforces HTTPS connections
- **Permissions Policy**: Restricts browser feature access
- **Cross-Origin Policies**: Secure resource sharing

## Performance Optimizations

### Build Optimizations

- **Static Export**: Pre-rendered static site generation
- **Image Optimization**: Next.js image optimization with remote patterns
- **Code Splitting**: Route-based and component-level splitting
- **Tree Shaking**: Unused code elimination

### Runtime Optimizations

- **React Query Caching**: Intelligent API response caching
- **Component Memoization**: React.memo for expensive renders
- **Animation Performance**: GPU-accelerated CSS transforms
- **Lazy Loading**: Dynamic imports for non-critical components

## Browser Support

- **Desktop**: Chrome 88+, Firefox 85+, Safari 14+, Edge 88+
- **Mobile**: iOS Safari 14+, Chrome Mobile 88+, Samsung Internet
- **PWA**: Service worker support for offline functionality

## Deployment

### Static Export Configuration

The app is configured for static export deployment:

- **Output**: Static HTML, CSS, JS files
- **CDN Ready**: Optimized for edge deployment
- **Environment Agnostic**: Runtime environment detection

### Deployment Targets

- **Cloudflare Pages**: Recommended with Worker integration
- **Vercel**: Full Next.js support with edge functions
- **AWS S3/CloudFront**: Traditional static hosting

## AI Development Support

This project includes comprehensive AI agent integration:

- **`.serena/memories/`**: Project architecture and component documentation
- **`CLAUDE.md`**: Claude Code integration and development workflows
- **Service Documentation**: `docs/SERVICES.md` for backend integration patterns
- **Component Inventory**: Comprehensive component catalog for development

The architecture is designed to be AI-friendly with clear patterns, comprehensive documentation, and
consistent conventions.
