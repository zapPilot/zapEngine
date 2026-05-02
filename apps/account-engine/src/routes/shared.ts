import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';

import { HttpStatus, toErrorResponse } from '../common/http';

export function validationHook(
  result: {
    success: boolean;
    error?: { issues?: { message?: string }[] };
  },
  c: Context,
) {
  if (result.success) {
    return;
  }

  const message = result.error?.issues?.[0]?.message ?? 'Invalid request';
  return c.json(
    toErrorResponse(c.req.path, {
      message,
      statusCode: HttpStatus.BAD_REQUEST,
    }),
    HttpStatus.BAD_REQUEST,
  );
}

export function jsonValidator<T>(schema: T) {
  return zValidator('json', schema as never, validationHook);
}

export function paramValidator<T>(schema: T) {
  return zValidator('param', schema as never, validationHook);
}

export function jsonResponse<T>(c: Context, payload: T, status: number) {
  return c.json(payload, { status: status as never });
}
