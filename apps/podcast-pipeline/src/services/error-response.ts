import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export function handleAppError(error: Error, c: Context): Response {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }

  const err = error as Error & { $metadata?: unknown; cause?: unknown };
  console.error('[/ingest] unhandled error:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    awsMetadata: err.$metadata,
    cause: err.cause,
  });

  const isDev = process.env['NODE_ENV'] !== 'production';
  return c.json(
    {
      error: 'Internal server error',
      ...(isDev && {
        name: err.name,
        message: err.message,
        stack: err.stack,
        awsMetadata: err.$metadata,
        cause:
          err.cause instanceof Error
            ? {
                name: err.cause.name,
                message: err.cause.message,
                stack: err.cause.stack,
              }
            : err.cause,
      }),
    },
    500,
  );
}
