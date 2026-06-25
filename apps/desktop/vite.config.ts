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

  return undefined;
}

// Desktop loads from the repo-root .env (shared with the other apps) and runs on
// its own port so it never collides with frontend/landing (3000).
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
  },
  server: {
    port: 3005,
    strictPort: true,
    host: '127.0.0.1',
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
