#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const registryPath = path.join(repoRoot, "apps.conf");

const globalTriggers = new Set([
  ".dockerignore",
  ".nvmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
]);

const registry = parseRegistry();
const registryByDir = new Map(registry.map((entry) => [entry.dir, entry]));

if (process.env.FORCE_ALL === "1") {
  printSelection(registry.map((entry) => entry.name));
  process.exit(0);
}

const stagedFiles = loadStagedFiles();
if (stagedFiles.length === 0) {
  process.exit(0);
}

if (stagedFiles.some((file) => globalTriggers.has(normalizePath(file)))) {
  printSelection(registry.map((entry) => entry.name));
  process.exit(0);
}

const allWorkspaces = loadAllWorkspaces();
const selected = new Set();
const changedPackageNames = new Set();

for (const file of stagedFiles) {
  const normalized = normalizePath(file);

  for (const entry of registry) {
    if (normalized === entry.dir || normalized.startsWith(`${entry.dir}/`)) {
      selected.add(entry.name);
    }
  }

  const workspace = findWorkspaceForFile(normalized, allWorkspaces);
  if (workspace !== null && workspace.path.startsWith("packages/")) {
    changedPackageNames.add(workspace.name);
  }
}

for (const packageName of changedPackageNames) {
  for (const workspace of loadDependents(packageName)) {
    const entry = registryByDir.get(workspace.path);
    if (entry !== undefined) {
      selected.add(entry.name);
    }
  }
}

printSelection(
  registry.filter((entry) => selected.has(entry.name)).map((entry) => entry.name)
);

function execJson(args) {
  const stdout = execFileSync("pnpm", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      TURBO_TELEMETRY_DISABLED: "1",
    },
  });
  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) {
    throw new Error(`Expected JSON output from pnpm ${args.join(" ")}`);
  }
  return JSON.parse(stdout.slice(jsonStart));
}

function findWorkspaceForFile(file, workspaces) {
  for (const workspace of workspaces) {
    if (file === workspace.path || file.startsWith(`${workspace.path}/`)) {
      return workspace;
    }
  }
  return null;
}

function loadAllWorkspaces() {
  const data = execJson(["turbo", "ls", "--output=json"]);
  return data.packages.items
    .map((item) => ({
      name: item.name,
      path: normalizePath(item.path),
    }))
    .sort((left, right) => right.path.length - left.path.length);
}

function loadDependents(packageName) {
  const data = execJson([
    "turbo",
    "ls",
    "--output=json",
    "--filter",
    `...${packageName}`,
  ]);
  return data.packages.items.map((item) => ({
    name: item.name,
    path: normalizePath(item.path),
  }));
}

function loadStagedFiles() {
  const cliFiles = process.argv.slice(2).map(normalizePath).filter(Boolean);
  if (cliFiles.length > 0) {
    return cliFiles;
  }

  return execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  )
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function parseRegistry() {
  return readFileSync(registryPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const [name, dir] = line.split("|");
      if (!name || !dir) {
        throw new Error(`Invalid registry entry: ${line}`);
      }
      return { name, dir };
    });
}

function printSelection(names) {
  if (names.length === 0) {
    return;
  }
  process.stdout.write(`${names.join("\n")}\n`);
}
