/**
 * Fumadocs static search index.
 *
 * Why `staticGET` + `force-static`:
 *   The landing page builds with `output: 'export'` (see next.config.ts).
 *   Static export disables runtime route handlers, so a regular `GET` would
 *   return 404 in production. `staticGET` instead serializes the Orama
 *   search index at build time; combined with `dynamic = 'force-static'`,
 *   Next.js renders this route as a flat `.json` file under `out/api/search/`,
 *   served by the CDN like any other static asset.
 *
 * The client side wires up to this URL via `RootProvider`'s
 * `search.options = { type: 'static', api: '/api/search' }` in app/layout.tsx.
 */
import { createFromSource } from 'fumadocs-core/search/server';

import { source } from '@/lib/source';

export const dynamic = 'force-static';

export const { staticGET: GET } = createFromSource(source);
