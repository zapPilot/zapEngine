import type { ImageCandidate, ImageCandidateOrigin } from '../../types.js';

export const DEFAULT_BLOCKED_IMAGE_HOSTNAMES = [
  'bing.com',
  'bing.net',
] as const;

export const DEFAULT_BLOCKED_IMAGE_EXTENSIONS = [
  '.bmp',
  '.gif',
  '.ico',
  '.svg',
  '.tif',
  '.tiff',
] as const;

export type ImageCandidateValidationCode =
  | 'invalid-image-url'
  | 'insecure-image-url'
  | 'blocked-image-host'
  | 'blocked-image-extension'
  | 'invalid-source-url'
  | 'disallowed-origin'
  | 'invalid-dimensions'
  | 'missing-dimensions'
  | 'image-too-narrow'
  | 'image-too-short'
  | 'image-long-edge-too-small'
  | 'image-short-edge-too-small'
  | 'aspect-ratio-out-of-range'
  | 'duplicate-image'
  | 'candidate-limit';

export interface ImageCandidateValidationIssue {
  code: ImageCandidateValidationCode;
  message: string;
}

export interface ImageCandidateValidationPolicy {
  allowedOrigins?: readonly ImageCandidateOrigin[];
  blockedHostnames?: readonly string[];
  blockedExtensions?: readonly string[];
  requireDimensions?: boolean;
  minWidth?: number;
  minHeight?: number;
  minLongEdge?: number;
  minShortEdge?: number;
  minAspectRatio?: number;
  maxAspectRatio?: number;
}

export interface ImageCandidateValidationResult {
  candidate: ImageCandidate;
  valid: boolean;
  issues: ImageCandidateValidationIssue[];
}

export interface ImageCandidateFilterOptions extends ImageCandidateValidationPolicy {
  deduplicate?: boolean;
  maxCandidates?: number;
}

export interface RejectedImageCandidate {
  candidate: ImageCandidate;
  issues: ImageCandidateValidationIssue[];
}

export interface PartitionedImageCandidates {
  accepted: ImageCandidate[];
  rejected: RejectedImageCandidate[];
}

/* jscpd:ignore-start -- URL validation function; irreducible by design (differs from normalizedWebUrl in return type and input) */
function parseWebUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}
/* jscpd:ignore-end */

function normalizedSuffix(value: string): string {
  const lowerCase = value.trim().toLowerCase();
  if (!lowerCase) return '';
  return lowerCase.startsWith('.') ? lowerCase : `.${lowerCase}`;
}

function imageExtension(url: URL): string | null {
  const filename = url.pathname.split('/').at(-1) ?? '';
  const match = /(\.[a-z\d]+)$/i.exec(filename);
  return match?.[1]?.toLowerCase() ?? null;
}

function isBlockedHostname(
  hostname: string,
  blockedHostnames: readonly string[],
): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '');
  return blockedHostnames.some((blockedHostname) => {
    const blocked = blockedHostname
      .trim()
      .toLowerCase()
      .replace(/^\*\./, '')
      .replace(/\.$/, '');
    return (
      blocked !== '' &&
      (normalizedHostname === blocked ||
        normalizedHostname.endsWith(`.${blocked}`))
    );
  });
}

function hasValidDimension(value: number | undefined): boolean {
  return (
    value === undefined ||
    (Number.isInteger(value) && Number.isFinite(value) && value > 0)
  );
}

function addDimensionIssues(
  candidate: ImageCandidate,
  policy: ImageCandidateValidationPolicy,
  issues: ImageCandidateValidationIssue[],
): void {
  const { width, height } = candidate;
  if (!hasValidDimension(width) || !hasValidDimension(height)) {
    issues.push({
      code: 'invalid-dimensions',
      message: 'Image dimensions must be positive integers when provided',
    });
    return;
  }

  const dimensionPolicyIsActive =
    policy.requireDimensions === true ||
    policy.minWidth !== undefined ||
    policy.minHeight !== undefined ||
    policy.minLongEdge !== undefined ||
    policy.minShortEdge !== undefined ||
    policy.minAspectRatio !== undefined ||
    policy.maxAspectRatio !== undefined;
  if (
    dimensionPolicyIsActive &&
    (width === undefined || height === undefined)
  ) {
    issues.push({
      code: 'missing-dimensions',
      message: 'Image dimensions are required by the active quality policy',
    });
    return;
  }
  if (width === undefined || height === undefined) return;

  if (policy.minWidth !== undefined && width < policy.minWidth) {
    issues.push({
      code: 'image-too-narrow',
      message: `Image width is ${width}px; ${policy.minWidth}px is required`,
    });
  }
  if (policy.minHeight !== undefined && height < policy.minHeight) {
    issues.push({
      code: 'image-too-short',
      message: `Image height is ${height}px; ${policy.minHeight}px is required`,
    });
  }

  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (policy.minLongEdge !== undefined && longEdge < policy.minLongEdge) {
    issues.push({
      code: 'image-long-edge-too-small',
      message: `Image long edge is ${longEdge}px; ${policy.minLongEdge}px is required`,
    });
  }
  if (policy.minShortEdge !== undefined && shortEdge < policy.minShortEdge) {
    issues.push({
      code: 'image-short-edge-too-small',
      message: `Image short edge is ${shortEdge}px; ${policy.minShortEdge}px is required`,
    });
  }

  const aspectRatio = width / height;
  if (
    (policy.minAspectRatio !== undefined &&
      aspectRatio < policy.minAspectRatio) ||
    (policy.maxAspectRatio !== undefined && aspectRatio > policy.maxAspectRatio)
  ) {
    issues.push({
      code: 'aspect-ratio-out-of-range',
      message: `Image aspect ratio ${aspectRatio.toFixed(3)} is outside the allowed range`,
    });
  }
}

export function validateImageCandidate(
  candidate: ImageCandidate,
  policy: ImageCandidateValidationPolicy = {},
): ImageCandidateValidationResult {
  const issues: ImageCandidateValidationIssue[] = [];
  const imageUrl = parseWebUrl(candidate.imageUrl);
  const sourceUrl = parseWebUrl(candidate.sourceUrl);

  if (!imageUrl) {
    issues.push({
      code: 'invalid-image-url',
      message: 'Image URL must be an HTTP(S) URL without credentials',
    });
  } else {
    if (imageUrl.protocol !== 'https:') {
      issues.push({
        code: 'insecure-image-url',
        message: 'Image URL must use HTTPS',
      });
    }

    const blockedHostnames = [
      ...DEFAULT_BLOCKED_IMAGE_HOSTNAMES,
      ...(policy.blockedHostnames ?? []),
    ];
    if (isBlockedHostname(imageUrl.hostname, blockedHostnames)) {
      issues.push({
        code: 'blocked-image-host',
        message: `Image host ${imageUrl.hostname} is blocked`,
      });
    }

    const extension = imageExtension(imageUrl);
    const blockedExtensions = new Set(
      [
        ...DEFAULT_BLOCKED_IMAGE_EXTENSIONS,
        ...(policy.blockedExtensions ?? []),
      ].map(normalizedSuffix),
    );
    if (extension && blockedExtensions.has(extension)) {
      issues.push({
        code: 'blocked-image-extension',
        message: `Image extension ${extension} is not supported`,
      });
    }
  }

  if (!sourceUrl) {
    issues.push({
      code: 'invalid-source-url',
      message: 'Source URL must be an HTTP(S) URL without credentials',
    });
  }

  if (
    policy.allowedOrigins &&
    !policy.allowedOrigins.includes(candidate.origin)
  ) {
    issues.push({
      code: 'disallowed-origin',
      message: `Image origin ${candidate.origin} is not allowed`,
    });
  }

  addDimensionIssues(candidate, policy, issues);

  return {
    candidate,
    valid: issues.length === 0,
    issues,
  };
}

function canonicalImageUrl(candidate: ImageCandidate): string {
  const url = new URL(candidate.imageUrl);
  url.hash = '';
  return url.href;
}

export function partitionImageCandidates(
  candidates: readonly ImageCandidate[],
  options: ImageCandidateFilterOptions = {},
): PartitionedImageCandidates {
  const accepted: ImageCandidate[] = [];
  const rejected: RejectedImageCandidate[] = [];
  const seenImageUrls = new Set<string>();
  const shouldDeduplicate = options.deduplicate !== false;
  const maxCandidates = options.maxCandidates ?? Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const validation = validateImageCandidate(candidate, options);
    if (!validation.valid) {
      rejected.push({ candidate, issues: validation.issues });
      continue;
    }

    const canonicalUrl = canonicalImageUrl(candidate);
    if (shouldDeduplicate && seenImageUrls.has(canonicalUrl)) {
      rejected.push({
        candidate,
        issues: [
          {
            code: 'duplicate-image',
            message: 'Image URL duplicates an earlier candidate',
          },
        ],
      });
      continue;
    }
    seenImageUrls.add(canonicalUrl);

    if (accepted.length >= maxCandidates) {
      rejected.push({
        candidate,
        issues: [
          {
            code: 'candidate-limit',
            message: `Image candidate limit of ${maxCandidates} was reached`,
          },
        ],
      });
      continue;
    }
    accepted.push(candidate);
  }

  return { accepted, rejected };
}

export function filterImageCandidates(
  candidates: readonly ImageCandidate[],
  options: ImageCandidateFilterOptions = {},
): ImageCandidate[] {
  return partitionImageCandidates(candidates, options).accepted;
}
