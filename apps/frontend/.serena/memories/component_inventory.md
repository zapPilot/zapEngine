# Component Inventory - Complete Catalog

## 🎯 UI Components (`src/components/ui/`)

### **Button Components**

- **`GradientButton`** - Primary action button with gradient styling and loading states
- **`LoadingButton`** - Button with integrated loading spinner and disabled states
- **`TabButton`** - Navigation tab button with active state styling

### **Layout Components**

- **`GlassCard`** - Glass morphism container with backdrop blur effects
- **`LoadingCard`** - Card component with skeleton loading animation
- **`EmptyStateCard`** - Empty state display with icon and message
- **`ErrorStateCard`** - Error state display with retry functionality

### **Data Display Components**

- **`APRMetrics`** - Annual percentage return display with styling variants
- **`ToastNotification`** - Success/error notification system with auto-dismiss
- **`LoadingSkeleton`** - Skeleton loading animation for content placeholders
- **`UnifiedLoading`** - Centralized loading state management
- **`LoadingState`** - Generic loading indicator component

### **Utility Components**

- **`Portal`** - React portal for modal and overlay rendering
- **`WalletConnectionPrompt`** - Prompt for wallet connection
- **`BundleNotFound`** - Error page for invalid bundle URLs

## 📊 Chart & Visualization (`src/components/`)

### **Chart Components**

- **`PieChart`** - Interactive pie chart with click handlers and legend
- **`PortfolioChart`** - Multi-tab chart (performance, allocation, drawdown)
- **`PortfolioCharts`** (in PortfolioAllocation) - Feature-specific chart container
- **`PerformanceTrendChart`** - Historical APR trend chart with category filtering support,
  SVG-based, mobile-responsive with interactive tooltips

### **Data Tables**

- **`AssetCategoriesDetail`** - Detailed asset breakdown with balance hiding
- **`CategoryItem`** - Individual category display component

## 🔗 Web3 Components (`src/components/Web3/`)

### **Wallet Management**

- **`SimpleConnectButton`** - Minimal wallet connection interface
- **`HeaderWalletControls`** - Navigation-integrated wallet controls

### **Chain Management**

- **`ChainSwitcher`** - Canonical chain switching component (simple, effective, production-ready)

## 🏦 Portfolio Management (`src/components/PortfolioAllocation/`)

### **Core Portfolio Components**

- **`PortfolioAllocationContainer`** - Main feature container orchestrating portfolio logic
- **`EnhancedOverview`** - Comprehensive portfolio overview with performance trend chart, premium UI
  animations, and multi-data views

### **Control Components**

- **`SwapControls`** - Token selection, amount input, and validation
- **`SlippageComponent`** - Unified slippage configuration with context-aware behavior
- **`AmountButtons`** - Quick percentage amount selection (25%, 50%, 75%, 100%)

### **Display Components**

- **`OverviewHeader`** - Portfolio summary header with metrics
- **`CategoryListSection`** - Asset category listing and management
- **`CategoryRow`** - Expandable row showing protocols and allocations
- **`CategoryRowHeader`** - Category section headers
- **`CategoryAllocationSummary`** - Category allocation overview
- **`CategoryProtocolList`** - Protocol listings within categories
- **`RebalanceSummary`** - Rebalancing action summary and preview
- **`ExcludedCategoriesChips`** - Visual tags for excluded categories

### **Action Components**

- **`ActionsAndControls`** - Main action interface
- **`ActionCenter`** - Centralized action management

## 💱 Trading & Swap (`src/components/SwapPage/`)

### **Core Trading Components**

- **`SwapPage`** - Main swap interface container
- **`SwapTab`** - Basic token swapping interface
- **`OptimizeTab`** - Portfolio optimization and dust conversion
- **`SwapPageHeader`** - Swap page navigation with back button

### **Trading Controls**

- **`TabNavigation`** - Operation mode switching (swap, optimize)
- **`OptimizationSelector`** - Optimization options selector

### **Progress & Status**

- **`UnifiedProgressModal`** - Mode-based progress modal supporting 'intent' and 'optimization'
  workflows, currently used in production
- **`StreamingProgress`** - Real-time operation progress display with technical details
- **`WalletTransactionProgress`** - Wallet transaction batch progress

### **Data Components**

- **`TradingSummary`** - Transaction summary with technical details
- **`EventsList`** - Trading event log with impact calculations
- **`OptimizationPreview`** - Preview of optimization actions

## 🧭 Navigation & Layout (`src/components/`)

### **Core Layout**

- **`DashboardShell`** - Main application shell with navigation
- **`Navigation`** - Main tab-based navigation system

### **Tab Components**

- **`AnalyticsTab`** - Analytics and metrics dashboard with integrated pool performance analytics
- **`AirdropTab`** - Token airdrop information and eligibility
- **`CommunityTab`** - Community links and engagement
- **`SettingsTab`** - Application settings and configuration

### **Settings Sub-Components**

- **`VersionInfo`** - App version display
- **`MenuSection`** - Settings menu section with items

## 📊 Pool Analytics (`src/components/PoolAnalytics/`)

### **Pool Performance Components**

- **`PoolPerformanceTable`** - Comprehensive pool analytics table with sorting, filtering, and
  underperforming pool identification
  - **Purpose**: Display detailed pool performance metrics from APR API endpoint
  - **Features**: Sortable columns (APR, value, contribution, protocol), mobile-responsive cards,
    visual status indicators
  - **Integration**: Integrated into AnalyticsTab for pool-level performance analysis
  - **Technical**: Uses real APR data from `/api/v1/apr/portfolio/{userId}/summary` endpoint
  - **UX**: Color-coded performance indicators (green=good, yellow=underperforming, red=poor), chain
    badges, asset symbols

## 🌟 Analytics & Community Support (`src/components/MoreTab/`)

### **Analytics Components**

- **`AnalyticsDashboard`** - Advanced analytics visualization
- **`KeyMetricsGrid`** - Grid layout for key metrics
- **`KeyMetricCard`** - Individual metric card display

### **Community Components**

- **`SocialLinks`** - Social media and external links
- **`PodcastSection`** - Podcast links and media
- **`CommunityStats`** - Community metrics and statistics

## 🔧 Utility Components (`src/components/shared/`)

### **Image Components**

- **`ImageWithFallback`** - Robust image loading with fallback strategies
- **`TokenImage`** - Token logo display with symbol fallbacks

### **Interface Components**

- **`SlippageComponent`** - Slippage tolerance configuration
- **`UnifiedProgressModal`** - Universal progress modal for operations

### **Portfolio Display**

- **`WalletPortfolio`** - Main portfolio overview with balance controls and integrated APR data
- **`PortfolioOverview`** - Portfolio summary with category expansion

## 🏦 Wallet Management (`src/components/WalletManager/`)

### **Core Components**

- **`WalletManager`** - Multi-wallet management interface
- **`WalletManagerSkeleton`** - Loading skeleton for wallet manager

### **Wallet Display**

- **`WalletCard`** - Individual wallet card display
- **`WalletList`** - List of user wallets
- **`WalletActionMenu`** - Wallet action dropdown menu

### **Wallet Operations**

- **`AddWalletForm`** - Form for adding new wallets
- **`EditWalletModal`** - Modal for editing wallet details
- **`EmailSubscription`** - Email notification subscription

### **Wallet Info Components**

- **`WalletActions`** - Wallet-specific action buttons
- **`WalletHeader`** - Wallet overview header
- **`WalletMetrics`** - Wallet performance metrics
- **`WalletPortfolioPresenter`** - Wallet portfolio presentation
- **`WelcomeNewUser`** - New user onboarding
- **`ROITooltip`** - ROI information tooltip

## 🎁 Bundle Sharing (`src/components/bundle/`)

### **Bundle Components**

- **`SwitchPromptBanner`** - Banner for switching between bundles
- **`QuickSwitchFAB`** - Floating action button for quick bundle switching

## 🔧 Error Handling (`src/components/errors/`)

### **Error Components**

- **`ErrorBoundary`** - React error boundary wrapper
- **`AsyncErrorBoundary`** - Async operation error boundary
- **`GlobalErrorHandler`** - Application-wide error handling

## 🐛 Debug Components (`src/components/debug/`)

### **Debug Tools**

- **`LogViewer`** - Development log viewing interface

## 📱 Notification Components

- **`EmailReminderBanner`** - Email subscription reminder banner

## 🎣 Custom Hooks Inventory (`src/hooks/`)

### **Web3 Hooks**

- **`useWallet`** - Wallet connection and state management
- **`useChain`** - Blockchain network management
- **`useWalletModal`** - Wallet connection modal management
- **`useWalletEvents`** - Wallet event monitoring

### **Portfolio Hooks**

- **`usePortfolio`** - Portfolio data and calculations
- **`usePortfolioData`** - Portfolio data processing
- **`usePortfolioState`** - Portfolio state management
- **`usePortfolioTrends`** - Portfolio trend analysis
- **`useDustZap`** - Dust token conversion functionality
- **`useDustZapStream`** - Streaming dust conversion
- **`useWalletPortfolioState`** - Consolidates wallet portfolio state with simplified data
  dependencies
- **`useWalletPortfolioTransform`** - Portfolio data transformation

### **Query Hooks (`src/hooks/queries/`)**

- **`usePortfolioQuery`** - Portfolio data fetching with React Query
- **`useUserQuery`** - User data fetching
- **`useStrategiesQuery`** - Investment strategies data

### **Feature-Specific Hooks**

- **`useToast`** - Toast notification system
- **`useDropdown`** - Common dropdown state patterns
- **`useRiskSummary`** - Risk assessment calculations
- **`useBundlePage`** - Bundle page state management
- **`useReducedMotion`** - Motion preference detection

### **PortfolioAllocation Hooks**

- **`usePortfolioData`** - Portfolio data processing
- **`useRebalanceData`** - Rebalancing calculations
- **`useSlippage`** - Slippage management with presets
- **`useTargetChartData`** - Target allocation visualization
- **`useChartDataTransforms`** - Chart data transformations
- **`useCategoryFilters`** - Category filtering logic
- **`usePortfolioAllocationViewModel`** - Main allocation view model

### **SwapPage Hooks**

- **`useOptimizationData`** - Portfolio optimization logic
- **`useWalletTransactions`** - Transaction batch management
- **`useUIState`** - UI state management
- **`useTokenData`** - Token data management
- **`useTokenFilters`** - Token filtering logic
- **`useTokenActions`** - Token action handlers
- **`useTokenManagement`** - Token management operations

### **WalletManager Hooks**

- **`useEmailSubscription`** - Email subscription management
- **`useWalletOperations`** - Wallet CRUD operations
- **`useDropdownMenu`** - Dropdown menu state management

## 🔍 Component Usage Patterns

### **High-Reuse Components** (Used in multiple features)

- `GlassCard` - Layout container used throughout
- `GradientButton` - Primary action button across features
- `TokenImage` - Token display in multiple contexts
- `UnifiedProgressModal` - Progress tracking across operations
- `SlippageComponent` - Slippage settings across trading features

### **Feature-Specific Components** (Single-use)

- `PortfolioAllocationContainer` - Portfolio feature only
- `SwapPage` - Trading feature only
- `ChainSwitcher` - Web3 wallet controls only
- `PerformanceTrendChart` - EnhancedOverview decision support only
- `PoolPerformanceTable` - AnalyticsTab pool analytics only

### **Composition Patterns**

- Container components orchestrate feature logic
- Presentational components handle display only
- Hook components encapsulate business logic
- Utility components provide cross-cutting concerns

## 🧹 Architecture Benefits

### **Successfully Consolidated:**

1. **SlippageComponent** - Unified slippage settings
2. **UnifiedProgressModal** - Consolidated progress tracking
3. **useDropdown** - Common dropdown patterns (5+ components now use shared hook)
4. **ChainSwitcher** - Canonical chain switching

### **Recent Additions:**

1. **PerformanceTrendChart** - Historical APR visualization for transaction decision support
   - **Purpose**: Shows historical portfolio performance to aid zapin/zapout/rebalance decisions
   - **Features**: Category filtering integration, SVG-based custom charts, mobile-responsive design
   - **Integration**: Seamlessly integrated into EnhancedOverview between header and actions

2. **PoolPerformanceTable** - Pool-level performance analytics with real APR data
   - **Purpose**: Display and analyze individual pool performance metrics to identify
     underperforming positions
   - **Features**: Real-time APR data, sortable table, mobile-responsive cards, visual performance
     indicators
   - **Integration**: Integrated into AnalyticsTab alongside existing performance charts

### **Architecture Benefits:**

- **Reduced Duplication**: Eliminated duplicate components/hooks
- **Improved Consistency**: Unified patterns across features
- **Better Maintainability**: Single source of truth for common functionality
- **Cleaner Codebase**: Significant code reduction through consolidation
- **Enhanced Decision Support**: Users now have historical context for financial decisions
- **Real APR Data**: Accurate portfolio performance metrics replacing static calculations
