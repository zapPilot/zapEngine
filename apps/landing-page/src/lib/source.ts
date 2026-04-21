import { loader } from 'fumadocs-core/source';
import { docs as _docs } from '../../.source';

// Cast to any to avoid TS2742 errors from fumadocs internal types
const docs = _docs as { toFumadocsSource: () => unknown };

const _source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource() as Parameters<typeof loader>[0]['source'],
});

// Use ReturnType<typeof loader> as explicit type to avoid TS2742
export type SourceType = ReturnType<typeof loader>;
export const source = _source as SourceType;
