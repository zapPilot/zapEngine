import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const REPO_ROOT = path.resolve(__dirname, '../..');

function getManualChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  if (
    /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(
      id,
    )
  ) {
    return 'vendor-react';
  }

  if (id.includes(`${path.sep}node_modules${path.sep}recharts${path.sep}`)) {
    return 'vendor-recharts';
  }

  if (
    id.includes(`${path.sep}node_modules${path.sep}framer-motion${path.sep}`)
  ) {
    return 'vendor-motion';
  }

  if (/[\\/]node_modules[\\/]viem[\\/]/.test(id)) {
    return 'vendor-viem';
  }

  if (id.includes(`${path.sep}node_modules${path.sep}@tanstack${path.sep}`)) {
    return 'vendor-tanstack';
  }

  // Do not force @privy-io/* into a single vendor chunk. Privy imports viem and
  // related wallet modules through several nested entrypoints; isolating all of
  // Privy into one manual chunk can create an ES module TDZ cycle at runtime
  // (for example: "Cannot access 'wZ' before initialization" from vendor-viem).
  // Leave Privy to Rollup's natural chunk graph.

  return undefined;
}

// Desktop loads from the repo-root .env (shared with the other apps) and runs on
// its own port so it never collides with landing (3000).
export default defineConfig({
  envDir: REPO_ROOT,
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
    // @zapengine/app-core declares these React-context-bearing libs as peer
    // dependencies; dedupe pins a single instance so PrivyProvider /
    // QueryClientProvider context reaches app-core's hooks.
    dedupe: [
      '@privy-io/react-auth',
      '@tanstack/react-query',
      '@tanstack/react-query-devtools',
      'react',
      'react-dom',
    ],
  },
  server: {
    port: 3005,
    strictPort: true,
    host: '127.0.0.1',
    headers: {
      // Optimized dependency chunks are immutable by default. In the in-app
      // browser that can preserve stale chunk references after Vite re-optimizes
      // deps without changing the dependency browser hash.
      'Cache-Control': 'no-cache',
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },
});
