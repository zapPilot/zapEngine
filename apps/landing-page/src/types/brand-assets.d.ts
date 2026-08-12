/**
 * webpack-side half of the shared brand registry. `@zapengine/brand-assets`
 * ships plain PNGs with no ambient declaration of its own, because each bundler
 * turns them into a different value — Next.js produces `StaticImageData`, Metro
 * produces an opaque asset reference. Declaring it here keeps that difference
 * where it belongs.
 *
 * `next-env.d.ts` would cover this via `next/image-types/global`, but it is
 * generated rather than committed, so type-check cannot depend on it.
 */
declare module '@zapengine/brand-assets/assets/*.png' {
  import type { StaticImageData } from 'next/image';

  const content: StaticImageData;
  export default content;
}
