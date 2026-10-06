import path from 'node:path';
import { artifacts } from '../src/media/artifacts';

/** The registry supplies video output paths; decks remain app-local. */
export function localArtifacts(
  appRoot: string,
  videoOutDir: string | undefined,
) {
  if (!videoOutDir?.trim())
    throw new Error('publish requires --video-out-dir from the sales registry');
  return Object.fromEntries(
    Object.entries(artifacts).map(([id, spec]) => [
      id,
      {
        ...spec,
        file: path.resolve(
          spec.directory === 'video' ? videoOutDir : appRoot,
          spec.file,
        ),
      },
    ]),
  );
}
