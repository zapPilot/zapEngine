#!/usr/bin/env node

/**
 * Automated dead code removal script
 * Removes specific exported functions/constants/types based on analysis
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");

// Define removals by file
const REMOVALS = {
  "src/utils/formatters.ts": [
    { name: "formatSharpeRatio", type: "function" },
    { name: "formatDrawdown", type: "function" },
    { name: "formatVolatility", type: "function" },
    { name: "formatNumber", type: "function" },
  ],
  "src/utils/logger.ts": [
    { name: "swapLogger", type: "const" },
    { name: "chainLogger", type: "const" },
  ],
};

function removeExport(filePath, exportName) {
  const fullPath = path.join(projectRoot, filePath);
  const content = readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");

  // Find and remove the export
  let inExport = false;
  let braceCount = 0;
  let startLine = -1;
  let endLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for export pattern
    if (!inExport) {
      const exportPattern = new RegExp(
        `export\\s+(const|function|type|interface)\\s+${exportName}[\\s(:=]`
      );
      if (exportPattern.test(line)) {
        inExport = true;
        startLine = i;

        // Check if single-line export
        if (line.includes(";") && !line.includes("{")) {
          endLine = i;
          break;
        }

        // Count braces for multi-line
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
      }
    } else {
      // Track brace count
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      // Check for end
      if (braceCount === 0 && (line.includes(";") || line.includes("}"))) {
        endLine = i;
        break;
      }
    }
  }

  if (startLine >= 0 && endLine >= 0) {
    // Remove lines including JSDoc comments before export
    let actualStart = startLine;
    while (
      actualStart > 0 &&
      (lines[actualStart - 1].trim().startsWith("*") ||
        lines[actualStart - 1].trim().startsWith("/**") ||
        lines[actualStart - 1].trim() === "")
    ) {
      actualStart--;
    }

    lines.splice(actualStart, endLine - actualStart + 1);
    writeFileSync(fullPath, lines.join("\n"));
    console.log(`✅ Removed ${exportName} from ${filePath}`);
    return true;
  }

  console.log(`⚠️  Could not find ${exportName} in ${filePath}`);
  return false;
}

// Process removals
console.log("🧹 Starting automated dead code removal...\n");

let removedCount = 0;
let skippedCount = 0;

for (const [filePath, exports] of Object.entries(REMOVALS)) {
  console.log(`\n📄 Processing ${filePath}...`);
  for (const exp of exports) {
    const success = removeExport(filePath, exp.name);
    if (success) removedCount++;
    else skippedCount++;
  }
}

console.log(`\n\n✨ Removal complete!`);
console.log(`✅ Removed: ${removedCount}`);
console.log(`⚠️  Skipped: ${skippedCount}`);
