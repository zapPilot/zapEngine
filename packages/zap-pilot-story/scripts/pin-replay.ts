import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { format } from 'prettier';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check' && !/^--rev=.+$/.test(arg))) {
  throw new Error('Usage: pin:replay [--check] [--rev=<git revision>]');
}
const revision =
  args.find((arg) => arg.startsWith('--rev='))?.slice(6) ?? '99426e898';
const commit = execFileSync(
  'git',
  ['rev-parse', '--verify', `${revision}^{commit}`],
  { cwd: root, encoding: 'utf8' },
).trim();
function source(name: string) {
  const path = `apps/landing-page/src/data/${name}.json`;
  const raw = execFileSync('git', ['show', `${commit}:${path}`], {
    cwd: root,
    encoding: 'utf8',
  });
  return {
    path,
    sha256: createHash('sha256').update(raw).digest('hex'),
    data: JSON.parse(raw),
  };
}
const curve = source('equity-curve');
const snapshot = source('strategy-snapshot');
if (
  curve.data.window.end !== '2026-10-05' ||
  snapshot.data.reference_date !== curve.data.window.end
) {
  throw new Error('This replay pin requires the window ending 2026-10-05');
}
const payload = {
  provenance: {
    commit,
    sources: [curve, snapshot].map(({ path, sha256 }) => ({ path, sha256 })),
  },
  window: curve.data.window,
  drawdownBand: curve.data.drawdownBand,
  series: curve.data.series.map(
    ({
      color: _color,
      ...series
    }: {
      color: string;
      id: string;
      label: string;
      values: { date: string; value: number }[];
    }) => series,
  ),
  allocations: curve.data.allocations,
  events: curve.data.events,
  eventsMeta: curve.data.eventsMeta,
  snapshot: snapshot.data,
};
const output = resolve(
  root,
  'packages/zap-pilot-story/src/facts/data/replay-2026-10-05.json',
);
const encoded = await format(JSON.stringify(payload), { parser: 'json' });
if (args.includes('--check')) {
  if (readFileSync(output, 'utf8') !== encoded)
    throw new Error('Pinned replay drift; run pin:replay to regenerate');
} else {
  writeFileSync(output, encoded);
}
