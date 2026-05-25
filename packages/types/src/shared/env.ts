/**
 * Shared env-var validation helpers.
 *
 * `portSchema` is the canonical TCP port range used by every Node service in
 * the monorepo when validating `*_PORT` env vars. Apps wrap it in their own
 * string-default/transform chains as needed.
 */

import { z } from 'zod';

export const portSchema = z.coerce.number().int().min(1).max(65535);
