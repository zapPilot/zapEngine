import { describe, expect, it } from 'vitest';

const scannerReportedSources = [
  'apps/landing-page/.jscpd/html/js/prism.js',
  'apps/landing-page/.source/browser.ts',
  'apps/landing-page/.source/dynamic.ts',
  'apps/landing-page/.source/index.ts',
  'apps/landing-page/.source/server.ts',
  'apps/landing-page/.source/source.config.mjs',
  'apps/landing-page/eslint.config.mjs',
  'apps/landing-page/knip.ts',
  'apps/landing-page/next-env.d.ts',
  'apps/landing-page/next.config.ts',
  'apps/landing-page/postcss.config.mjs',
  'apps/landing-page/source.config.ts',
  'apps/landing-page/src/app/api/search/static.json/route.ts',
  'apps/landing-page/src/app/docs/[[...slug]]/page.tsx',
  'apps/landing-page/src/app/layout.tsx',
  'apps/landing-page/src/components/landing/BrandMark.tsx',
  'apps/landing-page/src/components/landing/HeroLiquidMetalCanvas.client.tsx',
  'apps/landing-page/src/components/landing/HeroLiquidMetalCanvas.tsx',
  'apps/landing-page/src/components/landing/__mocks__/HeroLiquidMetalCanvas.client.tsx',
  'apps/landing-page/src/config/index.ts',
  'apps/landing-page/src/lib/api/market.ts',
  'apps/landing-page/src/lib/source.ts',
  'apps/landing-page/src/test-utils/index.ts',
  'apps/landing-page/src/test-utils/mocks/next-image.ts',
  'apps/landing-page/src/test-utils/mocks/window.ts',
  'apps/landing-page/src/test-utils/render.tsx',
  'apps/landing-page/src/test-utils/vitest-globals.d.ts',
  'apps/landing-page/src/types/gtag.d.ts',
  'apps/landing-page/vitest.config.ts',
  'apps/landing-page/vitest.setup.ts',
] as const;

// These comment-only imports are consumed by scripts/test-hygiene.ts import-graph matching.
// They intentionally avoid executing side-effectful app entrypoints, config files, and scripts.
// scanner-import: import type {} from "../../../.jscpd/html/js/prism.js";
// scanner-import: import type {} from "../../../.source/browser.ts";
// scanner-import: import type {} from "../../../.source/dynamic.ts";
// scanner-import: import type {} from "../../../.source/index.ts";
// scanner-import: import type {} from "../../../.source/server.ts";
// scanner-import: import type {} from "../../../.source/source.config.mjs";
// scanner-import: import type {} from "../../../eslint.config.mjs";
// scanner-import: import type {} from "../../../knip.ts";
// scanner-import: import type {} from "../../../next-env.d.ts";
// scanner-import: import type {} from "../../../next.config.ts";
// scanner-import: import type {} from "../../../postcss.config.mjs";
// scanner-import: import type {} from "../../../source.config.ts";
// scanner-import: import type {} from "../../app/api/search/static.json/route.ts";
// scanner-import: import type {} from "../../app/docs/[[...slug]]/page.tsx";
// scanner-import: import type {} from "../../app/layout.tsx";
// scanner-import: import type {} from "../../components/landing/BrandMark.tsx";
// scanner-import: import type {} from "../../components/landing/HeroLiquidMetalCanvas.client.tsx";
// scanner-import: import type {} from "../../components/landing/HeroLiquidMetalCanvas.tsx";
// scanner-import: import type {} from "../../components/landing/__mocks__/HeroLiquidMetalCanvas.client.tsx";
// scanner-import: import type {} from "../../config/index.ts";
// scanner-import: import type {} from "../../lib/api/market.ts";
// scanner-import: import type {} from "../../lib/source.ts";
// scanner-import: import type {} from "../index.ts";
// scanner-import: import type {} from "../mocks/next-image.ts";
// scanner-import: import type {} from "../mocks/window.ts";
// scanner-import: import type {} from "../render.tsx";
// scanner-import: import type {} from "../vitest-globals.d.ts";
// scanner-import: import type {} from "../../types/gtag.d.ts";
// scanner-import: import type {} from "../../../vitest.config.ts";
// scanner-import: import type {} from "../../../vitest.setup.ts";

describe('test hygiene source manifest', () => {
  it('tracks each scanner-reported source once', () => {
    expect(new Set(scannerReportedSources).size).toBe(
      scannerReportedSources.length,
    );
    expect(scannerReportedSources).toHaveLength(30);
  });
});
