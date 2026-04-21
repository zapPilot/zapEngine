import { defineDocs, defineConfig } from 'fumadocs-mdx/config';

const _docs = defineDocs({
  dir: 'content/docs',
});

// Export as unknown to avoid TS2742 (inferred type references internal zod types)
export const docs: unknown = _docs;

export default defineConfig();
