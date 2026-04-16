import path from "node:path";

import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

const enforceCoverageThresholds =
  process.env["VITEST_ENFORCE_THRESHOLDS"] !== "false";

const coverageThresholds = {
  global: {
    statements: 96,
    branches: 93,
    functions: 96,
    lines: 96,
  },
} as const;

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{css,html,ico,png,svg,webp,js}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "app-pages",
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
  },
  test: {
    pool: "forks",
    maxWorkers: 1,
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
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
        "tests/setup.ts",
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
});
