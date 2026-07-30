import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import type { z } from 'zod';

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

export function jsonValidator<T extends z.ZodType>(schema: T) {
  return zValidator('json', schema, validationHook);
}

export function paramValidator<T extends z.ZodType>(schema: T) {
  return zValidator('param', schema, validationHook);
}

export function jsonResponse<T>(
  c: Context,
  payload: T,
  status: (typeof HttpStatus)[keyof typeof HttpStatus],
) {
  return c.json(payload, { status });
}
