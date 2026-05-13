import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appDir, '..', '..');

const requiredFiles = [
  'package.json',
  'CLAUDE.md',
  'site/index.html',
  'site/slides/deck.md',
  'scripts/build.mjs',
  'scripts/clean.mjs',
  'scripts/serve.mjs',
];

const failures = [];

function readAppFile(relativePath) {
  return readFileSync(join(appDir, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

for (const file of requiredFiles) {
  assert(existsSync(join(appDir, file)), `Missing ${file}`);
}

const agentsPath = join(appDir, 'AGENTS.md');
assert(existsSync(agentsPath), 'Missing AGENTS.md');
if (existsSync(agentsPath)) {
  assert(lstatSync(agentsPath).isSymbolicLink(), 'AGENTS.md must be a symlink');
}

if (existsSync(join(appDir, 'package.json'))) {
  const pkg = JSON.parse(readAppFile('package.json'));
  assert(pkg.name === '@zapengine/pitch-deck', 'package name must be @zapengine/pitch-deck');
  assert(pkg.private === true, 'package must stay private');

  const requiredScripts = [
    'dev',
    'build',
    'lint',
    'lint:fix',
    'type-check',
    'format',
    'format:check',
    'test',
    'test:ci',
    'test:coverage',
    'test:watch',
    'deadcode',
    'deadcode:fix',
    'security:audit',
    'clean',
  ];

  for (const script of requiredScripts) {
    assert(pkg.scripts?.[script], `package.json missing script "${script}"`);
  }
}

if (existsSync(join(appDir, 'site/index.html'))) {
  const html = readAppFile('site/index.html');
  assert(html.includes('reveal.js'), 'index.html must load Reveal.js from CDN');
  assert(html.includes('plugin/markdown/markdown'), 'index.html must load the Reveal Markdown plugin');
  assert(html.includes('data-markdown="slides/deck.md"'), 'index.html must load slides/deck.md');
  assert(html.includes('Reveal.initialize'), 'index.html must initialize Reveal');
  assert(html.includes('hash: true'), 'Reveal must enable hash navigation');
  assert(html.includes('transition: "fade"'), 'Reveal transition must be configured in JS');
  assert(!html.includes('data-separator-notes'), 'Keep speaker notes out of the MVP surface');
}

if (existsSync(join(appDir, 'site/slides/deck.md'))) {
  const deck = readAppFile('site/slides/deck.md');
  assert(!deck.startsWith('---\n'), 'deck.md must not use YAML frontmatter');
  assert(deck.includes('\n---\n'), 'deck.md must use horizontal slide separators');

  const narrativeAnchors = [
    'source: apps/landing-page/src/config/messages.ts',
    'A Non-Custodial BlackRock in Your Wallet.',
    'Buy in fear. Defend in greed.',
    'S&P 500',
    'BTC / ETH',
    'Stablecoins',
    '200MA',
    'Fear & Greed',
    'ETH/BTC',
    'EIP-7702',
    'Past performance does not guarantee future results.',
  ];

  for (const anchor of narrativeAnchors) {
    assert(deck.includes(anchor), `deck.md missing narrative anchor: ${anchor}`);
  }
}

const workflowPath = join(repoRoot, '.github/workflows/deploy-pitch-deck.yml');
assert(existsSync(workflowPath), 'Missing .github/workflows/deploy-pitch-deck.yml');
if (existsSync(workflowPath)) {
  const workflow = readFileSync(workflowPath, 'utf8');
  assert(workflow.includes('actions/upload-pages-artifact@v3'), 'Pages workflow must upload a Pages artifact');
  assert(workflow.includes('actions/deploy-pages@v4'), 'Pages workflow must deploy through GitHub Pages');
  assert(workflow.includes('pnpm --filter @zapengine/pitch-deck build'), 'Pages workflow must build the pitch-deck package');
  assert(workflow.includes('path: apps/pitch-deck/out'), 'Pages artifact must publish apps/pitch-deck/out');
}

if (failures.length > 0) {
  console.error('Pitch deck checks failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Pitch deck checks passed.');
