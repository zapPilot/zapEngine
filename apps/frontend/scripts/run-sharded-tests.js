#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const VITEST_BIN = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");
const TEST_DIRECTORIES = [
  path.join(ROOT, "tests", "unit"),
  path.join(ROOT, "tests", "integration"),
];
const TEST_FILE_PATTERN = /\.(test|spec)\.(js|ts|tsx)$/;
const SUPPORTED_NODE_MAJOR = 22;
const DEFAULT_BATCH_SIZE = 12;
const BATCH_SIZE = Number(
  process.env.VITEST_TEST_BATCH_SIZE || String(DEFAULT_BATCH_SIZE)
);

if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE <= 0) {
  console.error(
    `[test] Invalid VITEST_TEST_BATCH_SIZE value: ${process.env.VITEST_TEST_BATCH_SIZE || ""}`
  );
  process.exit(1);
}

function warnAboutNodeVersion() {
  const majorVersion = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (majorVersion !== SUPPORTED_NODE_MAJOR) {
    console.warn(
      `[test] Warning: validated on Node ${SUPPORTED_NODE_MAJOR}. Current runtime is Node ${process.versions.node}; newer majors are best-effort.`
    );
  }
}

function collectTestFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }

    if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      files.push(path.relative(ROOT, fullPath).split(path.sep).join("/"));
    }
  }

  return files;
}

function chunkFiles(files, chunkSize) {
  const chunks = [];

  for (let index = 0; index < files.length; index += chunkSize) {
    chunks.push(files.slice(index, index + chunkSize));
  }

  return chunks;
}

function runVitest(args) {
  const result = spawnSync(process.execPath, [VITEST_BIN, ...args], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[test] Failed to launch Vitest: ${result.error.message}`);
    return 1;
  }

  return result.status || 0;
}

function runBatch(batchFiles, batchLabel) {
  console.log(`[test] Running batch ${batchLabel} (${batchFiles.length} files)`);

  const status = runVitest(["run", ...batchFiles]);

  if (status === 0) {
    return;
  }

  if (batchFiles.length === 1) {
    console.error(
      `[test] Batch ${batchLabel} failed for ${batchFiles[0]} and could not be split further.`
    );
    process.exit(status || 1);
  }

  const midpoint = Math.ceil(batchFiles.length / 2);
  const leftBatch = batchFiles.slice(0, midpoint);
  const rightBatch = batchFiles.slice(midpoint);

  console.warn(
    `[test] Batch ${batchLabel} failed. Retrying as ${batchLabel}a (${leftBatch.length} files) and ${batchLabel}b (${rightBatch.length} files).`
  );

  runBatch(leftBatch, `${batchLabel}a`);
  runBatch(rightBatch, `${batchLabel}b`);
}

warnAboutNodeVersion();

const testFiles = TEST_DIRECTORIES.flatMap(collectTestFiles).sort((left, right) =>
  left.localeCompare(right)
);

if (testFiles.length === 0) {
  console.error("[test] No unit or integration test files found.");
  process.exit(1);
}

const batches = chunkFiles(testFiles, BATCH_SIZE);

console.log(
  `[test] Discovered ${testFiles.length} test files across ${batches.length} batches (batch size: ${BATCH_SIZE})`
);

for (const [batchIndex, batchFiles] of batches.entries()) {
  runBatch(batchFiles, `${batchIndex + 1}/${batches.length}`);
}
