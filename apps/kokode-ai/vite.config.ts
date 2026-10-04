import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

import { HTML_ENTRIES } from './src/site/pages';
import { kokodePages } from './src/site/plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/',
  plugins: [kokodePages()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        Object.entries(HTML_ENTRIES).map(([name, file]) => [
          name,
          resolve(__dirname, file),
        ]),
      ),
    },
  },
});
