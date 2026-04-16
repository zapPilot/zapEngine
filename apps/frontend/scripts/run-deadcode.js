#!/usr/bin/env node

/**
 * Runs Knip and ts-prune back-to-back so that we catch unused files,
 * dependencies, and orphaned exports (including those hidden behind barrel files).
 *
 * Usage:
 *   npm run deadcode           -> default mode
 *   npm run deadcode:ci        -> CI/json reporter
 *   npm run deadcode:fix       -> Knip auto-fix + ts-prune report
 *   npm run deadcode:check     -> Knip check mode + ts-prune report
 */

const { spawnSync } = require("node:child_process");

const DEFAULT_MODE_KEY = "default";

const MODES = {
  default: {
    label: "Local dead-code scan",
    knipArgs: ["--files", "--exports", "--dependencies"],
    tsPruneArgs: [],
  },
  ci: {
    label: "CI dead-code scan",
    knipArgs: ["--files", "--exports", "--dependencies", "--reporter=json"],
    tsPruneArgs: [],
  },
  fix: {
    label: "Knip --fix + ts-prune",
    knipArgs: ["--files", "--exports", "--dependencies", "--fix"],
    tsPruneArgs: [],
  },
  check: {
    label: "Knip check + ts-prune",
    knipArgs: ["--files", "--exports", "--dependencies", "--no-config-hints"],
    tsPruneArgs: [],
  },
};

function runCommand(command, args) {
  console.log(`[deadcode] Running ${command} ${args.join(" ")}`.trim());
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error);
  }

  if (typeof result.status === "number") {
    return result.status;
  }

  return result.signal ? 1 : 0;
}

function shouldRunTsPrune(modeKey) {
  return modeKey !== "check";
}

const modeKey = process.argv[2] ?? DEFAULT_MODE_KEY;
const mode = MODES[modeKey];

if (!mode) {
  console.error(
    `[deadcode] Unknown mode "${modeKey}". Supported modes: ${Object.keys(
      MODES
    ).join(", ")}`
  );
  process.exit(1);
}

const knipStatus = runCommand("knip", mode.knipArgs);

if (shouldRunTsPrune(modeKey)) {
  runCommand("ts-prune", ["-p", "tsconfig.tsprune.json", ...mode.tsPruneArgs]);
}

// Exit based only on knip status
process.exit(knipStatus);
