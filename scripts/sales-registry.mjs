/**
 * Product registry for `pnpm sales:render <product>`.
 *
 * Single source of the product → artifacts map. The renderers themselves
 * own their locales: PDF decks own theirs in
 * `apps/kokode-ai/scripts/export-pitch-pdf.mjs`, video languages own theirs
 * in `apps/video/src/videos/catalog.ts`. This file only says which existing
 * renderers belong to which product, and where their outputs land so the
 * orchestrator can summarise them.
 *
 * zap-pilot has no PDF exporter (landing /pitch ships no PDF), so its entry
 * is video-only by repository truth, not by omission.
 *
 * @typedef {object} PdfEntry
 * @property {string} filter pnpm workspace filter owning the renderer.
 * @property {string} script Workspace script that rebuilds the PDFs (free).
 * @property {string} outDir Repo-relative output directory, for the summary.
 *
 * @typedef {object} ProductEntry
 * @property {string} label Human-readable name for the summary header.
 * @property {PdfEntry | null} pdf Null when the product has no PDF renderer.
 * @property {{filter:string,script:string,secrets:string[],manifest:string} | null} publish
 * @property {string[]} videos Video ids in `apps/video/src/videos/catalog.ts`.
 */

/** @type {Record<string, ProductEntry>} */
export const PRODUCTS = {
  kokode: {
    label: 'KOKODE',
    publish: {
      filter: '@zapengine/kokode-ai',
      script: 'media:publish',
      secrets: ['bash', 'apps/kokode-ai/scripts/infisical.sh', 'kokode', '--'],
      manifest: 'apps/kokode-ai/src/media/published.json',
    },
    pdf: {
      filter: '@zapengine/kokode-ai',
      script: 'pitch:pdf',
      outDir: 'apps/kokode-ai/output',
    },
    videos: ['kokode-clinic'],
  },
  'zap-pilot': {
    label: 'ZAP PILOT',
    // Zap Pilot has no media host/manifest yet; shared core is ready for adoption.
    publish: null,
    pdf: null,
    videos: ['calculator-pitch'],
  },
};

/** Product names accepted by `pnpm sales:render <product>`. */
export const productNames = Object.keys(PRODUCTS);

/**
 * @param {string | undefined} name
 * @returns {ProductEntry}
 * @throws {Error} With usage text when the product is unknown.
 */
export function getProduct(name) {
  const entry = typeof name === 'string' ? PRODUCTS[name] : undefined;
  if (entry === undefined) {
    throw new Error(
      `Expected exactly one product: ${productNames.join(', ')}. Got: ${name ?? '(none)'}`,
    );
  }
  return entry;
}
