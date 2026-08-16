// CommonJS on purpose: kept consistent with the other iOS release-gate scripts.
const fs = require('node:fs');
const path = require('node:path');

// Baseline hit counts for each term in the exported iOS Hermes bundle, as of
// the podcast-only bundle cut (see the iOS App Store plan). A count above
// baseline usually means a *new* reachable wallet/DeFi code path leaked into
// the iOS bundle graph. A count at/under baseline is one of:
//  - @privy-io/expo + viem SDK internals: Privy ships its embedded-wallet RPC
//    layer regardless of the `createOnLogin: 'off'` runtime config, so these
//    strings exist in vendor code we cannot remove without dropping Privy.
//  - i18n copy in src/i18n/translations.ts (documented, not worth a platform
//    split for a handful of protocol-name strings).
//  - The never-rendered LegacyHyperliquidScreen.ios stub's own identifier
//    name, which itself contains "Hyperliquid".
const DENYLIST = [
  { term: 'eth_sendTransaction', baseline: 2 },
  { term: 'personal_sign', baseline: 1 },
  { term: 'WalletConnect', baseline: 2 },
  { term: 'MetaMask', baseline: 0 },
  { term: 'Morpho', baseline: 2 },
  { term: 'Aave', baseline: 1 },
  { term: 'Hyperliquid', baseline: 3 },
  { term: 'createWalletClient', baseline: 1 },
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
        'usually means a screen or hook that should stay wallet-free now',
        'imports something reachable from the iOS bundle graph. Look for a',
        'missing .ios.tsx platform split (see src/screens/*.ios.tsx).',
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
