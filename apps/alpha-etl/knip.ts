import { defineKnipConfig } from "@zapengine/knip-config/base";

export default defineKnipConfig({
  entry: ["scripts/**/*.ts"],
  project: ["src/**/*.ts", "scripts/**/*.ts"],
  ignore: ["**/*.test.ts", "**/*.spec.ts", "tests/**", "vitest.config.ts"],
  ignoreDependencies: ["@zapengine/types"],
  includeEntryExports: true,
  vitest: {
    config: ["vitest.config.ts"],
    entry: ["tests/**/*.{test,spec}.ts", "src/**/__tests__/*.{test,spec}.ts"],
  },
});
