import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { localArtifacts } from '../../scripts/media-artifacts';
import { LOCALES } from '@zapengine/kokode-story/locales';

describe('publisher artifact paths', () => {
  it('uses the supplied video directory and keeps decks app-local for every locale', () => {
    const appRoot = path.resolve('/tmp/kokode');
    const videoOutDir = path.resolve('/tmp/independent-renderer/films');
    const local = localArtifacts(appRoot, videoOutDir);
    for (const locale of LOCALES) {
      expect(local[`film.${locale}`]?.file).toBe(
        path.join(videoOutDir, `kokode-clinic.${locale}.mp4`),
      );
      expect(local[`poster.${locale}`]?.file).toBe(
        path.join(videoOutDir, `kokode-clinic.${locale}.poster.jpg`),
      );
      expect(local[`doctorDeck.${locale}`]?.file).toBe(
        path.join(appRoot, `output/kokode-pitch.${locale}.pdf`),
      );
      expect(local[`partnerDeck.${locale}`]?.file).toBe(
        path.join(appRoot, `output/kokode-pitch-partner.${locale}.pdf`),
      );
    }
  });
  it.each([undefined, '', ' '])(
    'rejects an absent video directory (%s)',
    (directory) => {
      expect(() => localArtifacts('/tmp/kokode', directory)).toThrow(
        '--video-out-dir',
      );
    },
  );
});
