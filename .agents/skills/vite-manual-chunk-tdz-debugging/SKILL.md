# Vite manual chunk TDZ debugging

Use this skill when a Vite-built React app crashes at runtime with errors like:

- `ReferenceError: Cannot access '<minified export>' before initialization`
- an exception originating from `vendor-*.js`
- a crash that appears only in production, packaged, or Tauri builds while type-check/build still pass
- runtime failures involving wallet/provider libraries such as Privy, viem, wagmi, WalletConnect, Web3Modal, or similar ESM-heavy packages

## Why this happens

Manual Vite/Rollup chunks can accidentally split cyclic ESM graphs across vendor files. The app may compile successfully, but the browser evaluates one chunk before another export has finished initializing, producing a temporal-dead-zone error on a minified symbol.

Wallet stacks are especially sensitive because provider packages often import viem, transport helpers, modal packages, and chain utilities through several nested entrypoints.

## Debugging checklist

1. Inspect the relevant `vite.config.ts` for `manualChunks`.
2. Search the built output for vendor chunks:

```bash
find dist/assets -maxdepth 1 -type f -name 'vendor-*.js' -print | sort
```

3. Identify any manually isolated chunks for libraries with deep internal imports or known ESM cycles.
4. Compare against a known-working app's Vite config before changing application code.
5. Prefer removing the suspicious manual chunk first. Let Rollup keep the package in its natural chunk graph.
6. Rebuild and confirm the removed chunk is gone from `dist/assets`.

## Known Zap Engine case

In `apps/desktop`, forcing `@privy-io/*` into a dedicated `vendor-privy` chunk caused this desktop runtime error:

```txt
ReferenceError: Cannot access 'wZ' before initialization
```

The fix was to remove the `vendor-privy` manual chunk and let Rollup keep Privy in its natural chunk graph. `vendor-viem` remained because it matched the known-working frontend config.

Use these checks for that case:

```bash
pnpm --filter @zapengine/desktop build:web
find apps/desktop/dist/assets -maxdepth 1 -type f -name 'vendor-*.js' -print | sort
grep -R "vendor-privy" -n apps/desktop/dist apps/desktop/vite.config.ts || true
```

Expected: no `vendor-privy` output.
