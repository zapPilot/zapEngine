// @ts-check
import { createNodeTsConfig } from "@zapengine/eslint-config/node-ts";

export default createNodeTsConfig({
  ignores: ["dist/**", "node_modules/**", "coverage/**", "**/*.js"],
  extraConfigs: [
    {
      rules: {
        // Keep alpha-etl's stricter unused var handling
        "@typescript-eslint/no-unused-vars": "error",
      },
    },
    {
      files: ["scripts/**/*.ts"],
      rules: {
        "no-console": "off",
      },
    },
  ],
});
