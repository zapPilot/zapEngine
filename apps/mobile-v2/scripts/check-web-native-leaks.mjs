#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const bundleDir = join(appRoot, 'dist/web/_expo/static/js/web');
const nativeOnlyPackages = [
  '@privy-io/expo',
  '@privy-io/expo-native-extensions',
  'expo-secure-store',
  'react-native-passkeys',
];

function packagePathPattern(packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:^|[/\\\\]node_modules[/\\\\](?:\\.pnpm[/\\\\][^/\\\\]+[/\\\\]node_modules[/\\\\])?)${escaped}(?:[/\\\\]|$)`,
  );
}

function importPattern(packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:from\\s*['"]|import\\s*\\(?\\s*['"]|require\\(\\s*['"])${escaped}(?:[/'"])`,
  );
}

if (!existsSync(bundleDir)) {
  console.error(`Missing ${bundleDir}. Run pnpm run build:web first.`);
  process.exit(1);
}

const packagePathPatterns = nativeOnlyPackages.map((packageName) => ({
  packageName,
  pattern: packagePathPattern(packageName),
}));
const importPatterns = nativeOnlyPackages.map((packageName) => ({
  packageName,
  pattern: importPattern(packageName),
}));

const failures = [];
for (const filename of readdirSync(bundleDir)) {
  if (!filename.endsWith('.map')) continue;
  const sourceMapPath = join(bundleDir, filename);
  const sourceMap = JSON.parse(readFileSync(sourceMapPath, 'utf8'));
  const sources = Array.isArray(sourceMap.sources) ? sourceMap.sources : [];
  const contents = Array.isArray(sourceMap.sourcesContent)
    ? sourceMap.sourcesContent
    : [];

  for (const [index, source] of sources.entries()) {
    for (const { packageName, pattern } of packagePathPatterns) {
      if (pattern.test(String(source))) {
        failures.push(`${filename}: source includes ${packageName}: ${source}`);
      }
    }

    const content = String(contents[index] ?? '');
    for (const { packageName, pattern } of importPatterns) {
      if (pattern.test(content)) {
        failures.push(`${filename}: source imports ${packageName}: ${source}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Native-only packages leaked into the web bundle:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  'No native-only package sources or imports found in web sourcemaps.',
);
