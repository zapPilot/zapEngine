#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const args = [
  "src",
  "--min-lines",
  "3",
  "--threshold",
  "2.5",
  "--reporters",
  "console,json",
];

const jscpdEntry = require.resolve("jscpd");
const jscpdRoot = path.resolve(path.dirname(jscpdEntry), "..");
const jscpdBin = path.join(jscpdRoot, "bin", "jscpd");

const result = spawnSync(process.execPath, [jscpdBin, ...args], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
}

if (typeof result.status === "number" && result.status !== 0) {
  process.exit(result.status);
}

if (result.signal) {
  process.exit(1);
}

const reportPath = path.join(process.cwd(), ".jscpd", "jscpd-report.json");

if (!existsSync(reportPath)) {
  console.error("[dup-check] Missing .jscpd/jscpd-report.json");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (error) {
  console.error("[dup-check] Failed to parse jscpd report");
  console.error(error);
  process.exit(1);
}

const clonesFromStats = report?.statistics?.total?.clones;
const clonesFromList = Array.isArray(report?.duplicates)
  ? report.duplicates.length
  : 0;
const cloneCount =
  typeof clonesFromStats === "number" ? clonesFromStats : clonesFromList;

if (cloneCount > 0) {
  console.error(`[dup-check] Found ${cloneCount} duplicate blocks.`);
  process.exit(1);
}
