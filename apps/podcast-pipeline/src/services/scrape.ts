import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';

import { runWithDeadline } from '../lib/deadline.js';
import { isPanewsHostname } from '../lib/panews.js';
import type { Article, ArticleImageContext, ImageCandidate } from '../types.js';

export interface ScrapeArticleOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

type JSDOMConsoleError = Error & {
  detail?: unknown;
  type?: string;
};

function createScrapeVirtualConsole(): VirtualConsole {
  const virtualConsole = new VirtualConsole();

  virtualConsole.on('jsdomError', (rawError) => {
    const error = rawError as JSDOMConsoleError;

    if (error.type === 'css parsing') {
      return;
    }

    console.error(error.stack ?? error.message, error.detail);
  });

  return virtualConsole;
}

interface SrcsetCandidate {
  url: string;
  width?: number;
  density?: number;
}

function positiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeHttpUrl(
  rawUrl: string | null | undefined,
  baseUrl: string,
): string | null {
  if (!rawUrl?.trim()) return null;

  try {
    const url = new URL(rawUrl.trim(), baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function parseSrcset(srcset: string): SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];

  for (const rawCandidate of srcset.split(',')) {
    const parts = rawCandidate.trim().split(/\s+/);
    const rawUrl = parts[0];
    if (!rawUrl) continue;

    const descriptor = parts[1];
    if (!descriptor) {
      candidates.push({ url: rawUrl });
      continue;
    }

    const widthMatch = /^(\d+)w$/i.exec(descriptor);
    if (widthMatch) {
      const width = positiveInteger(widthMatch[1]!);
      candidates.push({ url: rawUrl, ...(width ? { width } : {}) });
      continue;
    }

    const densityMatch = /^(\d+(?:\.\d+)?)x$/i.exec(descriptor);
    if (densityMatch) {
      const density = Number(densityMatch[1]);
      candidates.push({
        url: rawUrl,
        ...(Number.isFinite(density) && density > 0 ? { density } : {}),
      });
      continue;
    }

    candidates.push({ url: rawUrl });
  }

  return candidates;
}

function largestCandidateBy<K extends 'width' | 'density'>(
  candidates: readonly SrcsetCandidate[],
  key: K,
): SrcsetCandidate | null {
  let largest: SrcsetCandidate | null = null;
  for (const candidate of candidates) {
    const value = candidate[key];
    if (
      value !== undefined &&
      (largest?.[key] === undefined ||
        value > (largest[key] as NonNullable<(typeof candidate)[K]>))
    ) {
      largest = candidate;
    }
  }
  return largest;
}

function largestSrcsetCandidate(
  image: HTMLImageElement,
): SrcsetCandidate | null {
  const srcsetAttributeNames = [
    'data-srcset',
    'data-lazy-srcset',
    'data-original-srcset',
    'srcset',
  ] as const;

  for (const attributeName of srcsetAttributeNames) {
    const rawSrcset = image.getAttribute(attributeName);
    if (!rawSrcset) continue;

    const candidates = parseSrcset(rawSrcset);
    if (candidates.length === 0) continue;

    const widthCandidate = largestCandidateBy(candidates, 'width');
    if (widthCandidate) return widthCandidate;

    const densityCandidate = largestCandidateBy(candidates, 'density');
    if (densityCandidate) return densityCandidate;

    return candidates.at(-1)!;
  }

  return null;
}

function imageElementCandidate(
  image: HTMLImageElement,
  sourceUrl: string,
): ImageCandidate | null {
  const srcsetCandidate = largestSrcsetCandidate(image);
  const rawImageUrl =
    srcsetCandidate?.url ??
    image.getAttribute('data-src') ??
    image.getAttribute('data-lazy-src') ??
    image.getAttribute('data-original') ??
    image.getAttribute('data-url') ??
    image.getAttribute('src');
  const imageUrl = normalizeHttpUrl(rawImageUrl, sourceUrl);
  if (!imageUrl) return null;

  const figure = image.closest('figure');
  const rawAltText =
    image.getAttribute('alt')?.trim() ||
    figure?.querySelector('figcaption')?.textContent?.trim();
  const width =
    positiveInteger(image.getAttribute('width')) ??
    positiveInteger(image.getAttribute('data-width')) ??
    srcsetCandidate?.width;
  const height =
    positiveInteger(image.getAttribute('height')) ??
    positiveInteger(image.getAttribute('data-height'));

  /* jscpd:ignore-start -- ImageCandidate with optional fields; irreducible spread pattern */
  return {
    imageUrl,
    sourceUrl,
    origin: figure ? 'figure' : 'article',
    ...(rawAltText ? { altText: rawAltText } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
  /* jscpd:ignore-end */
}

function createOpenGraphCandidate(
  content: string | undefined,
  sourceUrl: string,
): ImageCandidate | null {
  const imageUrl = normalizeHttpUrl(content, sourceUrl);
  return imageUrl
    ? {
        imageUrl,
        sourceUrl,
        origin: 'openGraph',
      }
    : null;
}

function applyOpenGraphImageMetadata(
  candidate: ImageCandidate,
  property: string,
  content: string | undefined,
): void {
  if (property === 'og:image:width') {
    const width = positiveInteger(content ?? null);
    if (width) candidate.width = width;
    return;
  }
  if (property === 'og:image:height') {
    const height = positiveInteger(content ?? null);
    if (height) candidate.height = height;
    return;
  }
  if (property === 'og:image:alt' && content) {
    candidate.altText = content;
  }
}

function extractOpenGraphImageCandidates(
  document: Document,
  sourceUrl: string,
): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  let currentCandidate: ImageCandidate | null = null;

  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[property], meta[name]',
  )) {
    const property = (
      meta.getAttribute('property') ?? meta.getAttribute('name')!
    ).toLowerCase();
    const content = meta.getAttribute('content')?.trim();

    if (property === 'og:image' || property === 'og:image:url') {
      currentCandidate = createOpenGraphCandidate(content, sourceUrl);
      if (currentCandidate) candidates.push(currentCandidate);
      continue;
    }

    if (property === 'og:image:secure_url') {
      const secureUrl = normalizeHttpUrl(content, sourceUrl);
      if (secureUrl && currentCandidate) {
        currentCandidate.imageUrl = secureUrl;
      } else if (secureUrl) {
        currentCandidate = {
          imageUrl: secureUrl,
          sourceUrl,
          origin: 'openGraph',
        };
        candidates.push(currentCandidate);
      }
      continue;
    }

    if (!currentCandidate) continue;
    applyOpenGraphImageMetadata(currentCandidate, property, content);
  }

  return candidates;
}

function deduplicateImageCandidates(
  candidates: readonly ImageCandidate[],
): ImageCandidate[] {
  const deduplicated = new Map<string, ImageCandidate>();

  for (const candidate of candidates) {
    const existing = deduplicated.get(candidate.imageUrl);
    if (!existing) {
      deduplicated.set(candidate.imageUrl, { ...candidate });
      continue;
    }

    if (!existing.altText && candidate.altText) {
      existing.altText = candidate.altText;
    }
    if (!existing.width && candidate.width) existing.width = candidate.width;
    if (!existing.height && candidate.height) {
      existing.height = candidate.height;
    }
  }

  return [...deduplicated.values()];
}

type ArticleContextEntry =
  | { kind: 'text' | 'heading'; text: string }
  | { kind: 'image'; image: HTMLImageElement; characters: number };

function contextNodeText(node: Node): string {
  return (node as Text).data.replace(/\s+/gu, ' ');
}

function articleContextBlock(node: Node): Element {
  return node.parentElement!.closest(
    'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,div,section,article,main,body',
  )!;
}

function articleImageContexts(
  document: Document,
): Map<HTMLImageElement, ArticleImageContext> {
  const container =
    document.querySelector('article') ??
    document.querySelector('main') ??
    document.body;
  const { entries, characters } = collectArticleContextEntries(
    document,
    container,
  );
  const contexts = new Map<HTMLImageElement, ArticleImageContext>();
  let heading = '';
  const adjacent = (index: number, direction: number): string => {
    const paragraphs: string[] = [];
    for (
      let cursor = index + direction;
      cursor >= 0 && cursor < entries.length;
      cursor += direction
    ) {
      const entry = entries[cursor]!;
      if (entry.kind === 'heading') break;
      if (entry.kind !== 'text') continue;
      paragraphs.push(entry.text.trim());
      if (paragraphs.length === 2) break;
    }
    if (direction < 0) paragraphs.reverse();
    return paragraphs.join(' ').slice(0, 200);
  };
  for (const [index, entry] of entries.entries()) {
    if (entry.kind === 'heading') heading = entry.text.trim().slice(0, 80);
    if (entry.kind !== 'image') continue;
    contexts.set(entry.image, {
      position: characters ? entry.characters / characters : null,
      heading,
      precedingText: adjacent(index, -1),
      followingText: adjacent(index, 1),
      caption:
        entry.image
          .closest('figure')
          ?.querySelector('figcaption')
          ?.textContent?.replace(/\s+/gu, ' ')
          .trim()
          .slice(0, 200) ?? '',
    });
  }
  return contexts;
}

export function extractArticleImageCandidates(
  document: Document,
  sourceUrl: string,
): ImageCandidate[] {
  const normalizedSourceUrl = normalizeHttpUrl(sourceUrl, sourceUrl);
  if (!normalizedSourceUrl || typeof document.querySelectorAll !== 'function') {
    return [];
  }

  const contexts = articleImageContexts(document);
  const candidates = extractOpenGraphImageCandidates(
    document,
    normalizedSourceUrl,
  );
  for (const image of document.querySelectorAll<HTMLImageElement>(
    'article img, figure img',
  )) {
    const candidate = imageElementCandidate(image, normalizedSourceUrl);
    if (candidate)
      candidates.push({
        ...candidate,
        context: contexts.get(image) ?? {
          position: null,
          heading: '',
          precedingText: '',
          followingText: '',
          caption:
            image
              .closest('figure')
              ?.querySelector('figcaption')
              ?.textContent?.trim()
              .slice(0, 200) ?? '',
        },
      });
  }

  return deduplicateImageCandidates(candidates);
}

function isPanewsArticleUrl(value: string): boolean {
  const parsed = new URL(value);
  return (
    isPanewsHostname(parsed.hostname) &&
    /(?:^|\/)articles(?:\/|$)/.test(parsed.pathname)
  );
}

function assertPanewsArticleDocument(document: Document, url: string): void {
  if (!isPanewsArticleUrl(url) || document.querySelector('article')) return;

  // PANews serves deleted article routes as HTTP 200 with its generic
  // recommendations page. Readability can parse that shell as article text,
  // so require the real article container before any content extraction.
  throw new Error('PANews article is unavailable');
}

export async function scrapeArticle(
  url: string,
  options: ScrapeArticleOptions = {},
): Promise<Article> {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error(`Failed to parse URL from ${String(url)}`);
  }
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Failed to parse URL from ${String(url)}`);
    }
  } catch {
    throw new Error(`Failed to parse URL from ${String(url)}`);
  }
  const html = await fetchArticleHtml(url, options);
  options.signal?.throwIfAborted();
  const dom = new JSDOM(html, {
    url,
    virtualConsole: createScrapeVirtualConsole(),
  });

  try {
    assertPanewsArticleDocument(dom.window.document, url);
    const images = extractArticleImageCandidates(dom.window.document, url);
    const article = new Readability(dom.window.document).parse();
    const title =
      article?.title?.trim() || dom.window.document.title?.trim() || 'Untitled';
    const text = article?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    if (!text) {
      throw new Error('No readable article text found');
    }

    return { title, text, ...(images.length > 0 ? { images } : {}) };
  } finally {
    dom.window.close();
  }
}

async function fetchArticleHtml(
  url: string,
  options: ScrapeArticleOptions,
): Promise<string> {
  const request = async (signal?: AbortSignal): Promise<string> => {
    const response = await fetch(url, {
      headers: {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent':
          'Mozilla/5.0 (compatible; AI Podcast POC/0.1; +https://localhost)',
      },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch article: ${response.status} ${response.statusText}`,
      );
    }
    return response.text();
  };

  if (options.timeoutMs === undefined) {
    options.signal?.throwIfAborted();
    return request(options.signal);
  }
  return runWithDeadline(
    request,
    options.signal,
    options.timeoutMs,
    'Article scrape',
  );
}

function collectArticleContextEntries(
  document: Document,
  container: Element,
): { entries: ArticleContextEntry[]; characters: number } {
  const entries: ArticleContextEntry[] = [];
  const walker = document.createTreeWalker(container, 0xffffffff, {
    acceptNode: (node) =>
      node.nodeType === 1 &&
      /^(SCRIPT|STYLE|TEMPLATE)$/u.test((node as Element).tagName)
        ? 2
        : 1,
  });
  let characters = 0;
  let lastBlock: Element | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === 1 && (node as Element).tagName === 'IMG') {
      entries.push({
        kind: 'image',
        image: node as HTMLImageElement,
        characters,
      });
      lastBlock = null;
    } else if (node.nodeType === 3) {
      const text = contextNodeText(node);
      const block = articleContextBlock(node);
      const kind =
        block && /^H[1-6]$/u.test(block.tagName) ? 'heading' : 'text';
      const previous = entries.at(-1);
      if (block === lastBlock && previous?.kind === kind) previous.text += text;
      else if (text.trim()) entries.push({ kind, text });
      else continue;
      lastBlock = block;
      characters += text.replace(/\s/gu, '').length;
    }
  }
  return { entries, characters };
}
