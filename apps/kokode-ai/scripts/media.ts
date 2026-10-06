import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  manifestSchema,
  newReleaseId,
  planPublish,
  readSidecar,
  sha256File,
  verifyPublicArtifact,
  writeJsonAtomic,
  type Artifact,
  type Sidecar,
} from '@zapengine/media-release';
import { createR2Client, putImmutable } from '@zapengine/media-release/r2';
import { localArtifacts } from './media-artifacts';
import { artifacts, MEDIA_BASE } from '../src/media/artifacts';
import { expectedFingerprints } from '../src/media/fingerprints';
import { validatePublished } from '../src/media/validate';
const appRoot = path.resolve(import.meta.dirname, '..');
const manifestFile = path.join(appRoot, 'src/media/published.json');
const { values, positionals } = parseArgs({
  options: {
    'dry-run': { type: 'boolean' },
    only: { type: 'string' },
    'video-out-dir': { type: 'string' },
  },
  allowPositionals: true,
});
const command = positionals[0];
if (!['publish', 'verify'].includes(command ?? '') || positionals.length !== 1)
  throw new Error(
    'usage: media.ts publish --video-out-dir <directory> [--dry-run] [--only id,id] | verify',
  );
const expected = expectedFingerprints();
const previous = manifestSchema.parse(
  JSON.parse(await readFile(manifestFile, 'utf8')),
);
if (command === 'verify') {
  const manifest = validatePublished(previous, expected);
  for (const [id, artifact] of Object.entries(manifest.artifacts)) {
    await verifyPublicArtifact(artifact, {
      disposition: artifacts[id]?.disposition,
    });
    console.log(`✓ ${id}`);
  }
} else {
  const local = localArtifacts(appRoot, values['video-out-dir']);
  const selected = values.only?.split(',') ?? Object.keys(artifacts);
  if (
    selected.length === 0 ||
    selected.some((id) => !(id in artifacts)) ||
    new Set(selected).size !== selected.length
  )
    throw new Error('Unknown or duplicate --only artifact');
  const release = newReleaseId();
  const next = { release, artifacts: { ...previous.artifacts } };
  const uploads: {
    id: string;
    file: string;
    key: string;
    artifact: Artifact;
  }[] = [];
  for (const id of selected) {
    const spec = artifacts[id]!;
    const file = local[id]!.file;
    let sidecar: Sidecar | undefined;
    let actualHash: string | undefined;
    let actualBytes: number | undefined;
    try {
      sidecar = await readSidecar(`${file}.json`);
      actualHash = await sha256File(file);
      actualBytes = (await stat(file)).size;
    } catch {
      /* Missing/invalid local output can retain a fresh published artifact. */
    }
    const plan = planPublish({
      expected: expected[id]!,
      sidecar,
      actualHash,
      actualBytes,
      published: previous.artifacts[id],
      renderCommand: spec.renderCommand,
    });
    if (plan.action === 'retain') {
      next.artifacts[id] = plan.artifact;
      console.log(`retain ${id}`);
    } else {
      const key = `releases/${release}/${spec.object}`;
      const artifact: Artifact = {
        url: `${MEDIA_BASE}/${key}`,
        fingerprint: expected[id]!,
        sha256: plan.sidecar.sha256,
        bytes: plan.sidecar.bytes,
        contentType: spec.contentType,
        renderedAt: plan.sidecar.renderedAt,
        sourceCommit: plan.sidecar.sourceCommit,
      };
      next.artifacts[id] = artifact;
      uploads.push({ id, file, key, artifact });
      console.log(`upload ${id}: ${artifact.bytes} bytes → ${artifact.url}`);
    }
  }
  // A partial publish must still leave a complete, current release.
  validatePublished(next, expected);
  if (!values['dry-run']) {
    if (uploads.length > 0) {
      const required = [
        'KOKODE_MEDIA_R2_ENDPOINT',
        'KOKODE_MEDIA_R2_ACCESS_KEY_ID',
        'KOKODE_MEDIA_R2_SECRET_ACCESS_KEY',
      ] as const;
      for (const name of required)
        if (!process.env[name])
          throw new Error(
            `Missing ${name}; create the Kokode-only R2 publisher token and store it in Kokode Infisical prod`,
          );
      const client = createR2Client({
        endpoint: process.env[required[0]]!,
        accessKeyId: process.env[required[1]]!,
        secretAccessKey: process.env[required[2]]!,
      });
      try {
        for (const upload of uploads)
          await putImmutable(client, {
            bucket: 'kokode-media',
            key: upload.key,
            body: await readFile(upload.file),
            sha256: upload.artifact.sha256,
            contentType: upload.artifact.contentType,
            disposition: artifacts[upload.id]?.disposition,
          });
      } finally {
        client.destroy();
      }
    }
    for (const [id, artifact] of Object.entries(next.artifacts))
      await verifyPublicArtifact(artifact, {
        disposition: artifacts[id]?.disposition,
      });
    if (uploads.length > 0) await writeJsonAtomic(manifestFile, next);
  }
}
