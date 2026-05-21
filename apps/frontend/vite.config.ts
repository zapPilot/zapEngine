import path from "node:path";

import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import type { PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

const enforceCoverageThresholds =
  process.env["VITEST_ENFORCE_THRESHOLDS"] !== "false";

const coverageThresholds = {
  global: {
    statements: 95,
    branches: 91,
    functions: 95,
    lines: 95,
  },
} as const;

const REPO_ROOT = path.resolve(__dirname, "../..");

function getManualChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) {
    return "vendor-react";
  }

  if (id.includes(`${path.sep}node_modules${path.sep}recharts${path.sep}`)) {
    return "vendor-recharts";
  }

  if (/[\\/]node_modules[\\/](wagmi|viem)[\\/]/.test(id)) {
    return "vendor-wagmi";
  }

  if (id.includes(`${path.sep}node_modules${path.sep}framer-motion${path.sep}`)) {
    return "vendor-motion";
  }

  if (id.includes(`${path.sep}node_modules${path.sep}@tanstack${path.sep}`)) {
    return "vendor-tanstack";
  }

  return undefined;
}

export default defineConfig(({ mode }) => ({
  envDir: REPO_ROOT,
  plugins: [
    react(),
    ...(mode === "analyze"
      ? [
          visualizer({
            filename: "dist/stats.html",
            gzipSize: true,
            brotliSize: true,
            template: "treemap",
          }) as unknown as PluginOption,
        ]
      : []),
    VitePWA({
      disable: mode === "analyze",
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{css,html,ico,png,svg,webp,js}"],
        globIgnores: ["**/*.map", "**/vendor-*.js", "**/vendor-*.js.map"],
        maximumFileSizeToCacheInBytes: 380 * 1024,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "app-pages",
            },
          },
          {
            urlPattern: ({ request }) =>
              ["style", "script", "font", "image"].includes(
                request.destination,
              ),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-assets",
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
      {
        find: "@base-org/account",
        replacement: path.resolve(__dirname, "./src/shims/emptyModule.ts"),
      },
      {
        find: "@metamask/connect-evm",
        replacement: path.resolve(__dirname, "./src/shims/emptyModule.ts"),
      },
    ],
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },
  test: {
    pool: "forks",
    maxWorkers: 1,
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup/index.ts"],
    include: [
      "tests/unit/**/*.{test,spec}.{js,ts,tsx}",
      "tests/integration/**/*.{test,spec}.{js,ts,tsx}",
    ],
    exclude: ["tests/e2e/**/*"],
    css: false,
    isolate: true,
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    env: {
      IS_REACT_ACT_ENVIRONMENT: "true",
      NODE_ENV: "test",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      include: ["src/**/*.{js,ts,jsx,tsx}"],
      exclude: [
        "node_modules/",
        "tests/setup/**",
        "tests/e2e/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/coverage/**",
        "src/types/**",
        "src/**/*.stories.*",
        "src/**/*.test.*",
        "src/**/*.spec.*",
        "src/hooks/ui/useChartHover.ts",
        "src/hooks/ui/useClickOutside.ts",
        "src/hooks/ui/useAsyncRetryButton.ts",
      ],
      reportOnFailure: true,
      ...(enforceCoverageThresholds
        ? { thresholds: coverageThresholds }
        : {}),
    },
  },
}));
