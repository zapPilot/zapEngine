import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4175',
        // Hono uses Host to compare request origin with browser Origin.
        // Preserve the frontend origin instead of replacing it with port 4175.
        changeOrigin: false,
      },
    },
  },
});
