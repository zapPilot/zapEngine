import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readFallbackModels(path) {
  const env = await readFile(path, 'utf8');
  const line = env
    .split(/\r?\n/)
    .find((entry) => entry.startsWith('LLM_FALLBACK_MODELS='));

  assert.ok(line, `${path} must define LLM_FALLBACK_MODELS`);
  return line.slice('LLM_FALLBACK_MODELS='.length).split(',');
}

test('dev and prod share the same OpenRouter fallback model chain', async () => {
  const [devModels, prodModels] = await Promise.all([
    readFallbackModels('config/env/dev.env'),
    readFallbackModels('config/env/prod.env'),
  ]);

  assert.deepEqual(devModels, prodModels);
});

test('Minimax M3 fallback uses the paid model instead of the removed free variant', async () => {
  const models = await readFallbackModels('config/env/prod.env');

  assert.ok(models.includes('minimax/minimax-m3'));
  assert.ok(!models.includes('minimax/minimax-m3:free'));
});
