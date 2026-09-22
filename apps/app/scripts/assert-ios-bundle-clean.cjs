// CommonJS on purpose: kept consistent with the other iOS release-gate scripts.
const fs = require('node:fs');
const path = require('node:path');

// The iOS build intentionally includes podcast + read-only portfolio analytics,
// while wallet custody and execution surfaces stay outside the native module
// graph. This guard checks both the emitted Hermes bytes and the source-map
// module list. The source map is authoritative for "which first-party module
// was bundled"; byte markers remain useful for vendor/collision baselines and
// for execution strings that should never appear.
//
// Group 1: vendor/collision terms with measured non-zero baselines. These may
// move when a legitimate read-only analytics dependency changes, but every
// increase must be measured and attributed before updating the baseline.
//
// Group 2: first-party execution markers with baseline 0. These must never be
// relaxed merely to make the build pass.
const DENYLIST = [
  // Group 1 — vendor / substring collisions.
  { term: 'eth_sendTransaction', baseline: 2 },
  { term: 'personal_sign', baseline: 1 },
  { term: 'WalletConnect', baseline: 2 },
  { term: 'MetaMask', baseline: 0 },
  { term: 'Morpho', baseline: 2 },
  // Aave (2): viem's Geist chain token metadata + the read-only demo
  // attribution label. Neither source exposes lending execution.
  { term: 'Aave', baseline: 2 },
  // Hyperliquid (2): viem's EVM testnet chain name + the shared read-only
  // venue/chain label used by portfolio income, explorer, and podcast metadata.
  { term: 'Hyperliquid', baseline: 2 },
  { term: 'createWalletClient', baseline: 1 },

  // Group 2 — first-party wallet/execution surface. Keep every baseline at 0.
  {
    term: 'useWalletProvider must be used within a WalletProvider',
    baseline: 0,
  },
  { term: 'GMX', baseline: 0 },
  { term: 'Moonwell', baseline: 0 },
  { term: 'vaultTransfer', baseline: 0 },
  { term: 'clearinghouseState', baseline: 0 },
  { term: 'getDepositPlan', baseline: 0 },
  { term: 'li.quest', baseline: 0 },
];

// Source-map module invariants. Match module path fragments rather than bundle
// strings so a single accidental import identifies the exact graph leak.
//
// Keep the non-iOS action/screen implementations here even though their .ios
// siblings are expected: Metro must resolve the platform file, not include both.
const SOURCE_DENYLIST = [
  {
    label: 'wallet provider context',
    patterns: [
      '/providers/walletContext.ts',
      '/providers/walletContext.js',
      '/providers/WalletProvider.tsx',
      '/providers/WalletProvider.js',
    ],
  },
  {
    label: 'atomic/native wallet execution',
    patterns: [
      '/hooks/wallet/useAtomicBatchExecution.ts',
      '/hooks/wallet/useAtomicBatchExecution.js',
      '/hooks/wallet/usePrivyWalletBackend.ts',
      '/hooks/wallet/usePrivyWalletBackend.js',
      '/hooks/wallet/useWagmiWalletBackend.ts',
      '/hooks/wallet/useWagmiWalletBackend.js',
    ],
  },
  {
    label: 'deposit/bridge/exchange services',
    patterns: [
      '/services/planOrchestrationService.ts',
      '/services/planOrchestrationService.js',
      '/services/hyperliquidService.ts',
      '/services/hyperliquidService.js',
      '/hooks/useDepositWizard.ts',
      '/hooks/useDepositWizard.js',
      '/hooks/useBridgeTest.ts',
      '/hooks/useBridgeTest.js',
      '/lib/wallet/depositWizardMachine.ts',
      '/lib/wallet/depositWizardMachine.js',
    ],
  },
  {
    label: 'non-iOS Home execution row',
    patterns: ['/src/components/home/HomeActionRow.tsx'],
  },
  {
    label: 'non-iOS protocol brand icon',
    patterns: ['/src/components/token/ProtocolIcon.tsx'],
  },
  {
    label: 'non-iOS financial screens',
    patterns: [
      '/src/screens/SendScreen.tsx',
      '/src/screens/WalletsScreen.tsx',
      '/src/screens/StrategyScreen.tsx',
      '/src/screens/invest/InvestAmountScreen.tsx',
      '/src/screens/invest/InvestProgressScreen.tsx',
      '/src/screens/invest/InvestRouteScreen.tsx',
    ],
  },
  {
    label: 'non-iOS invest/wallet integration',
    patterns: [
      '/src/integration/useInvest.tsx',
      '/src/integration/useInvestExecution.tsx',
      '/src/integration/useInvestReview.ts',
      '/src/integration/useWalletManager.ts',
    ],
  },
  {
    label: 'app-core broad barrels',
    patterns: [
      '/app-core/src/services/index.ts',
      '/app-core/dist/services/index.js',
      '/app-core/src/hooks/queries/index.ts',
      '/app-core/dist/hooks/queries/index.js',
      '/app-core/src/hooks/wallet/index.ts',
      '/app-core/dist/hooks/wallet/index.js',
      '/app-core/src/hooks/analytics/index.ts',
      '/app-core/dist/hooks/analytics/index.js',
      '/app-core/src/adapters/index.ts',
      '/app-core/dist/adapters/index.js',
      '/app-core/src/utils/index.ts',
      '/app-core/dist/utils/index.js',
    ],
  },
  {
    label: 'transaction contract root barrel',
    patterns: ['/types/src/api/index.ts', '/types/dist/api/index.js'],
  },
];

function findIosBundle(appRoot) {
  const bundleDir = path.join(appRoot, 'dist/ios/_expo/static/js/ios');
  if (!fs.existsSync(bundleDir)) return null;
  const bundle = fs
    .readdirSync(bundleDir)
    .find((name) => name.endsWith('.hbc'));
  return bundle ? path.join(bundleDir, bundle) : null;
}

function findIosSourceMap(bundlePath) {
  const direct = `${bundlePath}.map`;
  if (fs.existsSync(direct)) return direct;

  const bundleDir = path.dirname(bundlePath);
  const sourceMap = fs
    .readdirSync(bundleDir)
    .find((name) => name.endsWith('.hbc.map'));
  return sourceMap ? path.join(bundleDir, sourceMap) : null;
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function normalizeSourcePath(source) {
  return String(source).replaceAll('\\', '/');
}

function sourceMapRegressions(sourceMapPath) {
  const parsed = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));
  const sources = Array.isArray(parsed.sources)
    ? parsed.sources.map(normalizeSourcePath)
    : [];
  if (sources.length === 0) {
    throw new Error(
      `iOS source map has no sources[] entries: ${sourceMapPath}`,
    );
  }

  const regressions = [];
  for (const rule of SOURCE_DENYLIST) {
    const matches = sources.filter((source) =>
      rule.patterns.some((pattern) => source.includes(pattern)),
    );
    if (matches.length > 0) {
      regressions.push({
        label: rule.label,
        matches: Array.from(new Set(matches)).sort(),
      });
    }
  }

  return { sources, regressions };
}

function assertIosBundleClean(appRoot) {
  const bundlePath = findIosBundle(appRoot);
  if (!bundlePath) {
    throw new Error(
      [
        '',
        'No iOS bundle found to scan. Export it first with source maps:',
        '',
        '  expo export --platform ios --output-dir dist/ios --source-maps',
        '',
      ].join('\n'),
    );
  }

  const sourceMapPath = findIosSourceMap(bundlePath);
  if (!sourceMapPath) {
    throw new Error(
      [
        '',
        'No iOS Hermes source map found. The module-list gate requires it.',
        'Export iOS with --source-maps before running ios:bundle-check.',
        '',
      ].join('\n'),
    );
  }

  const bundle = fs.readFileSync(bundlePath, 'latin1');
  const byteRegressions = [];
  const counts = {};

  for (const { term, baseline } of DENYLIST) {
    const count = countOccurrences(bundle, term);
    counts[term] = count;
    if (count > baseline) {
      byteRegressions.push(
        `${term}: found ${count}, expected at most ${baseline}`,
      );
    }
  }

  const sourceReport = sourceMapRegressions(sourceMapPath);

  if (process.env.IOS_BUNDLE_REPORT === '1') {
    console.log('iOS bundle marker counts:');
    for (const { term, baseline } of DENYLIST) {
      console.log(`  ${term}: ${counts[term]} (baseline ${baseline})`);
    }
    console.log(`iOS source modules: ${sourceReport.sources.length}`);
  }

  if (byteRegressions.length > 0 || sourceReport.regressions.length > 0) {
    const sourceDetails = sourceReport.regressions.flatMap((regression) => [
      `  - ${regression.label}`,
      ...regression.matches.map((match) => `      ${match}`),
    ]);

    throw new Error(
      [
        '',
        'iOS bundle contains wallet/execution surface beyond the allowed read-only graph:',
        ...byteRegressions.map((detail) => `  - ${detail}`),
        ...sourceDetails,
        '',
        'iOS may ship podcast and read-only portfolio analytics, but signing,',
        'wallet custody, invest/rebalance/send/bridge/approve execution code and',
        'broad app-core barrels must remain absent from the binary.',
        '',
        'Prefer a platform .ios.ts(x) split for execution UI and deep-import the',
        'single RN-safe app-core module needed by read-only analytics.',
        '',
      ].join('\n'),
    );
  }
}

module.exports = assertIosBundleClean;
module.exports.DENYLIST = DENYLIST;
module.exports.SOURCE_DENYLIST = SOURCE_DENYLIST;

if (require.main === module) {
  try {
    const appRoot = path.resolve(path.dirname(require.main.filename), '..');
    assertIosBundleClean(appRoot);
    console.log(
      'iOS bundle stayed within the read-only portfolio + podcast boundary.',
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
