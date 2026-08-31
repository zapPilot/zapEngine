// CommonJS on purpose: kept consistent with the other iOS release-gate scripts.
const fs = require('node:fs');
const path = require('node:path');

// Denylist for the exported iOS Hermes bundle. The iOS build ships podcast-only
// (App Store Guideline 3.1.5(b)(i)), so no wallet/DeFi execution surface may be
// reachable from its module graph.
//
// Two kinds of entry:
//
// 1. Vendor/collision terms with a non-zero baseline. These cannot reach zero
//    because the hits come from dependencies we cannot drop, or from unrelated
//    identifiers that merely contain the term. Each baseline below is the exact
//    measured count, so any increase is a real regression. Every hit is
//    accounted for:
//      - eth_sendTransaction (2), personal_sign (1), WalletConnect (2):
//        @privy-io/expo ships its embedded-wallet RPC layer and WalletConnect
//        session errors regardless of `createOnLogin: 'off'`.
//      - createWalletClient (1): viem's exported function name in its module
//        registry.
//      - Hyperliquid (1): viem's "Hyperliquid EVM Testnet" chain definition,
//        part of viem's built-in chain list.
//      - Morpho (2): react-native-svg's `feMorphology` / `FeMorphology` filter
//        primitives. A substring collision, unrelated to Morpho Blue.
//      - Aave (1): "Aavegotchi GHST Token" in a vendor token list. Also a
//        substring collision, unrelated to Aave lending.
//
// 2. First-party wallet/execution markers, baseline 0. These strings only exist
//    in our wallet context or deposit/withdraw paths, so any hit at all means
//    that surface became reachable. They exist because the historical
//    `Hyperliquid` baseline of 3 hid a leak that had grown to 32 hits (the whole
//    @nktkas/hyperliquid SDK) plus 28 unguarded `GMX` hits. The wallet-provider
//    invariant also guards the auth-only iOS account screen after Sentry issue
//    ZAP-PILOT-NATIVE-2 exposed a wallet-backed account control there.
//
// The usual cause is not a missing `.ios.tsx` split but a BARREL import: one
// module in the iOS graph importing `@zapengine/app-core/hooks/queries` or
// `@core/services` or `@zapengine/types` pulls every sibling export with it.
// Prefer a deep import of the one module you need.
const DENYLIST = [
  // Vendor / substring collisions — measured exact counts.
  { term: 'eth_sendTransaction', baseline: 2 },
  { term: 'personal_sign', baseline: 1 },
  { term: 'WalletConnect', baseline: 2 },
  { term: 'MetaMask', baseline: 0 },
  { term: 'Morpho', baseline: 2 },
  { term: 'Aave', baseline: 1 },
  { term: 'Hyperliquid', baseline: 1 },
  { term: 'createWalletClient', baseline: 1 },
  // First-party wallet/execution surface — must stay absent.
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

function findIosBundle(appRoot) {
  const bundleDir = path.join(appRoot, 'dist/ios/_expo/static/js/ios');
  if (!fs.existsSync(bundleDir)) return null;
  const bundle = fs
    .readdirSync(bundleDir)
    .find((name) => name.endsWith('.hbc'));
  return bundle ? path.join(bundleDir, bundle) : null;
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

function assertIosBundleClean(appRoot) {
  const bundlePath = findIosBundle(appRoot);
  if (!bundlePath) {
    throw new Error(
      [
        '',
        'No iOS bundle found to scan. Export it first:',
        '',
        '  pnpm run build',
        '',
        'which produces dist/ios/_expo/static/js/ios/*.hbc.',
        '',
      ].join('\n'),
    );
  }

  // Hermes bytecode keeps string/identifier literals as plain, greppable
  // text even though the surrounding bytecode is binary, so a substring scan
  // over the raw bytes is enough — no disassembler needed. `latin1` maps
  // each byte to one code point, so ASCII substring matches stay exact.
  const bundle = fs.readFileSync(bundlePath, 'latin1');
  const regressions = [];

  for (const { term, baseline } of DENYLIST) {
    const count = countOccurrences(bundle, term);
    if (count > baseline) {
      regressions.push(`${term}: found ${count}, expected at most ${baseline}`);
    }
  }

  if (regressions.length > 0) {
    throw new Error(
      [
        '',
        'iOS bundle contains new wallet/DeFi surface beyond the known baseline:',
        ...regressions.map((detail) => `  - ${detail}`),
        '',
        'The iOS build ships podcast-only (Guideline 3.1.5(b)(i)); a new hit',
        'means a module reachable from the iOS route graph now pulls in',
        'wallet/DeFi code. Most often that is a BARREL import dragging in every',
        'sibling export (@zapengine/app-core/hooks/queries, @core/services,',
        '@zapengine/types) — import the single module you need instead. Failing',
        'that, look for a missing .ios.tsx split (see src/screens/*.ios.tsx).',
        '',
      ].join('\n'),
    );
  }
}

module.exports = assertIosBundleClean;
module.exports.DENYLIST = DENYLIST;

if (require.main === module) {
  try {
    const appRoot = path.resolve(path.dirname(require.main.filename), '..');
    assertIosBundleClean(appRoot);
    console.log('iOS bundle stayed within the known wallet/DeFi baseline.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
