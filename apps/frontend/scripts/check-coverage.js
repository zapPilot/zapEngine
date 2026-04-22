#!/usr/bin/env node

/**
 * Custom coverage threshold checker for Vitest
 * This script enforces coverage thresholds when Vitest's built-in enforcement fails
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COVERAGE_FILE = path.join(__dirname, '../coverage/coverage-summary.json');
const THRESHOLDS = {
  statements: 96,
  branches: 93,
  functions: 96,
  lines: 96,
};

function checkCoverageThresholds() {
  // Check if coverage file exists
  if (!fs.existsSync(COVERAGE_FILE)) {
    console.error('❌ Coverage file not found. Run tests with coverage first.');
    process.exit(1);
  }

  // Read coverage data
  const coverage = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));
  const { total } = coverage;

  console.log('\n📊 Coverage Threshold Check');
  console.log('─'.repeat(50));

  let failed = false;

  Object.entries(THRESHOLDS).forEach(([metric, threshold]) => {
    const actual = total[metric].pct;
    const passed = actual >= threshold;

    if (!passed) failed = true;

    const status = passed ? '✅' : '❌';
    const result = `${status} ${metric.padEnd(12)}: ${actual.toFixed(2).padStart(6)}% (threshold: ${threshold}%)`;
    console.log(result);
  });

  console.log('─'.repeat(50));

  if (failed) {
    console.log('\n❌ Coverage thresholds not met!');
    process.exit(1);
  } else {
    console.log('\n✅ All coverage thresholds passed!');
    process.exit(0);
  }
}

checkCoverageThresholds();
