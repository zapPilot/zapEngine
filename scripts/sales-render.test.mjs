import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSteps,
  discoverArtifacts,
  formatSummary,
  parseProductName,
} from './sales-render.mjs';

test('parseProductName takes the first positional past --', () => {
  assert.equal(parseProductName(['kokode']), 'kokode');
  assert.equal(parseProductName(['--', 'zap-pilot']), 'zap-pilot');
  assert.equal(parseProductName([]), undefined);
});

test('kokode plans PDF then check+render per video', () => {
  const steps = buildSteps('kokode');
  assert.deepEqual(steps[0].args, [
    'turbo',
    'run',
    'build',
    '--filter=@zapengine/video^...',
  ]);
  assert.deepEqual(
    steps.map((step) => step.kind),
    ['package-build', 'pdf', 'video-check', 'video-render'],
  );
  assert.deepEqual(steps[1].args, [
    '--filter',
    '@zapengine/kokode-ai',
    'pitch:pdf',
  ]);
  assert.deepEqual(steps[2].args, [
    '--silent',
    '--filter',
    '@zapengine/video',
    'check',
    'kokode-clinic',
  ]);
  assert.deepEqual(steps[3].args, [
    '--filter',
    '@zapengine/video',
    'render',
    'kokode-clinic',
  ]);
});

test('zap-pilot plans no PDF step', () => {
  const steps = buildSteps('zap-pilot');
  assert.deepEqual(
    steps.map((step) => step.kind),
    ['package-build', 'video-check', 'video-render'],
  );
  assert.deepEqual(steps[2].args, [
    '--filter',
    '@zapengine/video',
    'render',
    'calculator-pitch',
  ]);
});

test('no planned step can invoke paid generation or the env runner', () => {
  for (const product of ['kokode', 'zap-pilot']) {
    for (const step of buildSteps(product)) {
      const command = [step.cmd, ...step.args].join(' ');
      for (const marker of [
        'voiceover',
        'music',
        'make',
        'env/run.mjs',
        'FISH_AUDIO',
        'OPENROUTER',
      ]) {
        assert.ok(
          !command.includes(marker),
          `${product} step must be free: ${command}`,
        );
      }
    }
  }
});

test('buildSteps rejects unknown products', () => {
  assert.throws(() => buildSteps('nope'), /Expected exactly one product/);
});

test('discoverArtifacts lists only matching basenames, sorted', () => {
  assert.deepEqual(discoverArtifacts('does-not-exist', /\.mp4$/), []);
  const scripts = discoverArtifacts('scripts', /^sales-.*\.mjs$/);
  assert.ok(scripts.includes('sales-render.mjs'));
  assert.ok(scripts.includes('sales-registry.mjs'));
  assert.deepEqual([...scripts].sort(), scripts);
  assert.ok(!scripts.includes('ops.mjs'));
});

test('formatSummary prints the human-readable artifact list', () => {
  const summary = formatSummary(
    'KOKODE',
    ['kokode-pitch.ja.pdf'],
    ['kokode-clinic.ja.mp4', 'kokode-clinic.en.mp4'],
  );
  assert.ok(summary.includes('KOKODE sales artifacts'));
  assert.ok(summary.includes('✓ kokode-pitch.ja.pdf'));
  assert.ok(summary.includes('✓ kokode-clinic.en.mp4'));
  assert.ok(summary.includes('3 artifacts rendered.'));
  assert.ok(summary.includes('No paid generation APIs were called.'));
});

test('formatSummary omits the PDF section when a product has no PDFs', () => {
  const summary = formatSummary('ZAP PILOT', [], ['calculator-pitch.en.mp4']);
  assert.ok(!summary.includes('\nPDF\n'));
  assert.ok(summary.includes('1 artifact rendered.'));
});
