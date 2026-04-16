#!/usr/bin/env node

/**
 * Analyze exports to find which are only used in test files
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get all deadcode exports from ts-prune
console.log("🔍 Running ts-prune to find unused exports...\n");
// eslint-disable-next-line sonarjs/no-os-command-from-path
const tsPruneOutput = execSync("npm run deadcode:exports 2>&1", {
  cwd: __dirname,
  encoding: "utf-8",
});

// Parse ts-prune output
const exports = [];
const lines = tsPruneOutput.split("\n");
for (const line of lines) {
  // Format: src/path/file.ts:line - exportName (used in module)?
  const match = line.match(/^(src\/[^:]+):(\d+) - ([^\s(]+)/);
  if (match) {
    const [, filePath, lineNum, exportName] = match;
    const usedInModule = line.includes("(used in module)");
    exports.push({
      filePath,
      lineNum: parseInt(lineNum),
      exportName,
      usedInModule,
    });
  }
}

console.log(`Found ${exports.length} potentially unused exports\n`);

// For each export, check if it's used in test files
const testOnlyExports = [];
const trulyUnused = [];

for (const exp of exports) {
  try {
    // Search for usage in test files
    // eslint-disable-next-line sonarjs/os-command
    const testSearch = execSync(
      `grep -r "${exp.exportName}" tests/ 2>/dev/null || true`,
      { cwd: path.join(__dirname, ".."), encoding: "utf-8" }
    );

    // Search for usage in src (excluding the file where it's defined)
    // eslint-disable-next-line sonarjs/os-command
    const srcSearch = execSync(
      `grep -r "${exp.exportName}" src/ 2>/dev/null | grep -v "${exp.filePath}" || true`,
      { cwd: path.join(__dirname, ".."), encoding: "utf-8" }
    );

    const usedInTests = testSearch.trim().length > 0;
    const usedInSrc = srcSearch.trim().length > 0;

    if (usedInTests && !usedInSrc) {
      testOnlyExports.push(exp);
    } else if (!usedInTests && !usedInSrc) {
      trulyUnused.push(exp);
    }
  } catch {
    // Ignore grep errors
  }
}

console.log("📊 Analysis Results:\n");
console.log(`✅ Truly unused exports: ${trulyUnused.length}`);
console.log(`🧪 Test-only exports: ${testOnlyExports.length}`);
console.log(
  `📦 Total to remove: ${trulyUnused.length + testOnlyExports.length}\n`
);

// Output detailed results
if (trulyUnused.length > 0) {
  console.log("═══ TRULY UNUSED EXPORTS ═══\n");
  for (const exp of trulyUnused) {
    console.log(`${exp.filePath}:${exp.lineNum} - ${exp.exportName}`);
  }
  console.log();
}

if (testOnlyExports.length > 0) {
  console.log("═══ TEST-ONLY EXPORTS (can be removed) ═══\n");
  for (const exp of testOnlyExports) {
    console.log(`${exp.filePath}:${exp.lineNum} - ${exp.exportName}`);
  }
  console.log();
}

// Save results to a file
const results = {
  trulyUnused,
  testOnlyExports,
  timestamp: new Date().toISOString(),
};

fs.writeFileSync(
  path.join(__dirname, "..", "deadcode-analysis.json"),
  JSON.stringify(results, null, 2)
);

console.log("📄 Results saved to deadcode-analysis.json");
