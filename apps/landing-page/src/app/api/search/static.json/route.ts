/**
 * Fumadocs static search index.
 *
 * The landing page builds with `output: 'export'`, so search must be emitted
 * as a static JSON asset. The Fumadocs client fetches the configured `api`
 * option verbatim for static search; mounting this route at
 * `/api/search/static.json` produces `out/api/search/static.json`.
 */
import { createFromSource } from 'fumadocs-core/search/server';

import { source } from '@/lib/source';

export const dynamic = 'force-static';

export const { staticGET: GET } = createFromSource(source);
