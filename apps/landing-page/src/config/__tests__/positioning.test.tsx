import { OgCard } from '@/components/og/OgCard';
import {
  HERO,
  STAGES,
  JOIN,
  CHAPTER_COPY,
} from '@zapengine/zap-pilot-story/copy';
import {
  BRAND_NAME,
  SLOGAN,
  SLOGAN_PARTS,
  PUNCHLINE,
  ONE_LINER,
  oneLiner,
  isLive,
} from '@zapengine/zap-pilot-story/brand';
/**
 * Positioning guardrail.
 *
 * Every public claim on the home page, /pitch and in the docs must stay at or
 * below what `CAPABILITIES` (zap-pilot-story/facts/capabilities.ts) records. Copy states
 * liveness only through status badges, retired category words and known false
 * claims stay out, and every docs link resolves.
 *
 * When one fails, change the copy; do not widen the guardrail.
 */
import '@testing-library/jest-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LandingPage from '@/app/page';
import PitchPage from '@/app/pitch/page';
import { CapabilityStatusTable } from '@/components/docs/CapabilityStatusTable';
import { MESSAGES } from '@/config/messages';
import * as PITCH from '@/config/pitch';
import {
  CAPABILITIES,
  STATUS_LABEL,
  capabilityIds,
  type CapabilityId,
  type CapabilityRef,
} from '@zapengine/zap-pilot-story/facts';
import { backtestDisclaimer } from '@/data/backtest-stats';

interface CopyString {
  /** Dotted location, e.g. `HERO.chips.3.text`. */
  readonly path: string;
  /** The section or export the string belongs to. */
  readonly block: string;
  readonly key: string;
  readonly value: string;
  /** Capabilities of the nearest enclosing item that references any. */
  readonly item: readonly CapabilityId[] | null;
}

/** Keys whose values are identifiers or presentation flags, not copy. */
const NON_COPY_KEYS = new Set([
  'capability',
  'badge',
  'tally',
  'icon',
  'id',
  'key',
  'linkType',
  'tone',
]);

function collect(root: unknown, rootPath: string, blockDepth: number) {
  const strings: CopyString[] = [];
  const visit = (
    value: unknown,
    parts: readonly string[],
    item: readonly CapabilityId[] | null,
  ) => {
    if (typeof value === 'string') {
      strings.push({
        path: parts.join('.'),
        block: parts.slice(0, blockDepth).join('.'),
        key: parts[parts.length - 1]!,
        value,
        item,
      });
    } else if (Array.isArray(value) && parts.at(-1) === 'lines') {
      visit(
        value
          .flat()
          .join(' ')
          .replaceAll(/\|[osm]/g, ''),
        parts,
        item,
      );
    } else if (Array.isArray(value)) {
      value.forEach((child, index) =>
        visit(child, [...parts, `${index}`], item),
      );
    } else if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const declared = [
        ...('capability' in record
          ? capabilityIds(record['capability'] as CapabilityRef)
          : []),
        ...('badge' in record
          ? capabilityIds(record['badge'] as CapabilityRef)
          : []),
      ];
      // Only a declared capability re-attributes children. Otherwise `item`
      // passes through, so a top-level null still marks unattributed strings.
      const own = 'capability' in record || 'badge' in record ? declared : item;
      for (const [key, child] of Object.entries(record)) {
        if (!NON_COPY_KEYS.has(key)) visit(child, [...parts, key], own);
      }
    }
  };
  visit(root, [rootPath], null);
  return strings;
}

function referencedIds(value: unknown, ids = new Set<CapabilityId>()) {
  if (Array.isArray(value)) {
    for (const child of value) referencedIds(child, ids);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'capability' || key === 'badge') {
        for (const id of capabilityIds(child as CapabilityRef)) ids.add(id);
      } else {
        referencedIds(child, ids);
      }
    }
  }
  return ids;
}

const MESSAGE_STRINGS = collect(MESSAGES, 'MESSAGES', 2);
const PITCH_STRINGS = Object.entries(PITCH).flatMap(([name, value]) =>
  collect(value, name, 1),
);
const CAPABILITY_STRINGS: CopyString[] = (
  Object.keys(CAPABILITIES) as CapabilityId[]
).flatMap((id) =>
  (['label', 'detail'] as const).map((key) => ({
    path: `CAPABILITIES.${id}.${key}`,
    block: `CAPABILITIES.${id}`,
    key,
    value: CAPABILITIES[id][key],
    item: [id],
  })),
);
const STORY = { HERO, STAGES, JOIN, CHAPTER_COPY };
const STORY_STRINGS = Object.entries(STORY).flatMap(([name, value]) =>
  collect(value, name, Array.isArray(value) ? 2 : 1),
);
const BRAND_STRINGS = collect(
  { BRAND_NAME, SLOGAN, PUNCHLINE, ONE_LINER },
  'BRAND',
  1,
);
const COPY = [...MESSAGE_STRINGS, ...PITCH_STRINGS, ...STORY_STRINGS];
const ALL_STRINGS = [...COPY, ...CAPABILITY_STRINGS, ...BRAND_STRINGS];

const BLOCK_REFERENCES = new Map<string, Set<CapabilityId>>([
  ...Object.entries(MESSAGES).map(
    ([name, value]) => [`MESSAGES.${name}`, referencedIds(value)] as const,
  ),
  ...Object.entries(STORY).flatMap(([name, value]) =>
    Array.isArray(value)
      ? value.map((item, i) => [`${name}.${i}`, referencedIds(item)] as const)
      : [[name, referencedIds(value)] as const],
  ),
  ...Object.entries(PITCH).map(
    ([name, value]) => [name, referencedIds(value)] as const,
  ),
]);

function failures(
  strings: readonly CopyString[],
  test: (entry: CopyString) => boolean,
) {
  return strings.filter(test).map((entry) => `${entry.path}: ${entry.value}`);
}

/** Retired category words and claims the code has disproved. */
const CATEGORY_TERMS: readonly RegExp[] = [
  /autopilot/i,
  /robo[- ]?advis/i,
  /blackrock/i,
  /auto-?managed/i,
  /zap strategy/i,
  /net worth/i,
  /no pooled vault/i,
  /standing approvals?/i,
  /\bsigned snapshots?\b/i,
  /rebalance bundle/i,
  /telegram delivers/i,
  /set your own preferences/i,
  /two macro signals/i,
  /\bparking\b/i,
];

const MARKETING_TERMS: readonly RegExp[] = [
  ...CATEGORY_TERMS,
  /\d+ trades in \d+ days/i,
  /\/docs#backtest/,
  /128[,.]?540|\$3,012|\bFGI 72\b|\+14\.2%/,
  /\bondo\b/i,
  /\bAP[RY]\b/,
  /\bearn(?:s|ing)?\b/i,
  /passive income/i,
  /risk[- ]free/i,
  /outperform/i,
  /\bproven\b/i,
  /\bour strateg(?:y|ies)\b/i,
  /the engine decides/i,
  /open the app/i,
  /v2\.zap-pilot\.org/i,
  /AI-powered/i,
  /kokode/i,
  /hackathon/i,
];

/** Copy that only names a capability; whose status the block must render. */
const STATUS_TRIGGERS: readonly (readonly [RegExp, CapabilityId])[] = [
  [/self-host/i, 'self-hosting'],
  [/\byour (?:own )?machine\b/i, 'self-hosting'],
  [/unattended/i, 'unattended-runs'],
  [/\bpolic(?:y|ies)\b/i, 'policy-engine'],
  [/\bversion(?:ed|ing)\b/i, 'strategy-versioning'],
  [/strategy lab|your own strateg/i, 'strategy-lab'],
  [/tokeni[sz]ed|S&P 500/i, 'tokenized-equities'],
  [/rebalance plan/i, 'rebalance-plans'],
  [/\bMac app\b/i, 'local-drift-check'],
  [/\bAI\b/, 'ai-exception-layer'],
  [/withdraw/i, 'withdrawals'],
];

/** The brand line may appear only where a status marker shares the screen. */
const SLOGAN_SCREENS = new Set([
  'HERO.lines',
  'MESSAGES.meta.title',
  'PITCH_META.description',
]);

const LIVE_ALLOWLIST: readonly CapabilityId[] = [
  'reference-strategy',
  'market-signals',
  'portfolio-tracking',
  'dca-benchmark',
  'deposit-plans',
  'pre-sign-checks',
  'wallet-signing',
  'adapter-boundary',
  'no-zap-pilot-vault',
  'device-agent-key',
  'open-source',
];

describe('positioning guardrail: collected copy', () => {
  it('collects the home page, pitch and capability strings', () => {
    for (const prefix of [
      'MESSAGES.',
      'PITCH_',
      'CAPABILITIES.',
      'BRAND.',
      'HERO.',
      'STAGES.',
      'JOIN.',
      'CHAPTER_COPY.',
    ]) {
      expect(ALL_STRINGS.some((entry) => entry.path.startsWith(prefix))).toBe(
        true,
      );
    }
  });

  it('keeps retired categories, disproved claims and unsupported terms out', () => {
    const banned = failures(ALL_STRINGS, ({ key, value }) => {
      const text = value
        .replace(/does not guarantee/gi, '')
        .replace(/\bassum(?:ed|es) an? yield\b|\bassumed yield\b/gi, '');
      return (
        MARKETING_TERMS.some((term) => term.test(text)) ||
        /guarantee/i.test(text) ||
        /\byield/i.test(text) ||
        (key !== 'href' && /\bv1\b/.test(text))
      );
    });
    expect(banned).toEqual([]);
  });

  it('never states liveness in prose; status badges do', () => {
    expect(
      failures(ALL_STRINGS, ({ value }) => /\blive\b/i.test(value)),
    ).toEqual([]);
  });

  it('records exactly the allowlisted capabilities as live', () => {
    const live = (Object.keys(CAPABILITIES) as CapabilityId[]).filter(
      (id) => CAPABILITIES[id].status === 'live',
    );
    expect(new Set(live)).toEqual(new Set(LIVE_ALLOWLIST));
  });

  it('only calls research items pinned', () => {
    expect(
      failures(
        ALL_STRINGS,
        ({ value, item }) =>
          /\bpinned\b/i.test(value) &&
          (item === null ||
            item.some((id) => CAPABILITIES[id].status !== 'research')),
      ),
    ).toEqual([]);
  });

  it('references the capability behind every status-coupled phrase', () => {
    const brandStrings = [SLOGAN, PUNCHLINE, ...Object.values(ONE_LINER)];
    const missing = COPY.flatMap((entry) => {
      const text = brandStrings.reduce(
        (text, brand) => text.replaceAll(brand, ''),
        entry.value,
      );
      const references = BLOCK_REFERENCES.get(entry.block)!;
      return STATUS_TRIGGERS.filter(
        ([trigger, id]) => trigger.test(text) && !references.has(id),
      ).map(([, id]) => `${entry.path} needs ${id}: ${entry.value}`);
    });
    expect(missing).toEqual([]);
  });

  it('keeps the brand line to the hero, metadata and pitch cover', () => {
    expect(
      failures(
        COPY,
        ({ path: location, value }) =>
          value.includes(SLOGAN) && !SLOGAN_SCREENS.has(location),
      ),
    ).toEqual([]);
    for (const part of SLOGAN_PARTS.map((part) => `Your ${part.word}`)) {
      expect(
        failures(
          COPY,
          ({ path: location, value }) =>
            value === part && !SLOGAN_SCREENS.has(location),
        ),
      ).toEqual([]);
    }
  });

  it('leaves no placeholders', () => {
    expect(
      failures(ALL_STRINGS, ({ value }) =>
        /\bTODO\b|\bTBD\b|lorem/i.test(value),
      ),
    ).toEqual([]);
  });

  it('keeps the backtest disclaimer on the shared proof section', () => {
    expect(MESSAGES.backtest.disclaimer).toBe(backtestDisclaimer());
    expect(MESSAGES.backtest.disclaimer).toContain(
      'Past performance does not guarantee future results.',
    );
  });
});

function renderedBadges(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-capability]'));
}

function badgeMismatches(container: HTMLElement) {
  return renderedBadges(container).flatMap((badge) => {
    const ids = badge.getAttribute('data-capability')!.split(' ');
    return ids
      .filter(
        (id) =>
          STATUS_LABEL[CAPABILITIES[id as CapabilityId].status] !==
          badge.textContent,
      )
      .map((id) => `${id}: ${badge.textContent}`);
  });
}

function renderedIds(container: HTMLElement) {
  return new Set(
    renderedBadges(container).flatMap((badge) =>
      badge.getAttribute('data-capability')!.split(' '),
    ),
  );
}

describe('positioning guardrail: rendered status badges', () => {
  it('renders every capability the home page copy references, with its label', () => {
    const { container } = render(<LandingPage />);
    expect(badgeMismatches(container)).toEqual([]);
    const shown = renderedIds(container);
    // Motion replaces the v2 sections; independently enumerate its displayed capability claims.
    const expected: CapabilityId[] = [
      'reference-strategy',
      'market-signals',
      'wallet-signing',
      'pre-sign-checks',
      'rebalance-plans',
      'self-hosting',
      'tokenized-equities',
      'policy-engine',
      'unattended-runs',
    ];
    const missing = expected.filter((id) => !shown.has(id));
    expect(missing).toEqual([]);
  });

  it('renders every capability the pitch copy references, with its label', () => {
    const { container } = render(<PitchPage />);
    expect(badgeMismatches(container)).toEqual([]);
    const shown = renderedIds(container);
    const missing = [...referencedIds([PITCH, HERO.chips])].filter(
      (id) => !shown.has(id),
    );
    expect(missing).toEqual([]);
  });

  it('shows a status marker wherever the brand line headlines a screen', () => {
    const landing = render(<LandingPage />).container;
    expect(
      landing.querySelector('#engine [data-capability~="self-hosting"]'),
    ).not.toBeNull();
    if (!isLive('self-hosting'))
      expect(
        landing.querySelector('#engine h1 [data-style="o"]'),
      ).toHaveTextContent('machine.');
    for (const label of ['Home', 'Pitch']) {
      const og = render(
        <OgCard label={label} url="zap-pilot.org" footer="Open source" />,
      ).container;
      expect(
        og.querySelector('[data-capability~="self-hosting"]'),
      ).not.toBeNull();
    }
    const pitch = render(<PitchPage />).container;
    expect(
      pitch.querySelector('#slide-cover [data-capability~="self-hosting"]'),
    ).not.toBeNull();
  });

  it('renders every capability in the docs status table', () => {
    const { container } = render(<CapabilityStatusTable />);
    expect(badgeMismatches(container)).toEqual([]);
    const shown = renderedIds(container);
    expect(
      (Object.keys(CAPABILITIES) as CapabilityId[]).filter(
        (id) => !shown.has(id),
      ),
    ).toEqual([]);
  });
});

const DOCS_ROOT = path.resolve(import.meta.dirname, '../../../content/docs');

function mdxFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return mdxFiles(full);
    return name.endsWith('.mdx') ? [full] : [];
  });
}

const MDX = mdxFiles(DOCS_ROOT).map((file) => ({
  file: path.relative(DOCS_ROOT, file),
  source: readFileSync(file, 'utf8'),
}));

function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function headingAnchors(source: string): Set<string> {
  const withoutCode = source.replace(/```[\s\S]*?```/g, '');
  return new Set(
    [...withoutCode.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) =>
      slug(match[1]!),
    ),
  );
}

function docsFile(route: string): string | undefined {
  const relative = route.replace(/^\/docs\/?/, '').replace(/\/$/, '');
  const candidates = relative
    ? [`${relative}.mdx`, `${relative}/index.mdx`]
    : ['index.mdx'];
  return MDX.find((doc) => candidates.includes(doc.file))?.source;
}

function brokenDocsLinks(links: readonly string[]) {
  return links.filter((link) => {
    const [route, anchor] = link.split('#') as [string, string | undefined];
    const source = docsFile(route);
    if (source === undefined) return true;
    return anchor !== undefined && !headingAnchors(source).has(anchor);
  });
}

describe('positioning guardrail: docs', () => {
  it('finds the docs content', () => {
    expect(MDX.map((doc) => doc.file)).toEqual(
      expect.arrayContaining([
        'index.mdx',
        'how-it-works.mdx',
        'architecture.mdx',
        'track-record/dma-fgi-portfolio-rules-v1.mdx',
      ]),
    );
  });

  it('resolves every /docs link in the copy to a page and heading', () => {
    const links = COPY.map((entry) => entry.value).filter((value) =>
      value.startsWith('/docs'),
    );
    expect(links.length).toBeGreaterThan(0);
    expect(brokenDocsLinks(links)).toEqual([]);
  });

  it('resolves every /docs link inside the docs to a page and heading', () => {
    const links = MDX.flatMap(({ source }) => [
      ...[...source.matchAll(/\]\((\/docs[^)\s]*)\)/g)].map((m) => m[1]!),
      ...[...source.matchAll(/href="(\/docs[^"]*)"/g)].map((m) => m[1]!),
    ]);
    expect(links.length).toBeGreaterThan(0);
    expect(brokenDocsLinks(links)).toEqual([]);
  });

  it('keeps retired categories and disproved claims out of the docs', () => {
    const hits = MDX.flatMap(({ file, source }) =>
      CATEGORY_TERMS.filter((term) => term.test(source)).map(
        (term) => `${file}: ${term}`,
      ),
    );
    expect(hits).toEqual([]);
  });
});

describe('status-bound brand identity', () => {
  it('uses the canonical one-liner in copy, docs and README', () => {
    const sources = [
      ...COPY.map((entry) => entry.value),
      ...MDX.map((doc) => doc.source),
      readFileSync(
        path.resolve(import.meta.dirname, '../../../../../README.md'),
        'utf8',
      ),
    ];
    const lines = sources.flatMap((source) =>
      [...source.matchAll(/Zap Pilot is [^.!?\n]*runtime[^.!?\n]*[.!?]/g)].map(
        (match) => match[0],
      ),
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter((line) => line !== oneLiner())).toEqual([]);
  });
});
