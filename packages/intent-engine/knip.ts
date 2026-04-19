import { defineKnipConfig } from "@zapengine/knip-config/base";

export default defineKnipConfig({
  entry: ["examples/basic-usage.ts"],
  project: ["src/**/*.ts", "test/**/*.ts", "examples/**/*.ts"],
  vitest: {
    entry: ["test/**/*.{test,spec}.ts"],
  },
});
