import { Hono } from 'hono';

export interface ReleaseMetadataEnv {
  APP_BUILD_TIME?: string;
  APP_COMMIT_SHA?: string;
}

function normalizeReleaseValue(value?: string) {
  const normalizedValue = value?.trim();

  if (normalizedValue === '' || normalizedValue === undefined) {
    return null;
  }

  return normalizedValue;
}

export function getReleaseMetadata(rawEnv: ReleaseMetadataEnv = process.env) {
  return {
    commitSha: normalizeReleaseValue(rawEnv.APP_COMMIT_SHA),
    buildTime: normalizeReleaseValue(rawEnv.APP_BUILD_TIME),
  };
}

export function createHealthRoutes(rawEnv: ReleaseMetadataEnv = process.env) {
  const app = new Hono();

  app.get('/', (c) =>
    c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'account-engine',
      ...getReleaseMetadata(rawEnv),
    }),
  );

  return app;
}
